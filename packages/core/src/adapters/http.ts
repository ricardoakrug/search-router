import { MissingCredentialError, type Provider, ProviderError } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

interface FetchJsonOpts extends RequestInit {
  timeoutMs?: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// --- Circuit breaker --------------------------------------------------------
// One breaker per provider. After CB_THRESHOLD consecutive failures the circuit
// opens for CB_COOLDOWN_MS; the next call after cooldown is a half-open probe.
// An open circuit throws ProviderError immediately so the pipeline falls through
// to the next provider instead of waiting on a known-bad upstream.

type CircuitState = 'closed' | 'open' | 'half-open';

interface Circuit {
  failures: number;
  state: CircuitState;
  openedAt: number;
}

const circuits = new Map<Provider, Circuit>();

function circuit(provider: Provider): Circuit {
  let c = circuits.get(provider);
  if (!c) {
    c = { failures: 0, state: 'closed', openedAt: 0 };
    circuits.set(provider, c);
  }
  return c;
}

/** Throws when the circuit is open and still cooling down; flips to half-open after. */
function assertCircuitClosed(provider: Provider): void {
  const c = circuit(provider);
  if (c.state === 'open') {
    if (Date.now() - c.openedAt < intEnv('CB_COOLDOWN_MS', 30_000)) {
      throw new ProviderError(provider, 'circuit open');
    }
    c.state = 'half-open';
  }
}

function recordSuccess(provider: Provider): void {
  const c = circuit(provider);
  c.failures = 0;
  c.state = 'closed';
}

function recordFailure(provider: Provider): void {
  const c = circuit(provider);
  c.failures += 1;
  if (c.state === 'half-open' || c.failures >= intEnv('CB_THRESHOLD', 5)) {
    c.state = 'open';
    c.openedAt = Date.now();
  }
}

/** Test seam: reset all breaker state between cases. */
export function _resetCircuits(): void {
  circuits.clear();
}

// --- Retry ------------------------------------------------------------------

/** Transient HTTP statuses worth retrying (429 + 5xx). Other 4xx are terminal. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  const base = intEnv('HTTP_RETRY_BASE_MS', 200);
  const ceiling = base * 2 ** attempt;
  return Math.random() * ceiling; // full jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Raised internally when a response status is retryable; carries the wait hint. */
class RetryableHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * fetch + JSON parse with a timeout, retry-with-backoff on transient failures, and a
 * per-provider circuit breaker. Throws ProviderError on any terminal failure so the
 * router can fall back.
 */
export async function fetchJson<T>(
  provider: Provider,
  url: string,
  opts: FetchJsonOpts = {},
): Promise<T> {
  assertCircuitClosed(provider);

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = opts;
  const maxRetries = Math.max(0, intEnv('HTTP_MAX_RETRIES', 2));
  let lastError: unknown;

  // The breaker tracks call-level outcomes: one failure per exhausted call, not per
  // retry attempt — so retries don't inflate the failure count toward the threshold.
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (isRetryableStatus(res.status)) {
          throw new RetryableHttpError(
            res.status,
            body,
            parseRetryAfter(res.headers.get('retry-after')),
          );
        }
        // Terminal 4xx — do not retry, do not trip the breaker on client errors.
        recordSuccess(provider);
        throw new ProviderError(provider, `HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as T;
      recordSuccess(provider);
      return json;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      lastError = err;
      if (attempt < maxRetries) {
        const wait =
          err instanceof RetryableHttpError && err.retryAfterMs !== undefined
            ? err.retryAfterMs
            : backoffMs(attempt);
        await sleep(wait);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  recordFailure(provider);
  if (lastError instanceof RetryableHttpError) {
    throw new ProviderError(provider, `HTTP ${lastError.status}: ${lastError.body.slice(0, 300)}`);
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ProviderError(provider, `request failed: ${reason}`, lastError);
}

export function requireKey(provider: Provider, key: string | undefined): string {
  if (!key) {
    throw new MissingCredentialError(provider);
  }
  return key;
}
