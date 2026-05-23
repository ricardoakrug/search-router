/**
 * Quota seam. The OSS default allows everything; the managed layer injects a per-tenant
 * cap check via `setQuotaCheck`. Called after authentication, before the search runs.
 * Mirrors the `Authenticator`/`setAuthenticator` seam.
 */
export interface QuotaResult {
  ok: boolean;
  reason?: string;
}

export type QuotaCheck = (tenantId: string) => Promise<QuotaResult> | QuotaResult;

/** OSS default: no quotas. */
const allowAll: QuotaCheck = () => ({ ok: true });

let quotaCheck: QuotaCheck = allowAll;

export function setQuotaCheck(next: QuotaCheck): void {
  quotaCheck = next;
}

export async function checkQuota(tenantId: string): Promise<QuotaResult> {
  return quotaCheck(tenantId);
}
