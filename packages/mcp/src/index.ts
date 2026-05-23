#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type ZodRawShape, z } from 'zod';

const API_URL = process.env.SEARCH_API_URL ?? 'http://localhost:8787';
const TOKEN = process.env.INTERNAL_API_TOKEN;

const recency = z
  .enum(['day', 'week', 'month', 'year'])
  .optional()
  .describe('Coarse freshness window');
const dateRange = {
  dateStart: z.string().optional().describe('Published-date lower bound (YYYY-MM-DD)'),
  dateEnd: z.string().optional().describe('Published-date upper bound (YYYY-MM-DD)'),
};

/** Each MCP tool maps to one API intent segment; the tool name carries the intent. */
const TOOLS: { name: string; segment: string; description: string; schema: ZodRawShape }[] = [
  {
    name: 'web_search',
    segment: 'search',
    description:
      'General web search. Auto-routes to the best engine (semantic, news, keyword). Set thorough for multi-engine fan-out.',
    schema: {
      query: z.string(),
      recency,
      ...dateRange,
      domains: z.array(z.string()).optional(),
      maxResults: z.number().int().positive().optional(),
      thorough: z.boolean().optional().describe('Fan out across engines and merge'),
    },
  },
  {
    name: 'answer',
    segment: 'answer',
    description: 'Get a cited, synthesized answer to a factual question.',
    schema: { query: z.string(), recency },
  },
  {
    name: 'deep_research',
    segment: 'research',
    description: 'Multi-hop research across sources for a thorough, sourced summary.',
    schema: { query: z.string(), recency, ...dateRange, thorough: z.boolean().optional() },
  },
  {
    name: 'scrape_url',
    segment: 'scrape',
    description: 'Scrape a single URL (JS-rendered) into clean markdown.',
    schema: { url: z.string().url() },
  },
  {
    name: 'crawl_site',
    segment: 'crawl',
    description: 'Crawl a site or section and return content from its pages.',
    schema: { url: z.string().url(), maxResults: z.number().int().positive().optional() },
  },
  {
    name: 'social_search',
    segment: 'social',
    description: 'Search X (Twitter) and the live web for real-time social signal and sentiment.',
    schema: { query: z.string(), ...dateRange, maxResults: z.number().int().positive().optional() },
  },
  {
    name: 'serp',
    segment: 'serp',
    description: 'Structured Google SERP features (organic, shopping, local, knowledge graph).',
    schema: { query: z.string(), maxResults: z.number().int().positive().optional() },
  },
  {
    name: 'code_docs',
    segment: 'docs',
    description: 'Up-to-date, version-specific library/framework documentation and code snippets.',
    schema: {
      query: z.string().describe('What you want to do with the library'),
      library: z.string().optional().describe('Library name, e.g. "next.js"'),
    },
  },
];

async function callApi(segment: string, args: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/v1/${segment}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

const server = new McpServer({ name: 'search-router', version: '0.1.0' });

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.schema },
    async (args: Record<string, unknown>) => {
      try {
        const json = await callApi(tool.segment, args);
        return { content: [{ type: 'text' as const, text: json }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('search-router MCP server running on stdio');
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
