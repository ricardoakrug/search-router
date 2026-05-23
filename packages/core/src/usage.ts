import type { Intent, Provider } from './types.js';

export interface UsageEvent {
  tenantId: string;
  intent: Intent;
  provider: Provider;
  costEst: number;
  latencyMs: number;
  fallbackUsed: boolean;
  ts: string;
}

type UsageSink = (event: UsageEvent) => void;

/** Default sink: structured JSON to stdout. Never carries key material. */
const jsonSink: UsageSink = (event) => {
  console.log(JSON.stringify({ type: 'usage', ...event }));
};

let sink: UsageSink = jsonSink;

/** Swap the sink later (DB / metering pipeline) without touching call sites. */
export function setUsageSink(next: UsageSink): void {
  sink = next;
}

export function usageLog(event: Omit<UsageEvent, 'ts'>): void {
  sink({ ...event, ts: new Date().toISOString() });
}
