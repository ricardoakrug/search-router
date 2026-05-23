import { getAdapter } from './adapters/index.js';
import type { Provider, SearchRequest } from './types.js';

/** Per-request USD ceiling. 0 / unset disables the guard. */
function cap(): number {
  return Number(process.env.COST_MAX_USD ?? 0);
}

export function estimateCost(provider: Provider, req: SearchRequest): number {
  return getAdapter(provider).estimateCost(req);
}

/** Whether routing to this provider stays within the per-request budget. */
export function withinBudget(provider: Provider, req: SearchRequest): boolean {
  const max = cap();
  if (max <= 0) return true;
  return estimateCost(provider, req) <= max;
}
