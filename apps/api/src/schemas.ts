import type { Intent } from '@search-router/core';
import { z } from 'zod';

/**
 * Server-side request schemas, one per intent. Field names mirror the MCP tool shapes
 * in packages/mcp/src/index.ts (single source of truth); these add the bounds the MCP
 * layer omits — query length cap, maxResults range, url format.
 */

const query = z.string().min(1).max(2000);
const url = z.string().url();
const recency = z.enum(['day', 'week', 'month', 'year']).optional();
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .optional();
const maxResults = z.number().int().min(1).max(50).optional();

const searchSchema = z.object({
  query,
  recency,
  dateStart: dateStr,
  dateEnd: dateStr,
  domains: z.array(z.string()).max(50).optional(),
  maxResults,
  thorough: z.boolean().optional(),
});

const answerSchema = z.object({ query, recency });

const researchSchema = z.object({
  query,
  recency,
  dateStart: dateStr,
  dateEnd: dateStr,
  thorough: z.boolean().optional(),
});

const scrapeSchema = z.object({ url });
const crawlSchema = z.object({ url, maxResults });
const socialSchema = z.object({ query, dateStart: dateStr, dateEnd: dateStr, maxResults });
const serpSchema = z.object({ query, maxResults });
const docsSchema = z.object({ query, library: z.string().max(200).optional() });

export const SCHEMAS: Record<Intent, z.ZodTypeAny> = {
  search: searchSchema,
  answer: answerSchema,
  research: researchSchema,
  scrape: scrapeSchema,
  crawl: crawlSchema,
  social: socialSchema,
  serp: serpSchema,
  docs: docsSchema,
};
