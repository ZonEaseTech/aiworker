# PLAN-009 Worker image bundling + model picker

- **status**: implementing
- **createdAt**: 2026-04-23 06:05
- **approvedAt**: 2026-04-23 06:05
- **relatedTask**: FEAT-019, FEAT-020, FEAT-021, FEAT-022

## Context

The FEAT-018 probe smoke with a real worker on `gateway.example.test` showed
two usability gaps:

1. Engine picker lists 7 engines, but 4 (claude-code / acp-gemini /
   acp-qwen / codex) ship `not-installed` on a fresh worker image. The UI
   is truthful — the picker is not "broken" — but the out-of-the-box
   experience requires an extra operator hop (`docker exec ... npm
   install ...`) before anything agentic actually works.
2. Inside each variant body, the `model` field is a free-text input. An
   operator who doesn't know the CLI's model name enum ends up typing
   something that fails at runtime.

This plan closes both gaps. Scope intentionally does **not** extend to
"dashboard-mediated login proxy" or multi-arch builds.

## Proposal

Four FEATs, independent delivery lanes where possible:

### FEAT-019 — Model picker with known-model catalogue per engine (P1)

- Per-engine `knownModels: string[]` in `DEFAULT_PROFILES`.
- Frontend renderer detects `knownModels` and shows a `<Select>` plus
  `custom…` escape hatch.
- Pure frontend + server catalogue; no Dockerfile changes.

### FEAT-020 — Bake npm agentic CLIs into `-full` image (P1)

- Second Dockerfile stage `runtime-full` runs `npm install -g` for
  claude-code / codex / gemini-cli / qwen-code pinned to the same
  `DEFAULT_*_CLI_VERSION` constants the source already uses.
- `.github/workflows/build-image.yml` publishes **both** tags (`<sha>` slim
  and `<sha>-full` fat) every push.
- `scripts/deploy.ts` gains `--image-variant=slim|full`.
- `ops/compose/docker-compose.yml` reads `${AIWORKER_IMAGE_VARIANT}`.
- `docs/deployment.md` and `docs/executor-engines.md` restructured.

### FEAT-021 — Bake Cursor agent (P3, optional)

- Third Dockerfile stage extension running the official curl installer.
- Fails image build on installer regression; cached in buildx.
- Only pursued if FEAT-020 lands cleanly and there is demand.

### FEAT-022 — Auth mount recipe + Register dialog hint (P2)

- New `ops/compose/docker-compose.worker.example.yml`.
- `docs/executor-engines.md` auth recipes (docker-exec login vs host
  mount), trade-offs discussed.
- Register dialog collapsible reminder under the Generate block.

## Risks

1. **Image size jump (FEAT-020)** — slim ~150 MB → full ~280-320 MB. We
   offset by keeping slim as default tag and making full opt-in via
   `AIWORKER_IMAGE_VARIANT=full`. CI runs both tags per push; buildx
   layer cache should keep wall-clock under 3 minutes total.
2. **npm dependency drift (FEAT-020)** — if an upstream CLI has a broken
   publish, `docker build --target runtime-full` fails and we don't push
   the tag. Slim tag still succeeds, so the dashboard stays upgradable.
   Alert path is the CI failure email — good enough for MVP.
3. **Auth files never in image (FEAT-020, FEAT-022)** — baking auth would
   leak tokens to any puller. Documented loudly in executor-engines.md
   and compose example; enforced by not running any `claude login` at
   build time.
4. **Cursor installer network dependency (FEAT-021)** — official
   install-agent endpoint is a SPoF at build time. Cache aggressively,
   optionally commit a vendored installer to the repo, accept CI flake
   cost for P3.
5. **Frontend / backend catalogue duplication (FEAT-019)** — already P3
   on FEAT-014; this task makes it slightly worse (two catalogues, four
   more engines). A future PLAN should lift into `@aiworker/shared`.

## Scope

- FEAT-019: ~200 LOC, nearly all frontend + catalogue addition. Local
  delivery (no BKD worktree — too small).
- FEAT-020: ~300 LOC spread across Dockerfile, workflow yaml, compose,
  deploy.ts, docs. Local delivery.
- FEAT-021: Dockerfile + docs. BKD dispatch — installer debugging is
  trial-and-error, BKD worktree isolation helps.
- FEAT-022: ~150 LOC (compose example + frontend hint card + docs).
  Local delivery.

Total: ~900 LOC including tests. Two GHCR image rebuilds, one production
deploy to `gateway.example.test`.

## Alternatives

### Alternative A — single full image, no slim variant

Drop slim; always ship ~300 MB. Upside: one tag to reason about, one CI
matrix. Downside: some users have tight image pull budgets (edge / mobile
fleets). **Rejected** in favour of dual-tag.

### Alternative B — side-car container per engine

Run each agentic CLI as a separate sidecar, worker proxies RPC calls.
Upside: truly hermetic, each CLI in its own container. Downside: massive
orchestration surface (N+1 containers per worker), engine modules would
need RPC clients instead of spawn. Worth revisiting only if we hit CLI
isolation problems. **Rejected** for now.

### Alternative C — dashboard-mediated login proxy

Dashboard UI runs `claude login` etc. on behalf of the operator, captures
the token, pushes into worker. Upside: truly one-click auth. Downside:
OAuth flows are CLI-specific, very complex, and worker auth files are
not always OAuth (some CLIs use static keys). **Deferred** — tracked in
this plan's Alternatives but not on the current roadmap.

### Alternative D — runtime install at worker boot

Worker container's entrypoint shell-script checks for missing CLIs and
`npm install -g` them on first boot, persisting to a data volume.
Upside: slim image + no first-use latency after reboot. Downside: 30-60s
boot delay, requires network at every fresh worker startup. **Rejected**
— image bake is simpler, failure mode is "image build fails" not
"worker refuses to start in the middle of the night".

## Annotations

- 2026-04-23 06:05 — User approved `proceed all` after the evaluation
  summary. Delivery order: FEAT-019 → FEAT-020 → FEAT-022 → FEAT-021
  (cursor last because P3 + glibc debugging risk).
