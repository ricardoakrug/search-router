import type { Provider, SearchRequest } from '../types.js';
import { defaultRouter } from './rules.js';

export interface RouteDecision {
  provider: Provider;
  reason: string;
  /** Ordered providers to try if the primary errors or returns nothing. */
  fallback: Provider[];
}

/**
 * A router maps a request to a provider decision. The OSS core ships a minimal
 * intent-only `defaultRouter`; swap in an advanced router (e.g. a hosted classifier)
 * at runtime with `setRouter` — the pipeline call site never changes. The union
 * return lets a sync default and an async injected router both satisfy the type.
 */
export type Router = (req: SearchRequest) => Promise<RouteDecision> | RouteDecision;

let router: Router = defaultRouter;

/** Swap the router (advanced/managed routing) without touching call sites. */
export function setRouter(next: Router): void {
  router = next;
}

export async function resolveRoute(req: SearchRequest): Promise<RouteDecision> {
  return router(req);
}

export { defaultRouter };
