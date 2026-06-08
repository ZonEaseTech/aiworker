# CLI Doctor Robustness — Design Spec

2026-06-08 · status: approved (autopilot, user delegated detail decisions) · scope: single implementation plan

## 1. Background & current gaps

`aiworker doctor` (`apps/worker-cli/src/aiworker.ts:698 runDoctor`) today just `printJson` a bag of context
(`home/dbPath/apps/workers/workspaces/daemon/installation/settings`) with **`ok: true` hardcoded** and exit code
always 0 — it never judges health. Concrete gaps (some hit live during the 2026-06-08 host/worker bring-up):

- `ok` is constant; doctor is a dump, not a health gate. Exit code never reflects problems.
- The native-LLM-CLI detector `scanLocalEngines` (claude/codex/cursor-agent/gemini/opencode/qwen) **exists but doctor never calls it**.
- **No detection of bun runtime / PATH** (the bun-not-on-PATH class that broke worker upgrade), **docker**, or **aissh**.
- **`aiworker-host` has no `doctor` command at all.**
- Empirically on production host (aiwork): `aissh server list` fails (`Executable not found in $PATH: "aissh"`),
  soulReleases = 0 — real conditions a host doctor must surface.

## 2. Goals / non-goals

**Goals:** robust `doctor` on **both** host and worker that detects missing environment & tools (bun/PATH, native
LLM CLI, docker, aissh, Logto env, daemon/db/migrations), grades each `ok|warn|error`, reflects severity in the exit
code, and prints **actionable fixes**. Two-tier depth (fast default, `--probe` deep). `--json` for automation.

**Non-goals (YAGNI):** no config-driven policy file; no auto-repair/install; no new provisioning adapters; native-CLI
probe never exceeds `--version` (never invoke a real model turn — slow, may prompt for auth, costs tokens). Ship
exactly the five categories below; mark anything else as future, don't build it.

## 3. Locked decisions

1. **Both, layered:** host doctor = control-plane/deploy; worker doctor = runtime/engine. Shared framework, different checks.
2. **Health gate:** every check graded `ok|warn|error`; **`error → exit 1`, `warn → exit 0`, `--strict` makes `warn → exit 1`**.
   (Industry-validated: fixes npm-doctor's "error but exit 0" and brew-doctor's "warn but exit 1" complaints.)
3. **Two-tier depth:** default = existence + version + PATH/env (sub-second); `--probe` = active connectivity
   (`docker ps`, `aissh server list`, host API `/api/host/options`, native CLI `--version`).
4. **Fixed grading, by category, with in-category degradation** (e.g. provisioning: each missing → warn, whole category
   missing → warn + "local only"; engine: each missing → info, whole category missing → **error**, no local fallback).
5. **Actionable fixes:** each warn/error carries a `FixHint` (install command, PATH fix, missing env-key list, degradation note).

## 4. Architecture (approach A: shared neutral framework + per-side registration)

New neutral package **`packages/cli-doctor`** (specific-capability package — NOT core/shared-v2; allowed). Import
direction is **one-way**: `worker-cli → cli-doctor` and `host-cli → cli-doctor`, never reverse, never worker↔host.
The framework is domain-neutral (no host/worker-specific logic, no `@zonease/aiworker-{host,worker}-*` deps).

```
packages/cli-doctor/src/
  types.ts    Severity='ok'|'warn'|'error'
              CheckResult { id, category, label, severity, detail, fix?: FixHint, probed: boolean }
              Check { id, category, label, run(ctx: { probe: boolean }): CheckResult | Promise<CheckResult> }
              FixHint { message, command?, docs? }
              DoctorReport { results: CheckResult[], overall: Severity, exitCode: number }
  runner.ts   runChecks(checks, { probe, strict }) → DoctorReport
              overall = max severity; exitCode = error→1 | (strict && warn)→1 | else 0
  render.ts   renderText(report) (category-grouped, [✓]/[!]/[✗] + detail + fix) ; renderJson(report)
  probes.ts   commandExists(cmd) ; commandVersion(cmd) ; envPresence(keys[]) ; httpProbe(url, {timeoutMs})
              (thin wrappers over Bun.spawnSync / fetch; 2.5s timeouts; never throw — return structured failure)
```

- **worker-cli:** `buildWorkerChecks(ctx)` → `Check[]`; `runDoctor` becomes `render(runChecks(buildWorkerChecks(), opts))`.
  Existing context (`home/dbPath/apps/...`) stays available under `--verbose`/`--json` but no longer drives `ok`.
- **host-cli:** `buildHostChecks(ctx)` + new `aiworker-host doctor` command (cac), same framework.
- Reuse: worker engine check wraps `scanLocalEngines`; host provisioning/service checks reuse `buildHostOptions`
  (it already returns `provisioningTargetSourceError` / `soulSourceErrors`).

CLI flags (both): `--json`, `--probe`, `--strict`, `--verbose`.

## 5. Check catalog + fixed grading table

Severity columns: **default** (existence/version) and **probe** (added connectivity). "missing-all" = whole category absent.

### Worker (`aiworker doctor`)

