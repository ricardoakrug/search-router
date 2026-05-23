import { MissingCredentialError, type Provider, ProviderError } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

interface FetchJsonOpts extends RequestInit {
  timeoutMs?: number;
}

/** fetch + JSON parse with a timeout, throwing ProviderError on any failure. */
export async function fetchJson<T>(
  provider: Provider,
  url: string,
  opts: FetchJsonOpts = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(provider, `HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new ProviderError(provider, `request failed: ${reason}`, err);
  } finally {
    clearTimeout(timer);
  }
}

export function requireKey(provider: Provider, key: string | undefined): string {
  if (!key) {
    throw new MissingCredentialError(provider);
  }
  return key;
}
