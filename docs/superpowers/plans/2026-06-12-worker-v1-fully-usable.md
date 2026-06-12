# Worker v1 Fully Usable — CLI fixes + Web parity + DeepSeek BYOK e2e on vm-node02

> **Status: pending approval** (ralplan consensus — Rev 2 after Critic ITERATE; awaiting re-run
> Architect → Critic → user)
> Mode: **DELIBERATE** (production machine in scope, secret handling, multi-surface)
> Line: **worker** (may touch `apps/worker-web`); host-* untouched. Release: `worker-v1.0.1`.
> Date: 2026-06-12
>
> **Rev 2 changes (Critic ITERATE):** C1 — Bug-1 split into **two** scan primitives (`resolveSessionHome`
> + `resolveInvocationHome`), per-command keyed (T1.1). C2 — added `session events` to Bug-1. C3 —
> **one** shared `deriveByokExecutionMetadata` in `worker-daemon/.../settings.ts` (verified-neutral
> sanctioned subpath, no new pkg), both surfaces import it (T2.1; Principle #2 + S2 fixed). M1 — OQ-1 is a
> **BLOCKING ADR**, Option B de-strawman'd (daemon PATCH already exists → +4–6 FE tasks), T3.1-B added so
> both rulings are execution-ready. M2 — Bug-1 DB-handle hazard + multi-home-ordering test. M3 — DeepSeek
> key via 600 env-file + observability asserts. m1 — ordered pre-flight isolation **gate** + structural
> no-token/no-tunnel reason. m2 — OQ-3 closed. m3 — P0 stub-only, no real key. **CODE FINDING** — BYOK is
> stateless single-turn (`executor.ts:413-427`) → multi-turn scoped to local-cli (T2.3).

---

## North Star

worker v1 is GA (`npm latest = 1.0.0`) but dogfood proves it is **not truly deliverable**.
Goal = make worker **completely usable**: CLI path bug-free, web (Workbench) genuinely
deliverable, **all settings + configuration actually work** from both CLI and web, and an
**end-to-end DeepSeek BYOK run verified on vm-node02**. Likely ships as `worker-v1.0.1`.

---

## Context — Verified Current State (read from code 2026-06-12)

### What works (dogfood, published v1.0.0, real codex)
- `npm i @zonease/aiworker-cli@latest` → `doctor` recognizes codex+claude → `worker create` +
  `start` healthy → real codex turn-1 `succeeded` → **real codex multi-turn resume via web/daemon
  API succeeded** (today's EB-1 native-resume fix, real-engine acceptance passed).

### CRITICAL discovery — BYOK metadata is wired on web/daemon, NOT on CLI; AND the BYOK visible text is a placeholder
There are **two BYOK metadata bridges and they diverge**, plus a separate deliverability defect in the
executor's visible output. None of this is runtime-verified — all from code trace 2026-06-12. **Wired ≠ works.**

- **Daemon/web metadata path is WIRED IN CODE (not runtime-verified).**
  `packages/worker-daemon/src/modes/worker.ts:1512-1573` (`resolvedExecutionMetadata` /
  `sessionExecutionMetadata`) reads `loadLocalSettings()`; when `settings.executionMode !== 'local-cli'`
  it builds `{ byok: settings.byok, engineId: settings.byok.provider, executionMode: 'byok' }`. The
  executor (`packages/worker-runtime/src/worker/executor.ts:234-236, 386-400`) enters `runByokExecutor`
  on `executionMode === 'byok'` and issues a **real** OpenAI-compatible `POST {baseUrl}/chat/completions`.
- **CLI metadata path BROKEN.** `apps/worker-cli/src/aiworker.ts:625` `resolveCliEngineMetadata` and
  `:632` `resolveInvocationEngineMetadata` **hardcode `executionMode: 'local-cli'`** and never read
  `loadLocalSettings().byok` / `.executionMode`. So `aiworker session start` / `session invoke`
  on the CLI **always** create a local-cli session → on a host with no native engine they fail at
  `runLocalCliExecutor` ("Local CLI engine is not wired yet" / auth failure). **CLI BYOK never fires.**
- 🔴 **BYOK visible chat text is a HARDCODED PLACEHOLDER (CONFIRMED deliverability bug).**
  `runByokExecutor` (`executor.ts:392-398`) emits the only assistant-text event as the literal string
  `emit(input, { kind: 'text', text: 'Generated response with BYOK provider.' })`; the **real** DeepSeek
  answer lands only in `summary` (return value). `bridgeEventFromLocalExecutorEvent` (`runtime.ts:1855-1862`)
  maps `{kind:'text'}` → `invocation.output.delta` → `assistant_delta`, and the web transcript
  (`apps/worker-web/src/worker/studio/chat/bridge-event-mapper.ts:78-90`) renders **only** `assistant_delta`
  text, **not** `summary`. **Net: every BYOK chat turn shows "Generated response with BYOK provider."
  instead of the model's answer** — directly on the north-star path. (local-cli streams the real text via
  per-chunk `emit({kind:'text', text: chunk})`, so it does not have this defect.)

**Consequence:** "wired" is not "deliverable." Even the daemon/web BYOK path, though it makes a real
DeepSeek call, currently renders a placeholder to the user. So the vm-node02 e2e is a **build-then-verify**
phase, not a verify-only phase: a P0 baseline spike must confirm/fix the daemon visible-text path *before*
P3/P4, and CLI BYOK plumbing (P2) gates the CLI half of acceptance.

### Confirmed CLI defects (dogfood)
1. 🔴 **`session invoke --session <id>` → `session not found` (standalone)**. Root cause precisely
   located: `resolveSessionContinuationContext` (`aiworker.ts:2359-2365`) calls `ensureDefaultDb()`
   (opens **root/fleet-root** home, `:591-597`), then `getSession(sessionId)` (`:2362`) against that
   root-home DB. The session lives in the **per-worker fleet home** DB. `--worker` is only consumed
   at `:2365` (`opts.worker ?? session.workerId`) — **after** the lookup already failed. The same
   defect afflicts `archiveSessionCommand` (`:2488`), `deleteSessionCommand` (`:2496`),
   `cancelInvocationCommand` (`:2453`), `reconcileInvocationCommand` (`:2469`), `showSession`
   (`:2420`), `listSessionCommand` (`:2415`) — all do `ensureDefaultDb()`/`ensureAllWorkers()`
   then `getSession`. The fix pattern already exists: `resolveWorkerTarget(workerOpt)` (`:780`)
   reopens the per-worker home **before** lookup (used by `ensureRuntime`).
2. 🟡 **`session start` forces `--title`** (`:2343` `requireText(opts.title, 'title')`) but `--help`
   lists `--title` as ordinary optional (`:3115`). Either default it or mark required.
3. 🟡 **`--worker` inconsistency**: `session list` (`:3122`) and `settings list` (`:3134`) have **no**
   `--worker` option (report "Unknown option"); `session invoke` does (`:3124`).
4. 🟡 **`daemon status` (no id) queries root home** (`:3023` → `daemonStatus(localPaths())`, `:1286`)
   → per-worker daemons mis-reported `running:false` while actually alive.
5. ⚪ **`app list` returns `{apps:[]}`** (`:2525-2527` `listApps()` = installed-only). A `listCatalog()`
   already exists (used by `enableApp`). Available-but-not-installed Souls are invisible → misleading.

### Web (worker-web) settings/configuration completeness
- The **only** settings surface is `WorkerConfigurationDialog`
  (`apps/worker-web/src/worker/worker-configuration-dialog.tsx`) — it covers **overlay assets**
  (skills / MCP clients / entry-files) + workbench-route preference. Chat is verified working.
- **No web UI exists for**: engine selection, execution mode (local-cli vs byok), **BYOK provider
  config** (apiKeyRef / baseUrl / model / provider), or daemon settings. These exist **only on the
  CLI** (`config set-engine`, `config set-mode`, `config set-byok`, `:3091-3099`). The daemon already
  exposes settings GET/PATCH routes (`worker.ts:639-725`), so the web gap is **front-end only**.
- This front-end gap is the single largest "settings/configuration complete" item, and its scope is
  the key Decision Driver (see RALPLAN-DR + Open Questions).

### Secret / config facts (DeepSeek)
- `.deepseek` (git-ignored) holds: OpenAI-compatible `base_url = https://api.deepseek.com`,
  Anthropic-compatible `base_url = https://api.deepseek.com/anthropic`, `model = deepseek-v4-pro`,
  and a single key. **The key value is never echoed in this plan, commits, logs, or any output.**
- Self-serve BYOK uses `byok = { apiKeyRef, baseUrl, model, provider }`. `apiKeyRef` must be a
  **reference** (`env:NAME` / `$NAME` / bare `NAME`); literal secrets are rejected at the settings
  layer (`saveLocalSettings` `assertSafeSecretRefs`). `resolveApiKey` (`executor.ts:575`) reads
  `process.env[NAME]` at call time, in memory, never persisted. `secretref:` is not yet supported.
- DeepSeek BYOK config: `provider=openai-compatible`, `baseUrl=https://api.deepseek.com`
  (executor appends `/chat/completions`), `model=deepseek-v4-pro`, `apiKeyRef=env:DEEPSEEK_API_KEY`
  with `DEEPSEEK_API_KEY` exported into the **daemon process env**.

### CI / release facts
- PR: `lint.yml` (lint + typecheck + contracts). Main + nightly: `main-gates.yml` (cron 0 16 UTC).
  Release: `release.yml` on tags `worker-v*` → publishes `@zonease/aiworker-cli` only; dist-tag
  derived from tag name (clean version → `latest`). Published `latest=1.0.0`, `rc=1.0.0-rc.11`.
- **v1.0.1 ships via `worker-v1.0.1` tag** (clean → moves worker-cli `latest`).

### vm-node02 production-safety facts (HARD GUARDRAIL)
- vm-node02 is a **production** box currently running the **rc.11 host-distributed worker with an
  active Worker Access tunnel** (host.db assignment, consumed provision token). Memory graveyard:
  past sessions broke prod `host.db`, killed the worker via `worker_id UNIQUE`, severed the live
  tunnel. **The DeepSeek dogfood MUST run as a SEPARATE standalone worker instance** (own home /
  own port), leaving the running rc.11 host-distributed worker, its DB, and its tunnel **untouched**.
- aissh reachable: `/home/ben/.npm-global/bin/aissh`, creds `.aissh.yaml`. aissh **cannot transfer
  files** (memory) — install on vm-node02 via `npm i -g @zonease/aiworker-cli` or run published rc.
- **Install mechanism is an UNVERIFIED env fact.** The sibling prod host box (172.105.219.50) was
  **bun-only, no node** → needed `bun install -g github:` (memory). vm-node02's PATH (node/npm vs bun-only)
  is **not yet confirmed** — P4 must pre-check before assuming `npm i -g` (see T4.1 / OQ-6).

---

## Guardrails

### Must Have
- TDD: every fix lands a failing reproduction test first (esp. Bug 1 standalone multi-turn, and CLI
  BYOK metadata).
- Secret boundary (AGENTS.md iron law): DeepSeek key never enters descriptor / DB / receipt / log /
  diagnostic / OpenAPI example / UI / commit / this plan. BYOK key in memory + `apiKeyRef` only.
- Inversion guards G2–G12 stay green; **no `host-*` imports/edits**; executor seam stays behind the
  `EngineCredentialProvider` interface; web stays on `packages/ui` shadcn primitives.
- Canonical docs (`docs/architecture|protocol|runtime|testing|soul-authoring.md`) are the contract —
  do not bend architecture to satisfy old E2E. Update `docs/runtime.md` BYOK section if CLI BYOK
  behavior is clarified; update `docs/testing.md` forcing-functions table for new tests.
- Each PR green on `lint`+`check`; before completion run the smallest fresh verification that proves
  the touched surface; run code-review-graph (not docs-only).

### Must NOT Have
- **No mutation of the running vm-node02 rc.11 host-distributed worker, its `worker.db`/home, the
  host assignment, the provision token, or the tunnel.** The dogfood worker is a fresh standalone
  instance only.
- No literal secret anywhere. No `--key` that takes a raw key; only `--key-ref`.
- No new `core-v2`/`shared-v2`; no ad-hoc UI component system.
- No scope creep into a full web settings rebuild inside v1.0.1 (see phasing / Decision Driver).

---

## Phasing & Release Strategy

| Phase | Content | Ships in |
|---|---|---|
| **P0** | **Baseline gating spike**: verify a single daemon BYOK turn renders a correct **user-visible** answer (not the placeholder). Fix `runByokExecutor` visible-text if it shows the placeholder. | worker-v1.0.1 (prereq) |
| **P1** | CLI correctness: Bugs 1–5 + full-surface command pass | worker-v1.0.1 |
| **P2** | CLI BYOK plumbing via **shared** `deriveByokExecutionMetadata` (CLI+daemon one builder) + scope multi-turn to local-cli / BYOK single-turn (T2.3) | worker-v1.0.1 |
| **P3** | Web parity — **OQ-1-dependent:** A = read-only readiness (T3.1); **B-scoped** = + Workbench write-form on existing `PATCH /api/settings` (T3.1-B) | worker-v1.0.1 |
| **P4** | vm-node02 non-disruptive DeepSeek **single-turn** e2e (web + CLI), 600 env-file key delivery | gates v1.0.1 release |
| **FOLLOW-UP (v1.0.2)** | BYOK multi-turn history-replay; full web config UI (only if A chosen) | separate plan |

Order: **P0 first (gating)** → P1 → P2 (parallelizable with P1 after Bug-1 lands) → P3 → P4 → release.
P0 collapses the biggest unknown (does daemon BYOK render a real answer?) before phasing hardens. P4
cannot start until P2 lands (CLI half) and a build with P0–P3 is publishable as an rc for vm-node02 install.

**Decision lever (OQ-1 — BLOCKING ADR, user must rule; plan does NOT pre-decide):** does v1.0.1 mean
"证明可用" (Option A: CLI configures BYOK, web shows readiness, dogfood proves it) or "交付给不懂技术员工
自助" (Option B-scoped: the employee configures engine/mode/BYOK from their **own Workbench**)? The
daemon write path already exists (`PATCH /api/settings`), so B-scoped is a bounded front-end add, not a
balloon (see RALPLAN-DR Options). Phases P0–P2 and P4 are identical for both; only P3 differs (read-only
vs. + write-form). The P3 task below documents **both** variants so either ruling is execution-ready.

---

## Detailed TODOs

### Phase 0 — Baseline gating spike (worker-v1.0.1 prereq)

**T0.1 — Confirm/fix daemon BYOK renders a real, user-visible answer.**
- Why: code trace shows `runByokExecutor` (`executor.ts:392-398`) emits only the hardcoded placeholder
  `'Generated response with BYOK provider.'` as `{kind:'text'}` (→ `assistant_delta` → the only text the
  web transcript renders), while the real answer is in `summary`. This is the north-star path; verify
  before phasing hardens.
- Files: `packages/worker-runtime/src/worker/executor.ts` (`runByokExecutor`),
  `packages/worker-runtime/src/worker/executor.test.ts` / `byok-api-key.test.ts`.
- Spike (m3 — **stub-only, zero real-key spend**): the placeholder bug is already confirmed by code
  trace (`executor.ts:394` emits a literal; transcript renders only `assistant_delta`), so P0 needs **no**
  real DeepSeek call. Drive a daemon BYOK turn against a **stubbed OpenAI-compatible endpoint** returning
  a known string and assert the **visible** transcript renders that string, not the placeholder. The real
  DeepSeek key is spent **only in P4** on vm-node02.
- Fix (if placeholder confirmed): emit the real `content` as the assistant text delta (e.g.
  `emit(input, { kind: 'text', text: content })` instead of the literal), matching local-cli's streaming
  contract; keep `summary` for title/non-streaming. TDD: assert the emitted text event equals the model
  content, not the placeholder.
- Acceptance: a BYOK invocation's **visible** assistant text equals the provider's answer; regression test
  pins it; redaction still applied; no secret in events.

### Phase 1 — CLI correctness (worker-v1.0.1)

**T1.1 — Fix Bug 1: per-worker home resolution for session- AND invocation-keyed commands.**
- **Two distinct lookup keys → two scan primitives (C1).** Some commands have a `sessionId` at hand;
  others only have an `invocationId` and derive the session *after* `getEngineInvocation`. A single
  session-id-keyed helper cannot resolve the home for the invocation-keyed commands (no session id
  exists at home-resolution time). So introduce **two** primitives in `apps/worker-cli/src/aiworker.ts`:
  - `resolveSessionHome(sessionId, workerOpt?)` → scans homes calling `getSession(sessionId)`.
  - `resolveInvocationHome(invocationId, workerOpt?)` → scans homes calling `getEngineInvocation(invocationId)`.
  Both: when `--worker` given, open that worker's home directly; else open current/standalone home →
  probe; on miss, walk fleet index homes (reuse `resolveWorkerTarget`'s reopen-by-home pattern) until
  the row is found. Standalone (single/default/selected worker) resolves without `--worker`. Return the
  opened `paths` + the row so callers build runtime against the **same** home.
- **Per-command assignment + Files:**
  | Command | Handler (line) | Key | Primitive |
  |---|---|---|---|
  | `session invoke` | `resolveSessionContinuationContext` :2359 | sessionId | `resolveSessionHome` |
  | `session show` | `showSession` :2420 | sessionId | `resolveSessionHome` |
  | `session list` | `listSessionCommand` :2415 | (workspace/worker) | `resolveSessionHome`/`resolveWorkerTarget` via `--worker` (see T1.3) |
  | `session archive` | `archiveSessionCommand` :2488 | sessionId | `resolveSessionHome` |
  | `session delete` | `deleteSessionCommand` :2496 | sessionId | `resolveSessionHome` |
  | `session events` | `showInvocationEventsCommand` :2428 | **invocationId** | `resolveInvocationHome` (**C2 — was omitted**) |
  | `session cancel` | `cancelInvocationCommand` :2453 | **invocationId** | `resolveInvocationHome` |
  | `session reconcile` | `reconcileInvocationCommand` :2469 | **invocationId** | `resolveInvocationHome` |
- **Multi-worker resolution (OQ-2 RESOLVED — fleet-home scan is safe):** session ids and invocation ids
  are `randomUUID()` (`runtime.ts:439`/`:525`/`:637`), globally unique → scanning all homes cannot
  resolve the wrong worker's row. With >1 active worker and no `--worker`, **scan fleet homes**; error
  only if the id is absent from every home.
- **M2 — DB-handle hazard (critical).** SQLite is a global singleton; each `initWorkerDb`/`ensureDbAt`
  force-closes the prior handle (`aiworker.ts:776-779`). The scan MUST **stop on the hit home and leave
  that home's DB open** (mirroring `resolveWorkerTarget`), so the subsequent `runtime`/`startInvocation`
  runs against the correct, open handle — not a closed or wrong home opened last. Callers must build
  `createHost(returnedPaths)`/runtime from the primitive's returned paths, never re-`ensureDefaultDb`.
- Tests (TDD, RED first; `apps/worker-cli/src/aiworker.test.ts`), **one per command-family + M2 ordering:**
  1. standalone worker in own fleet home: `session invoke --session <id>` (no `--worker`) → success
     (currently `session not found`); `--worker <id>` variant also succeeds.
  2. standalone `session events <invocationId>` (no `--worker`) → success (**C2 regression**); same for
     `session cancel`/`session reconcile`.
  3. **M2 multi-home ordering:** create ≥2 workers; target session lives in a home that is **NOT** the
     last one scanned; assert (a) lookup succeeds, (b) the **open** DB handle after resolution is the
     hit home's, (c) a follow-up `startInvocation` runs against that home (not the last-scanned/closed one).
  4. absent id still errors clearly across both primitives.
- Acceptance: every session-keyed and invocation-keyed command resolves the correct per-worker home
  standalone (no `--worker`) and with `--worker`; the hit home's DB stays open for the ensuing runtime
  call; multi-home (target not last) passes; absent id errors.

**T1.2 — Fix Bug 2: `session start` title.**
- File: `aiworker.ts:2343` + command def `:3113-3121`.
- Approach: **Decision (OQ-3 CLOSED — default it unless user objects):** give a default title
  consistent with session auto-naming (`7a14ce20`) so bare `--input` works; keep `--title` as override.
  Not an open question — the auto-naming machinery already exists; defaulting is the low-risk choice.
- Test: `aiworker.test.ts` — `session start --workspace <id> --input "..."` (no `--title`) → succeeds.
- Acceptance: bare `--input` no longer errors; `--help` matches behavior.

**T1.3 — Fix Bug 3: `--worker` consistency.**
- File: command defs `:3122` (`session list`), `:3134` (`settings list`), and handlers
  `listSessionCommand` (`:2415`), settings list inline (`:3134-3137`).
- Approach: add `.option('--worker <id>')` to both and route through per-worker home (T1.1 helper /
  `resolveWorkerTarget`). Audit **all** runtime-reading commands for `--worker` parity
  (`session show`, `files list`, `engine select`).
- Test: `aiworker.test.ts` — `session list --worker <id>` and `settings list --worker <id>` no longer
  "Unknown option" and return that worker's data.
- Acceptance: `--worker` accepted+honored consistently across runtime-reading commands.

**T1.4 — Fix Bug 4: `daemon status` per-worker home.**
- File: `aiworker.ts:3023` + `daemonStatus` (`:1286`).
- Approach: `daemon status` with no id resolves the standalone/default worker's per-worker paths
  (fleet-aware) before `daemonStatus(paths)`; optionally accept `[id]`/`--worker`. Reuse fleet
  resolution from `startFleet`/`fleetWorkerPaths`.
- Test: `aiworker.test.ts` or `fleet.test.ts` — a per-worker daemon shows `running:true`.
- Acceptance: per-worker daemon liveness reported correctly; no false `running:false`.

**T1.5 — Fix Bug 5: `app list` shows catalog.**
- File: `listAppsCommand` (`:2525`).
- Approach: include available catalog alongside installed, e.g. `{ apps: listApps(), catalog:
  host.listCatalog() }` (or an `available` field), mirroring `enableApp`'s `catalog`. Do not change
  install semantics.
- Test: `aiworker.test.ts` — `app list` exposes bundled-but-not-installed Souls (e.g. freeform) in a
  catalog/available field.
- Acceptance: available Souls are discoverable from `app list`; installed view unchanged.

**T1.6 — Full-surface command pass (not happy-path only).**
- Exercise `worker config list/set`, `settings list`, `engine select`, full workspace/session
  lifecycle (create→list→show→invoke→events→cancel→reconcile→archive→delete), `config show/set-engine/
  set-mode/set-byok`, `files list/show` — standalone, asserting `--worker` parity and per-worker home
  correctness throughout. Capture any new defects as sub-tasks.
- Test: extend `aiworker.test.ts` / `freeform-golden-path.test.ts` to cover the standalone lifecycle
  end to end.
- Acceptance: every documented command works standalone with correct home resolution.

### Phase 2 — CLI BYOK plumbing (worker-v1.0.1)

**T2.1 — Extract ONE shared BYOK-metadata derivation; CLI + daemon both import it (C3).**
- **Single source of truth (Principle #2, no strawman).** The BYOK branch of the daemon's
  `resolvedExecutionMetadata` (`worker.ts:1513-1521`) is **pure settings-derivation** — no engine scan,
  no daemon state — so it extracts cleanly. The local-cli branch is NOT shared (it needs an engine
  resolver/scan whose source differs: CLI's `scanLocalEngines()` vs daemon's `settings.engines`); it
  stays a per-surface adapter.
- **Owning package (verified neutral, no new pkg, no internal-path violation):**
  `packages/worker-daemon/src/modes/worker/settings.ts`, exported via the **already-sanctioned
  `@zonease/aiworker-worker-daemon/settings` subpath** (present in worker-daemon's `package.json`
  `exports` map). worker-cli **already** imports `loadLocalSettings`/`saveLocalSettings`/
  `readLocalEngineSettings` from this exact subpath (`aiworker.ts:61`), and the
  `package-ownership.test.ts:139` guard only forbids **deep sibling-source** imports — a declared
  subpath export is allowed. The `LocalSettingsConfig`/`byok` type already lives here. No `*-v2` package;
  no G12/layering break.
- New export: `export function deriveByokExecutionMetadata(settings: LocalSettingsConfig):
  Record<string, unknown>` returning `{ byok: settings.byok, engineCommand: null, engineId:
  settings.byok.provider, engineName: null, executionMode: 'byok' }` (exactly today's `worker.ts:1514-1520`).
- **Refactor both callers to the single builder:**
  - `worker.ts`: `resolvedExecutionMetadata` calls `deriveByokExecutionMetadata(settings)` in its
    `executionMode !== 'local-cli'` branch (behavior-preserving).
  - `aiworker.ts` (`resolveCliEngineMetadata` :625 / `resolveInvocationEngineMetadata` :632 /
    `startSessionCommand` :2330 / `resolveSessionContinuationContext` :2359): when
    `loadLocalSettings().executionMode === 'byok'`, return `deriveByokExecutionMetadata(settings)` instead
    of the hardcoded `executionMode:'local-cli'`. local-cli branch unchanged; honor session-frozen mode
    on follow-ups.
- TDD (RED first):
  - `aiworker.test.ts` — `config set-mode byok` + `config set-byok --key-ref env:FAKE --base-url ...
    --model ...`, `session start` → assert produced invocation metadata `executionMode:'byok'` + `byok`
    block (assert metadata only; no real network).
  - **S2 (revised, single-builder shape):** a unit test on `deriveByokExecutionMetadata` pinning its
    output **shape** for a given settings input (one builder, one assertion — NOT two builders compared).
- Acceptance: CLI and daemon BYOK invocation metadata come from **one** `deriveByokExecutionMetadata`;
  local-cli unaffected; secret boundary preserved (only `apiKeyRef`, resolved at call time); no new
  package; ownership/inversion guards green.

**T2.2 — Update canonical docs for the BYOK CLI parity.**
- Files: `docs/runtime.md` (Accepted Execution-Mode Deviation §), `docs/testing.md` (forcing-functions
  table row for CLI BYOK metadata test).
- Acceptance: docs reflect that both CLI and daemon honor `executionMode:byok`; docs:check green.

**T2.3 — Scope multi-turn to local-cli; declare BYOK single-turn for v1.0.1 (CODE-VERIFIED).**
- **Code conclusion (verified, not assumed):** `requestOpenAICompatibleContent` (`executor.ts:413-427`)
  sends a fixed `messages` array = `[system, {role:'user', content: input.prompt}]` — **only the current
  turn**. No prior-turn replay, no transcript accumulation, no `messages` history. BYOK has **no native
  session** (today's EB-1 native-resume is wired only for claude-code/codex). **Therefore BYOK follow-ups
  are stateless — each turn forgets all prior turns.** "Multi-turn usable" does NOT hold on the BYOK path.
- **Decision for v1.0.1 (DELIBERATE — choose the bounded path):** **scope the multi-turn acceptance to
  local-cli; mark BYOK explicitly single-turn.** BYOK history-replay (replaying prior turns into the
  `messages` array, with token-budget/truncation policy) is a real but **larger** change → named
  follow-up (v1.0.2), NOT v1.0.1. Rationale: vm-node02 has no native engine, so BYOK there is the
  "get the worker running at all" path; single-turn BYOK still proves deliverability; multi-turn memory
  is proven on local-cli (today's EB-1 real-engine acceptance).
- Files: `docs/runtime.md` (state BYOK single-turn limitation + the stateless reason explicitly);
  `docs/testing.md` (multi-turn forcing-function scoped to local-cli).
- Acceptance: docs state BYOK is single-turn in v1.0.1 with the stateless-messages reason; multi-turn
  acceptance criteria everywhere read "local-cli"; BYOK acceptance reads "single-turn". (See T4.2 + OQ-7.)

### Phase 3 — Minimal web parity (worker-v1.0.1)

**T3.1 — Web shows engine / execution-mode / BYOK readiness (read-only).**
- Files: `apps/worker-web/src/worker/worker-studio.tsx` + `worker-configuration-dialog.tsx` (or a small
  new read-only panel), consuming the daemon settings GET (`features/local-workspace/api/settings.ts`).
- Approach: surface current engine, execution mode, and BYOK **readiness** (provider/model/
  `apiKeyRefPresent` boolean — never the ref or key) so the operator can confirm the worker will run
  BYOK. Read-only for v1.0.1; reuse `config show` redacted view shape (`apiKeyRefPresent`).
- Test: `worker-web` unit test (vitest/happy-dom) asserting the panel renders mode + readiness and
  **never** renders a secret/ref.
- Acceptance: web visibly confirms BYOK-configured engine + readiness; chat path runs it; no secret in DOM.

**T3.1-B — (ONLY if OQ-1 ruled Option B-scoped) Web write-form for engine/mode/BYOK.**
- Files: a new config form in `apps/worker-web/src/worker/` (reuse `packages/ui` `Input`/`Switch`/`Select`/
  `Button` primitives — no ad-hoc UI), a settings PATCH client in
  `features/local-workspace/api/settings.ts`, i18n strings in `features/i18n`.
- Approach: form fields = engine select + execution-mode toggle + BYOK provider/baseUrl/model + a
  **ref-only** key field (placeholder `env:NAME`); on submit POST the **existing** `PATCH /api/settings`
  (`worker.ts:716-728`). **Client-side literal-secret rejection** mirrors the settings-layer guard
  (reject `sk-...`/`api_key=...` patterns in the key field) so a literal never leaves the browser.
- Tests: unit — form rejects a literal-secret key field, accepts `env:NAME`, never renders the stored
  ref/key; browser proof — configure BYOK from the Workbench → PATCH succeeds → readiness flips.
- Acceptance: a non-technical operator configures engine/mode/BYOK entirely from the Workbench; literal
  secrets rejected client-side; stored ref/key never rendered; backend unchanged (PATCH already exists).
- **Marginal cost:** +4–6 front-end tasks over Option A; backend/schema/secret-rejection already present.

**T3.2 — Verify web chat runs a BYOK invocation end to end (build-time browser proof).**
- Files: existing `tests/browser/freeform-chat-experience.spec.ts` pattern (extend or mirror) against a
  BYOK-configured worker with a stubbed/mock OpenAI-compatible endpoint.
- Acceptance: a browser-proof turn through the daemon BYOK path produces an assistant message.

### Phase 4 — vm-node02 DeepSeek e2e (gates release; NON-DISRUPTIVE)

**T4.1 — Provision a fresh standalone worker on vm-node02 (ordered isolation gate; do not touch rc.11/tunnel).**
- **Step A — install pre-check (OQ-6):** via aissh, `which node npm bun`. node/npm → `npm i -g`; bun-only
  (like the host box) → `bun install -g @zonease/aiworker-cli` / global-binary path. Do not assume `npm i -g`.
- **Step B — ORDERED pre-flight isolation GATE (m1 — abort-on-fail BEFORE any write).** Assert, in order,
  and **abort immediately** if any fails:
  1. dogfood home `!=` rc.11 worker's home dir (distinct `AIWORKER_HOME`/fleet entry).
  2. dogfood port `!=` rc.11 port, started with `--strictPort` → a collision **hard-fails fast** (never
     silently rebinds onto the rc.11 worker).
  3. the standalone session/runtime command set this dogfood uses is allowlisted to touch **only** the
     worker's own SQLite/home — it **cannot** reach `host.db` (standalone has no Host control path).
  - **Structural reason (state explicitly):** a standalone worker has **no provision token → the Worker
    Access tunnel code path is never triggered** (provision-client only opens the socket after a consumed
    token). So the dogfood structurally cannot check in, mint an assignment, or hit the `worker_id UNIQUE`
    collision that killed a worker before — the isolation is structural, not just procedural.
- **Step C — install + create + start:** install `@zonease/aiworker-cli@<rc-for-v1.0.1>`;
  `aiworker worker create deepseek-dogfood`; start on the distinct port/own fleet home.
- **Step D — secret delivery (M3 — aissh cannot transfer files):** put the DeepSeek key onto the box
  **without** it entering shell history, `ps`, or logs:
  - write a **600-permission env-file** on the box via a non-echoing heredoc / `read -s` (e.g.
    `install -m600 /dev/null ~/.aiworker-deepseek.env` then append `DEEPSEEK_API_KEY=...` via a heredoc
    fed over the aissh session — never as an inline command argument), mirroring the host box's
    `.env 600 + --env-file` pattern.
  - start the dogfood daemon with `--env-file ~/.aiworker-deepseek.env` so `DEEPSEEK_API_KEY` is in **that
    daemon's** process env only (not a shared profile, not exported globally).
  - **Observability asserts:** key value absent from shell `history`, from `ps -ef`/`/proc/<pid>/cmdline`
    (it's in env-file, not argv), and from daemon logs/diagnostics.
- Acceptance: pre-flight gate passes (else aborted with zero writes); new standalone worker healthy;
  `daemon status` (per-worker, post-T1.4) `running:true`; key delivered via 600 env-file with the three
  observability asserts green; rc.11 worker, its DB, assignment, and tunnel verified **unchanged**
  (read-only status checks).

**T4.2 — Configure DeepSeek BYOK + run e2e on both surfaces.**
- Steps: `aiworker config set-byok --key-ref env:DEEPSEEK_API_KEY --base-url https://api.deepseek.com
  --model deepseek-v4-pro --provider openai-compatible`; `config set-mode byok`; `config show`
  (assert `apiKeyRefPresent:true`, no ref printed).
  - **Web path (single-turn):** open Workbench → run **one** chat turn → assert `succeeded` with a real
    DeepSeek answer **visibly rendered** (P0 fix — not the placeholder).
  - **CLI path (single-turn; needs T2.1):** `session start` + **one** `session invoke` → assert
    `succeeded` with a real DeepSeek answer and correct per-worker home (needs T1.1 `resolveSessionHome`).
  - **Multi-turn memory is verified on local-cli only** (today's EB-1 real-engine acceptance), NOT here:
    BYOK is single-turn in v1.0.1 (T2.3, stateless `messages`). Do **not** assert cross-turn recall on
    the DeepSeek BYOK turns.
- Acceptance: both surfaces produce a real DeepSeek-backed **single-turn** `succeeded` with the answer
  **visibly rendered**; logs/diagnostics/`ps`/history contain **no** key; rc.11 worker/tunnel still intact.

**T4.3 — Release worker-v1.0.1.**
- Steps: via `release-loop` skill — branch → PR (lint+check green) → merge main → main-gates green →
  push `worker-v1.0.1` tag → CI publishes `@zonease/aiworker-cli@1.0.1` to `latest` → `npm view` verify.
- Acceptance: `npm view @zonease/aiworker-cli version` = `1.0.1`; latest moved; host untouched.

---

## Success Criteria
- P0: BYOK invocation's **visible** assistant text equals the provider answer (not the placeholder);
  regression test pins it.
- All 5 CLI bugs fixed with regression tests (incl. `session events`/`cancel`/`reconcile` via
  `resolveInvocationHome`, and the M2 multi-home-ordering test); full standalone command surface verified.
- CLI and daemon BYOK invocation metadata come from **one** shared `deriveByokExecutionMetadata`
  (TDD-proven, single-builder shape assertion); local-cli unaffected.
- Multi-turn memory verified on **local-cli** (EB-1); **BYOK is single-turn** in v1.0.1 (documented,
  stateless `messages`).
- Web visibly confirms engine/mode/BYOK readiness and renders a real BYOK answer (browser proof); no
  secret in UI/DOM.
- vm-node02: a **fresh standalone** worker runs a **real DeepSeek single-turn** via **both** web and CLI
  with the answer visibly rendered; the DeepSeek key reaches the box only via a 600 env-file (absent from
  history/`ps`/logs); the running rc.11 host-distributed worker + tunnel are provably untouched.
- `worker-v1.0.1` published to `latest`; all gates green; canonical docs updated.

---

## RALPLAN-DR Summary

### Principles (3–5)
1. **Non-native-engine fallback is a documented worker-internal deviation, not a Host model call** —
   BYOK stays worker-owned, key-by-reference, in-memory (docs/runtime.md §Accepted Deviation).
2. **One shared builder, not two mirrored ones** — CLI and web derive BYOK invocation metadata from a
   single `deriveByokExecutionMetadata` in `worker-daemon/src/modes/worker/settings.ts` (consumed via the
   sanctioned `./settings` subpath both already import). No "mirror + equality-guard"; the single source
   *is* the guarantee.
3. **Production is sacred** — vm-node02's running rc.11 worker + tunnel are read-only; the dogfood is
   an isolated standalone instance.
4. **Secrets by reference only** — `apiKeyRef`, env-resolved at call time, never persisted/echoed.
5. **Ship the smallest truly-usable increment** — v1.0.1 = correctness + BYOK parity + minimal web
   visibility; full web config UI is a named follow-up.

### Decision Drivers (top 3)
1. **Web BYOK config scope — BLOCKING, user must rule (see ADR / OQ-1).** Is v1.0.1's intent "证明可用"
   (A: CLI configures + web shows + dogfood) or "交付给不懂技术员工自助" (B-scoped: the employee can
   configure engine/mode/BYOK **from their own Workbench**)? On a machine with no native engine, **BYOK
   config is the very thing that makes the worker run** — so "web 也真能配" maps directly to whether a
   non-technical employee can self-serve. **Decisive fact:** the daemon write path **already exists**
   (`worker.ts:716-728` `PATCH /api/settings` accepts `byok`/`executionMode`/`engineId` via
   `patchSettingsBodySchema = localSettingsConfigSchema.partial()`), so B's marginal cost is front-end-only.
2. **vm-node02 production safety** — structurally-isolated standalone worker (no provision token → no
   tunnel) vs. any reuse of the running instance.
3. **CLI BYOK is a build, not a verify** — discovered mid-investigation; gates the CLI half of acceptance.

### Viable Options (≥2)

**Option A — "Baseline + correctness + BYOK parity + web visibility (read-only)".**
v1.0.1 = P0 visible-text fix + P1 CLI bugs + P2 CLI BYOK (shared builder) + P3 read-only web visibility +
P4 non-disruptive vm-node02 e2e; web BYOK **config** UI → v1.0.2.
- Pros: fastest to a usable worker; both surfaces run BYOK; bounded (~14–18 tasks); lowest prod risk;
  proves "可用".
- Cons: a non-technical employee **cannot self-configure BYOK from the Workbench** in v1.0.1 — only an
  operator with CLI access can. If the north star is "不懂技术员工开箱即用", A under-delivers that.

**Option B (scoped) — "A + a web config surface for the engine/mode/BYOK trio".**
Adds **one** Workbench config surface: engine select + execution-mode toggle + BYOK provider form
(provider/baseUrl/model + **ref-only** key field), POSTing the **already-accepted** `PATCH /api/settings`.
- **Honest marginal cost (NOT a 30-step balloon):** one form component (reusing `packages/ui` primitives)
  + client-side ref-only validation (reject literal secrets in the field, mirroring the settings-layer
  guard) + wiring to the existing PATCH + one browser proof + i18n strings. The backend, schema, secret
  rejection, and redacted read view all already exist. Estimated **+4–6 tasks** over A, all front-end.
- Pros: satisfies "从 web 也真能配" literally; the employee self-serves BYOK from their own Workbench =
  the actual "开箱即用" north star on no-native-engine machines.
- Cons: adds front-end surface + a browser proof to v1.0.1; slightly later release; secret-ref UX must be
  careful (field-level literal-secret rejection + never echo). Bounded and front-end-only — not open-ended.

**Option C — "Verification-only" (REJECTED).**
- *Invalidation:* falsified by investigation — CLI BYOK is genuinely broken (`aiworker.ts:625/632` hardcode
  `local-cli`) AND BYOK visible text is a placeholder (`executor.ts:394`), so the path cannot be merely
  verified; it must be built. C cannot meet "真能用 BYOK".

> Two viable options (A, B-scoped) survive; C is explicitly invalidated. **OQ-1 (A vs B-scoped) is a
> BLOCKING ADR the user must rule before approval** — the plan does **not** pre-decide it. Phases P0–P2,
> P4 are identical for both; B-scoped only adds the P3 write-form tasks.

---

## Pre-Mortem (DELIBERATE — 3 scenarios)

**S1 — We disturb the vm-node02 rc.11 worker / sever the tunnel.**
Cause: dogfood worker reuses the prod home/port, or a `worker_id UNIQUE` collision, or an errant write
to `host.db`. → Mitigation: dogfood is a **separate standalone** worker (own home/port/fleet entry);
**zero writes** to host.db/assignment/token; pre- and post-checks assert
`provisionTokenConsumedAt`/`checkedInAt`/`assignmentId`/tunnel state unchanged (read-only); abort on any drift.

**S2 — CLI BYOK fix diverges from daemon, so CLI and web behave differently.**
Cause: re-deriving execution metadata in the CLI as a second builder. → Mitigation: there is **one**
builder — `deriveByokExecutionMetadata` in `worker-daemon/src/modes/worker/settings.ts` — imported by
**both** `worker.ts` and `aiworker.ts` via the `./settings` subpath. Divergence is structurally
impossible (single source). The test asserts that one builder's output **shape** (not two builders
compared), and that `worker.ts`'s BYOK branch delegates to it.

**S3 — A secret leaks (commit / log / receipt / UI / OpenAPI example).**
Cause: passing a literal key, printing `apiKeyRef`, or logging the resolved key. → Mitigation:
`--key-ref` only (settings layer rejects literals); `config show` prints `apiKeyRefPresent` boolean
only; redaction on engine logs; a test asserting no key/ref in CLI output and web DOM; security-review +
code-review-graph before merge; key exported only into the daemon process env on vm-node02.

---

## Expanded Test Plan (DELIBERATE)

- **Unit:**
  - Bug-1 **two primitives**: `resolveSessionHome` (session-keyed) + `resolveInvocationHome`
    (invocation-keyed) — standalone + `--worker` + fleet-scan + absent-id, each.
  - **M2 multi-home ordering**: target row NOT in last-scanned home → lookup succeeds, hit-home DB stays
    open, ensuing `startInvocation` runs against hit home.
  - single `deriveByokExecutionMetadata` output-shape assertion (one builder); `worker.ts` BYOK branch
    delegates to it.
  - `resolveApiKey` ref forms; settings literal-secret rejection; (B-scoped) web key-field literal rejection.
  - web read-only BYOK-readiness panel never renders secret/ref.
- **Integration:**
  - CLI full standalone lifecycle (T1.6) against a per-worker fleet home, incl. `session events`/`cancel`/
    `reconcile` via `resolveInvocationHome` (C2).
  - daemon BYOK invocation route produces a byok-mode invocation from local-settings.
  - `daemon status` per-worker liveness; `app list` catalog presence; `--worker` parity across commands.
  - (B-scoped) `PATCH /api/settings` from the web form persists byok/mode/engine.
- **E2E (browser + real provider):**
  - **P0 regression:** BYOK invocation's **visible** assistant text == provider content, NOT the
    `'Generated response with BYOK provider.'` placeholder (`executor.ts:394`).
  - browser proof: web chat turn through daemon BYOK path (stubbed endpoint) → renders the real answer.
  - vm-node02 real DeepSeek: web turn `succeeded` + CLI turn `succeeded`, real **visible** answers,
    isolated worker.
- **Observability / safety:**
  - assert no key/ref in: CLI stdout/JSON, engine stdout/stderr logs, receipts, web DOM, OpenAPI examples.
  - vm-node02 invariants pre/post: rc.11 worker `running`, assignment + token + tunnel unchanged.
  - `release:check` (worker gate) green; main-gates green pre-tag.

---

## ADR (BLOCKING — user must rule OQ-1 before approval; section stays genuinely open)
- **Decision:** _PENDING — user ruling required._ Option A ("证明可用": CLI configures + web read-only +
  dogfood) vs **Option B-scoped** ("交付不懂技术员工自助": + Workbench write-form for engine/mode/BYOK).
  Not pre-decided. Phases P0–P2 and P4 are common; only P3 (read-only T3.1 vs + write-form T3.1-B) differs.
- **Drivers:** web-BYOK config scope (does "开箱即用" require employee self-serve config?); vm-node02 prod
  safety (structural isolation: no token → no tunnel); CLI-BYOK-is-a-build (not a verify).
- **Decisive fact for B's cost:** daemon `PATCH /api/settings` (`worker.ts:716-728`) already accepts
  byok/mode/engine → B-scoped is **+4–6 front-end tasks**, not a balloon.
- **Alternatives considered:** A (correctness + parity + web read-only visibility); B-scoped (+ web
  config write-form on the existing PATCH); C (verify-only — INVALIDATED: CLI BYOK + visible-text both
  genuinely broken).
- **Why chosen / Consequences / Follow-ups:** _to be filled after the user rules OQ-1; v1.0.2 follow-ups
  already named (BYOK multi-turn history-replay; full web config UI if A is chosen)._

---

## Open Questions

### BLOCKING — user must rule before approval
- **OQ-1 (BLOCKING ADR):** v1.0.1 intent = "证明可用" (**Option A**: CLI configures BYOK + web read-only
  readiness + dogfood) OR "交付给不懂技术员工自助" (**Option B-scoped**: + Workbench write-form for
  engine/mode/BYOK on the already-existing `PATCH /api/settings`)? On no-native-engine machines, BYOK
  config *is* what makes the worker run, so this = whether a non-technical employee self-serves. B-scoped
  cost is bounded front-end (+4–6 tasks). **Plan is execution-ready for either** (T3.1 vs T3.1-B).
- **OQ-4 (must rule):** vm-node02 install requires a **published rc** (e.g. `worker-v1.0.1-rc.1`) because
  aissh cannot transfer local builds. Approve cutting an rc for P4, then shipping clean `worker-v1.0.1`
  after green?

### RESOLVED in this revision
- **OQ-2 (RESOLVED — fleet-scan safe):** session/invocation ids are `randomUUID()`
  (`runtime.ts:439/525/637`), globally unique → fleet-home scan cannot resolve the wrong worker's row.
- **OQ-3 (CLOSED — default title):** `session start` defaults the title (session auto-naming exists);
  `--title` stays an override. Not open unless the user objects.
- **OQ-7 (RESOLVED by code — BYOK is single-turn in v1.0.1):** `requestOpenAICompatibleContent`
  (`executor.ts:413-427`) sends only the current `input.prompt` (no prior-turn replay; BYOK has no native
  session). Multi-turn scoped to local-cli; BYOK history-replay is a named v1.0.2 follow-up (T2.3).

### Operational confirms (not blocking; pre-checked in-plan)
- **OQ-5:** DeepSeek `provider=openai-compatible` against OpenAI-compatible base_url
  `https://api.deepseek.com`; v1.0.1 does **not** use the Anthropic-compatible base_url (different carrier).
- **OQ-6:** vm-node02 install mechanism (node/npm vs bun-only) — pre-check baked into T4.1 Step A.