| id | category | check | missing/bad severity | probe adds | fix |
|---|---|---|---|---|---|
| `worker.runtime.bun` | runtime | bun executable resolvable (PATH or `$HOME/.bun/bin/bun`, matching the shim fallback) | **error** if no bun anywhere | bun `--version` | `curl -fsSL https://bun.sh/install \| bash` |
| `worker.runtime.bun-path` | runtime | bare `bun` on PATH (interactive **and** non-interactive) | **warn** if binary exists but not on PATH | — | symlink `/usr/local/bin/bun` or add `/etc/profile.d/bun.sh` |
| `worker.engine.<id>` | engine | each native CLI via `scanLocalEngines` (`command -v`+`--version`) | **info** per missing CLI | `--version` already part of scan | install hint per engine |
| `worker.engine.any` | engine | at least one engine installed | **error** if **missing-all** (worker can't run a turn) | — | install at least one (e.g. `npm i -g @anthropic-ai/claude-code`) |
| `worker.service.daemon` | service | daemon lifecycle status | **warn** if not running | — | `aiworker daemon start` |
| `worker.service.db` | service | worker db reachable + migrations journal present | **error** if db unusable; **warn** if migrations folder unresolved | — | reinstall / check `WORKER_MIGRATIONS_FOLDER` |

### Host (`aiworker-host doctor`)

| id | category | check | missing/bad severity | probe adds | fix |
|---|---|---|---|---|---|
| `host.runtime.bun` | runtime | bun resolvable | **error** if absent | bun `--version` | install bun |
| `host.runtime.bun-path` | runtime | bare `bun` on PATH | **warn** if binary exists off-PATH | — | symlink/profile |
| `host.auth.logto` | auth | Logto env keys present in `process.env` (the 6 `AIWORKER_HOST_SESSION_SECRET`/`LOGTO_*`/`ALLOWED_EMAIL_DOMAINS`) — **all-or-nothing** | **error** if partially set (half-config breaks startup); **warn** if none set (dev-static only; prod needs Logto) | — | list missing keys; point at `/etc/aiworker-host/host.env` + systemd `EnvironmentFile` |
| `host.provisioning.aissh` | provisioning | `command -v aissh` | **warn** if absent | `aissh server list` ok? | install aissh / fix PATH |
| `host.provisioning.docker` | provisioning | `command -v docker` | **warn** if absent | `docker ps` ok? | install/start docker |
| `host.provisioning.any` | provisioning | aissh or docker usable (local always available) | **warn** + "remote provisioning unavailable — local only" if **missing-all** | — | install aissh or docker for remote targets |
| `host.service.api` | service | host daemon lifecycle + (probe) `/api/host/options` reachable | **warn** if daemon down | http probe of options | `aiworker-host daemon start` |
| `host.service.souls` | service | `buildHostOptions().soulReleases.length > 0` and no `soulSourceErrors` | **warn** if 0 soul releases (assignments would blind-pass soulRef) | — | build souls / ship descriptors next to host |

> The host `auth` check reads `process.env` (reflects what a `serve` would see). When run as a bare CLI without the
> EnvironmentFile sourced, missing keys are expected → the fix hint explains the EnvironmentFile path rather than crying wolf.

## 6. Output

Default human text, flutter-doctor style, grouped by category:

```
AIWorker Host Doctor

[✓] runtime      bun 1.3.14 (/root/.bun/bin/bun)
[!] runtime      bun not on PATH — works via shim, but scripts/systemd can't find `bun`
                 fix: ln -s /root/.bun/bin/bun /usr/local/bin/bun
[✓] auth         Logto configured (6/6 keys)
[!] provisioning aissh not found — remote aissh provisioning unavailable
                 fix: install aissh or fix PATH
[✓] provisioning docker 27.x
[!] service      0 soul releases visible to Host

! Doctor found issues: 0 error, 3 warning   (exit 0)
```

`--json` emits `DoctorReport`. Exit code per §3.2.

## 7. Testing & completion gate

- **Unit (framework):** `runner` exit-code/severity-aggregation table; `render` text+json; `probes` helpers with injected spawn/fetch.
- **Unit (checks):** `buildWorkerChecks`/`buildHostChecks` graded correctly under injected environments (bun present/off-PATH/absent; engines none/some; logto full/partial/none; aissh/docker present/absent; souls 0/N). Pure, dependency-injected — no real spawns.
- **Find & update existing tests** asserting `ok: true` or the current `runDoctor` JSON shape.
- **Gate = full `release:check`** (touches worker-cli + host-cli + new package) **+ inversion guards G4** — re-check the
  ownership scan does NOT false-positive on new host-cli check code (avoid bare `engine`/`session`/`domain`; `secret`
  only via the already-allowlisted `aiworker_host_session_secret` key name; `docker`/`aissh` are not forbidden tokens).
- **Live completion gate (blocks "done"):** run the built `doctor` on the **real worker (vm-node02)** — must flag the
  bun-PATH class and show engines/daemon — and the **real host (aiwork)** — must report real Logto/docker state and the
  aissh-missing + souls-0 conditions. Reality corrects the grading table.

## 8. Boundaries

- `packages/cli-doctor` neutral; import direction one-way (no host↔worker, no reverse).
- No change to canonical docs required (additive feature); update `docs/testing.md` only if a new release gate is added (it is not).
