import { lookup } from 'node:dns/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UrlNotAllowedError, assertPublicUrl } from '../src/ssrf.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const lookupMock = vi.mocked(lookup);

beforeEach(() => lookupMock.mockReset());

describe('assertPublicUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertPublicUrl('ftp://example.com')).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it('rejects malformed urls', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it.each([
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://169.254.169.254/', // cloud metadata
    'http://[::1]/',
  ])('rejects literal private/loopback ip %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('allows a literal public ip without dns', async () => {
    await expect(assertPublicUrl('http://1.1.1.1/')).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.9', family: 4 }] as never);
    await expect(assertPublicUrl('http://evil.example.com/')).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    await expect(assertPublicUrl('http://example.com/')).resolves.toBeUndefined();
  });

  it('rejects if any resolved address is private (mixed)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(assertPublicUrl('http://mixed.example.com/')).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
  });
});
