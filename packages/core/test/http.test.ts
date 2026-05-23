import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCircuits, fetchJson } from '../src/adapters/http.js';
import { ProviderError } from '../src/types.js';

/** Minimal Response stand-in for the fields fetchJson reads. */
function res(opts: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
  retryAfter?: string;
}) {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'retry-after' ? (opts.retryAfter ?? null) : null),
    },
    json: async () => opts.json ?? {},
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

beforeEach(() => {
  _resetCircuits();
  process.env.HTTP_MAX_RETRIES = '2';
  process.env.HTTP_RETRY_BASE_MS = '1';
  process.env.CB_THRESHOLD = '5';
  process.env.CB_COOLDOWN_MS = '30000';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson resilience', () => {
  it('retries a 5xx then returns the eventual success body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res({ ok: false, status: 503, text: 'down' }))
      .mockResolvedValueOnce(res({ ok: true, status: 200, json: { hit: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchJson<{ hit: boolean }>('exa', 'https://x');
    expect(out).toEqual({ hit: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a terminal 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ok: false, status: 400, text: 'bad' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('brave', 'https://x')).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 and exhausts retries, then throws ProviderError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ok: false, status: 429, text: 'slow' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('tavily', 'https://x')).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('opens the circuit after the threshold and short-circuits without calling fetch', async () => {
    process.env.HTTP_MAX_RETRIES = '0';
    process.env.CB_THRESHOLD = '2';
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('serpapi', 'https://x')).rejects.toBeInstanceOf(ProviderError);
    await expect(fetchJson('serpapi', 'https://x')).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Circuit now open — next call must not reach fetch.
    await expect(fetchJson('serpapi', 'https://x')).rejects.toThrow(/circuit open/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('half-opens after cooldown and closes on a success', async () => {
    process.env.HTTP_MAX_RETRIES = '0';
    process.env.CB_THRESHOLD = '1';
    process.env.CB_COOLDOWN_MS = '0'; // immediately eligible for half-open probe
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(res({ ok: true, status: 200, json: { ok: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('grok', 'https://x')).rejects.toBeInstanceOf(ProviderError); // opens
    const out = await fetchJson<{ ok: number }>('grok', 'https://x'); // half-open probe succeeds
    expect(out).toEqual({ ok: 1 });
  });
});
