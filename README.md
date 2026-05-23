# search-router

A unified adapter + MCP layer for 8 web-search / research / scrape providers behind a few
intent-named tools. Runs **locally with your own keys** — your queries and keys never leave your
machine. Routing is intent-based by default, with a **pluggable router seam** so you can drop in
your own advanced routing.

Providers: **Exa** (semantic) · **Brave** (fast news/keyword) · **Tavily** (agent research) ·
**Perplexity** (cited answers) · **Firecrawl** (scrape/crawl) · **SerpAPI** (SERP features) ·
**xAI Grok** (live X/social) · **Context7** (library docs).

## Architecture (two-tier)

```
Claude / n8n / your agent
   │ stdio (MCP)              │ HTTP
   ▼                          ▼
 packages/mcp ──HTTP──▶ apps/api (Hono)  →  packages/core
 thin tools             routes /v1/*          default router + 8 adapters + seams
```

- **`packages/core`** — provider adapters, the **default intent router** (intent→provider) behind a
  `setRouter()` injection seam, opt-in fan-out (Exa/Brave/Tavily, URL-dedupe + RRF rerank), cost
  guard, and extension seams (`resolveCreds`, `setUsageSink`, `setRouter`).
- **`apps/api`** — Hono HTTP service, `POST /v1/{search,answer,research,scrape,crawl,social,serp,docs}`,
  `authStub` at the edge, routing metadata + usage log on every response.
- **`packages/mcp`** — stdio MCP server exposing 8 intent tools (`web_search`, `answer`,
  `deep_research`, `scrape_url`, `crawl_site`, `social_search`, `serp`, `code_docs`) → the API.

## Routing

The default router maps each intent (= MCP tool) straight to its primary provider, with fallbacks:

| Intent (tool)            | Primary    | Fallback           |
|--------------------------|------------|--------------------|
| `scrape` / `crawl`       | firecrawl  | tavily, exa        |
| `docs`                   | context7   | exa                |
| `serp`                   | serpapi    | brave              |
| `social`                 | grok       | serpapi, brave     |
| `answer`                 | brave      | perplexity, tavily |
| `research`               | tavily     | perplexity, exa    |
| `search`                 | exa        | brave, tavily      |

It does no query-text or per-query analysis. Want smarter routing (query classification, recency or
domain signals, cost-aware selection)? Plug your own router in — the pipeline call site never changes:

```ts
import { setRouter } from '@search-router/core';

setRouter(async (req) => {
  // your logic → { provider, reason, fallback: [...] }
  return { provider: 'exa', reason: 'my-router', fallback: ['brave', 'tavily'] };
});
```

The seam accepts a sync or async router, so a hosted/LLM classifier fits the same signature.

## Run locally (Docker)

Bring your own provider keys:

```bash
cp env.example .env          # fill in the keys you have
docker compose -f compose.local.yml up --build
# or, without compose:
#   docker build -t search-router .
#   docker run --rm -p 8787:8787 --env-file .env search-router

curl -s localhost:8787/health
curl -s -X POST localhost:8787/v1/search \
  -H 'content-type: application/json' -d '{"query":"blue widgets"}'
```

## Develop

```bash
pnpm install
pnpm build
pnpm test          # routing, fan-out dedupe, fallback, injection seam, tenant seam, no-leak
cp env.example .env  # fill provider keys

pnpm dev:api       # API on :8787
pnpm dev:mcp       # MCP server (talks to SEARCH_API_URL)
```

Point a local MCP client at `node packages/mcp/dist/index.js` with `SEARCH_API_URL` + optional
`INTERNAL_API_TOKEN` in its env.

## License

MIT — see [LICENSE](./LICENSE).
