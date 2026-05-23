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

The container is reported `healthy` only once at least one provider key resolves (it probes
`/ready`). Prove a real search end to end with the smoke test (against the running container):

```bash
pnpm smoke          # asserts /ready 200, then a live /v1/search returns ≥1 result
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

### Use it from Claude (MCP)

The MCP server is stdio — the client spawns it and it forwards to the API over HTTP. After
`pnpm build`, register it (leave `INTERNAL_API_TOKEN` unset for local own-use):

Claude Desktop / any MCP client — add to the config:

```json
{
  "mcpServers": {
    "search-router": {
      "command": "node",
      "args": ["/ABS/PATH/to/core/packages/mcp/dist/index.js"],
      "env": { "SEARCH_API_URL": "http://localhost:8787" }
    }
  }
}
```

Claude Code CLI:

```bash
claude mcp add search-router \
  -e SEARCH_API_URL=http://localhost:8787 \
  -- node /ABS/PATH/to/core/packages/mcp/dist/index.js
```

The 8 tools (`web_search`, `answer`, `deep_research`, `scrape_url`, `crawl_site`, `social_search`,
`serp`, `code_docs`) then appear in the client.

## License

MIT — see [LICENSE](./LICENSE).
