# Multi-stage build for the router API. The MCP server runs locally (stdio), not here.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile || pnpm install
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @search-router/core build \
  && pnpm --filter @search-router/api build \
  && pnpm --filter @search-router/api --prod --legacy deploy /out

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
EXPOSE 8787
CMD ["node", "dist/server.js"]
