# syntax=docker/dockerfile:1
# Single-image runtime for the fleet. MODE env decides dashboard vs worker.

FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run --filter '@aiworker/shared' typecheck \
 && bun run --filter '@aiworker/web' build \
 && bun run --cwd apps/api build

FROM oven/bun:1-debian AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/apps/api/dist /app/dist
COPY --from=build /app/apps/api/drizzle /app/drizzle
COPY --from=build /app/apps/web/dist /app/web
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/packages/shared /app/packages/shared
ENV NODE_ENV=production
EXPOSE 3000 3001
ENTRYPOINT ["/usr/bin/tini", "--", "bun", "run", "dist/index.js"]
