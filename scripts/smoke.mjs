#!/usr/bin/env node
// Layered smoke test for a running local API container.
//   1. GET /ready  → 200 (proves at least one provider key is wired)
//   2. POST /v1/search → 200 with a non-empty `items` array (proves a real search works)
// Exits 0 on success, non-zero on any failure. Zero deps (Node 18+ global fetch).
//
//   pnpm smoke                              # against http://localhost:8787
//   SMOKE_BASE_URL=http://host:port pnpm smoke

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_API_TOKEN;
const authHeader = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

function fail(msg) {
  console.error(`✗ smoke: ${msg}`);
  process.exit(1);
}

async function main() {
  // 1. readiness
  let ready;
  try {
    ready = await fetch(`${BASE}/ready`, { headers: authHeader });
  } catch (e) {
    fail(`GET ${BASE}/ready unreachable: ${e.message}`);
  }
  if (ready.status !== 200) {
    fail(`GET /ready returned ${ready.status} (expected 200 — is .env filled with ≥1 provider key?)`);
  }

  // 2. real search
  let res;
  try {
    res = await fetch(`${BASE}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader },
      body: JSON.stringify({ query: 'site reliability engineering' }),
    });
  } catch (e) {
    fail(`POST ${BASE}/v1/search unreachable: ${e.message}`);
  }
  if (res.status !== 200) {
    const text = await res.text().catch(() => '');
    fail(`POST /v1/search returned ${res.status} (expected 200). Body: ${text.slice(0, 300)}`);
  }

  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length < 1) {
    fail(`POST /v1/search returned no items (expected ≥1). Got: ${JSON.stringify(body)?.slice(0, 300)}`);
  }

  const provider = body.routing?.provider ?? 'unknown';
  console.log(`✓ smoke: /ready 200, /v1/search 200 — ${body.items.length} item(s) via "${provider}"`);
  process.exit(0);
}

main();
