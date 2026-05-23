import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

/** Thrown when a target URL is malformed or resolves to a non-public address. */
export class UrlNotAllowedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UrlNotAllowedError';
  }
}

/** ipaddr.js ranges that must never be reachable from a scrape/crawl target. */
const BLOCKED_RANGES = new Set([
  'unspecified', // 0.0.0.0 / ::
  'loopback', // 127.0.0.0/8, ::1
  'private', // 10/8, 172.16/12, 192.168/16, fc00::/7
  'linkLocal', // 169.254/16 (incl. cloud metadata 169.254.169.254), fe80::/10
  'uniqueLocal', // fc00::/7
  'reserved',
  'broadcast',
  'carrierGradeNat', // 100.64/10
]);

function isBlocked(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return true; // unparseable → treat as unsafe
  }
  // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1) to its IPv4 range.
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  return BLOCKED_RANGES.has(parsed.range());
}

/**
 * Reject any URL that is not http(s) or whose host resolves to a private, loopback,
 * link-local, or otherwise non-public address. Resolves the hostname (not just literal
 * parsing) so DNS names pointing at internal IPs are blocked at the edge.
 *
 * Defense-in-depth: scrape/crawl targets are forwarded to an external provider
 * (firecrawl/tavily/exa), not fetched in-process, so this rejects obviously-internal
 * targets early rather than being the sole SSRF barrier. The check is point-in-time —
 * it does not close a TOCTOU/rebinding window against the provider's later fetch.
 */
export async function assertPublicUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlNotAllowedError('invalid url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlNotAllowedError('only http(s) urls are allowed');
  }

  // URL.hostname wraps IPv6 literals in brackets ([::1]); strip them for ipaddr.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Literal IP host: check directly, no DNS.
  if (ipaddr.isValid(host)) {
    if (isBlocked(host)) throw new UrlNotAllowedError('url not allowed');
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new UrlNotAllowedError('host did not resolve');
  }
  if (records.length === 0 || records.some((r) => isBlocked(r.address))) {
    throw new UrlNotAllowedError('url not allowed');
  }
}
