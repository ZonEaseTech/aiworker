# FEAT-020 Bake npm agentic CLIs into the worker image

- **status**: in_progress
- **priority**: P1
- **owner**: ben
- **createdAt**: 2026-04-23 06:05
- **startedAt**: 2026-04-23 06:20

## Description

`ghcr.io/zoneasetech/aiworker:<tag>` today ships no agentic CLI — every
worker must either `npm install -g` after container start or rely on the
`npx -y` fallback (30–60s cold start per first use). Bake the four
npm-available CLIs into the default image so the engine picker's
`ready / login-required / not-installed` tri-state collapses to
`login-required` in the common case instead of `not-installed`.

Because image size jumps from ~150 MB to ~280–320 MB, publish **two image
tags per build**:

- `aiworker:<sha>` — slim, current behaviour, keeps small deployments cheap.
- `aiworker:<sha>-full` — slim + baked CLIs.

Acceptance:

- `Dockerfile` gains a second final stage (`runtime-full`) that extends
  `runtime` with:
  ```
  RUN npm install -g \
    @anthropic-ai/claude-code@<pin> \
    @openai/codex@<pin> \
    @google/gemini-cli@<pin> \
    @qwen-code/qwen-code@<pin>
  ```
  using the same `DEFAULT_*_CLI_VERSION` constants as source of truth —
  build args pass versions in, Dockerfile doesn't duplicate literals.
- `.github/workflows/build-image.yml` builds + pushes **both** tags in one
  run (second `docker build --target runtime-full --tag *-full` step, same
  buildx cache).
- `scripts/deploy.ts` grows `--image-variant=slim|full` (default `slim`)
  so `deploy install` picks the right tag; `AIWORKER_IMAGE_VARIANT` env
  reads the same setting from the host `.env`.
- `docs/deployment.md` gets a "Slim vs Full image" section:
  - slim is the default (`~150 MB`)
  - full adds four CLIs (`~300 MB`), needs a `docker login ghcr.io` for
    private pull either way
  - operator can switch by changing `AIWORKER_IMAGE_VARIANT` + `deploy
    install` (no rebuild)
- `docs/executor-engines.md` is rewritten per engine:
  - "shipped in `-full` image" marker
  - login / auth flow (unchanged, just restructured)
  - "how to opt out of the baked version": `overrides.cmd.cliVersion` to
    force an `npx -y @pkg@<ver>` fallback
- `ops/compose/docker-compose.yml` accepts `${AIWORKER_IMAGE_VARIANT:-}`
  so the same compose serves both tags.
- GHCR versions listing confirms both tags exist after the next push.

Explicitly out of scope:

- Cursor — opt-in under FEAT-021 because it has no npm package.
- Authentication pre-seeding — FEAT-022.
- multi-arch (arm64 stays P3 — current prod runs amd64 only).

## ActiveForm

Baking agentic CLIs into a `-full` image tag.

## Dependencies

- **blocked by**: (none — can land independently of FEAT-019)
- **blocks**: FEAT-021 (cursor tries to reuse the full stage), FEAT-022
  (auth mount docs reference the full image)

## Notes

- Related plan: `docs/plan/PLAN-009.md`.
- Pinning via build args (`DEFAULT_CLAUDE_CLI_VERSION` etc.) keeps the
  version answer single-source. Bump by changing the constant, the image
  follows.
- Runtime override stays available via `CmdOverrides.cliVersion` — the
  baked version is a default, not a lock.
