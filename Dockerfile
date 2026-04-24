# syntax=docker/dockerfile:1
# Single-image runtime serving两种入口:
#
#   - gateway(控制面, PLAN-013 S5):compose 以
#       command: ['bun', 'apps/gateway/src/index.ts']
#     启动镜像,监听 3000/tcp(WS 协议)。
#   - worker(数据面):`bun run dist/index.js` 启动,监听 3001/tcp(HTTP)。
#     这是 Dockerfile 默认的 ENTRYPOINT,docker compose 为 gateway 服务显式
#     覆盖 command 字段即可。
#
# Targets:
#   runtime      — slim image (~150 MB). Default; agentic CLIs are not baked
#                  in. Workers still work via the `npx -y` cold fallback, or
#                  by installing the CLI at container-start time.
#   runtime-full — adds pinned npm installs for the four npm-available
#                  agentic CLIs (claude-code / codex / gemini-cli /
#                  qwen-code) plus the Cursor agent (installed via the
#                  official curl-to-bash script since Cursor has no npm
#                  package; FEAT-021 bakes the tarball into the image).
#
# Version constants (FEAT-020 keeps them here as build args; the TS source
# of truth lives at:
#   apps/api/src/worker/executor/engines/claude-code/executor.ts
#   apps/api/src/worker/executor/engines/codex/executor.ts
#   apps/api/src/worker/executor/engines/acp/agents/{gemini,qwen}.ts
# When one of those constants changes, bump the matching ARG below.

FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/cli/package.json apps/cli/
COPY apps/gateway/package.json apps/gateway/
COPY apps/web/package.json apps/web/
COPY packages/fs-layout/package.json packages/fs-layout/
COPY packages/gateway-proto/package.json packages/gateway-proto/
COPY packages/shared/package.json packages/shared/
COPY packages/storage-sqlite/package.json packages/storage-sqlite/
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
# worker bundle(默认入口;dist/index.js)。
COPY --from=build /app/apps/api/dist /app/dist
# drizzle 迁移(fleet + worker)。fleet 供 gateway 用,worker 供 dist/index.js 用。
COPY --from=build /app/packages/storage-sqlite/drizzle /app/drizzle
# web 静态资源已被 PLAN-013 S5 下线(浏览器走 WS),本行保留以便滚动回退。
COPY --from=build /app/apps/web/dist /app/web
# node_modules(monorepo hoist)。
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/packages/storage-sqlite /app/packages/storage-sqlite
# gateway 源码(未 bundle,直接 bun 执行)——compose 以 `bun apps/gateway/src/index.ts` 启动。
COPY --from=build /app/apps/gateway /app/apps/gateway
COPY --from=build /app/packages/fs-layout /app/packages/fs-layout
COPY --from=build /app/packages/gateway-proto /app/packages/gateway-proto
# 根 package.json 定义 workspace,bun 需要它来定位 workspace:* 依赖。
COPY --from=build /app/package.json /app/package.json
# 保留其它 workspace 成员的 package.json(仅 manifest,避免源码增重),
# 否则 bun 会在 workspace glob 解析失败:
#   error: Workspace "apps/api" not found
# apps/api 是 dist bundle,不能只留 package.json——下面 stub 一份最小 json。
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/cli/package.json /app/apps/cli/package.json
COPY --from=build /app/apps/web/package.json /app/apps/web/package.json
ENV NODE_ENV=production
# 3000 = gateway (compose 显式覆盖 command);3001 = worker (默认 ENTRYPOINT)。
EXPOSE 3000 3001
ENTRYPOINT ["/usr/bin/tini", "--", "bun", "run", "dist/index.js"]

# ---- runtime-full ----
#
# Extends the slim runtime with four pinned npm agentic CLIs so workers can
# spawn them without a 30–60s cold `npx` fetch. Versions are build args so
# a bump only touches one file (the workflow passes them explicitly so CI
# stays the single source of truth for "what got baked").
FROM runtime AS runtime-full
ARG CLAUDE_CODE_VERSION=2.1.112
ARG CODEX_VERSION=0.121.0
ARG GEMINI_CLI_VERSION=0.9.0
ARG QWEN_CODE_VERSION=0.0.14
# Install Node.js from the official NodeSource repo (bun doesn't ship one);
# we use `npm` for the `-g` installs so the CLIs are shellable at PATH.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
      "@google/gemini-cli@${GEMINI_CLI_VERSION}" \
      "@qwen-code/qwen-code@${QWEN_CODE_VERSION}" \
 && claude --version \
 && codex --version \
 && gemini --version \
 && qwen --version
# Cursor agent — no npm package; the official curl-to-bash installer unpacks
# a self-contained bundle (cursor-agent is a bash wrapper that locates its
# sibling `node` binary via `realpath $0`) into
# ~/.local/share/cursor-agent/versions/<ver>/ and drops a symlink in
# ~/.local/bin/. We re-symlink /usr/local/bin/cursor-agent at the same
# versioned binary so PATH lookup works from any working directory and user;
# cursor-agent's realpath resolution follows the symlink chain to find the
# versioned directory. `--version` is the build-time sanity gate — a broken
# installer fails the image build instead of shipping a non-functional CLI.
# Uses `bash -euo pipefail` so a CDN failure on the curl side of the pipe
# fails the RUN instead of silently executing an empty script on stdin.
RUN bash -euo pipefail -c '\
      curl -fsSL https://cursor.com/install | bash \
      && ln -sf "$(readlink -f /root/.local/bin/cursor-agent)" /usr/local/bin/cursor-agent \
      && cursor-agent --version'
# Preserve the same ENTRYPOINT as runtime; `--from` order keeps env + layers.
