# PLAN-020 CLI rename to `aiworker` + npm publish under `@zonease/aiworker-cli`

- **status**: completed
- **createdAt**: 2026-04-27 07:35
- **approvedAt**: 2026-04-27 07:45
- **completedAt**: 2026-04-27 09:00
- **relatedTask**: FEAT-028 (rename) + FEAT-027 (publish, partial)
- **mergeCommits**: S1 `6927faf` / S2 `1fd2d67` / S3 `4d0fd24` / S4 `79cadd8`（main HEAD `79cadd8`）
- **scope-update 2026-04-27 07:45**: 扩张到全 monorepo rename — 所有
  `@aiworker/*` 内部 package + apps/* package.json `name` 字段统一迁到
  `@zonease/aiworker-*` namespace（用户决策：proceed + 同步全包改名）。

## Context

User decisions 2026-04-27 (locked in FEAT-027 / FEAT-028):

- npm scope `@zonease`（owned）
- Final package: `@zonease/aiworker-cli`
- Final bin: `aiworker` (single binary, subcommand-based)
- **No backwards-compat shim** — `aiw` / `aim` never published; clean break

This plan covers two coupled deliverables:

1. **FEAT-028** (P1): rename CLI from `aiw` + `aim` two binaries to
   single `aiworker` binary with cac subcommand tree. Forward-looking
   docs only (`README.md`, `architecture.md`, `cli.md`, `deployment.md`,
   `CLAUDE.md`); historical PLAN/FEAT/BUG/changelog references stay.
2. **FEAT-027** (P2): publish `@zonease/aiworker-cli` to npmjs.com via
   GH Actions on tag push, plus optional `bun build --compile`
   single-file binaries attached to GH Releases.

The two are sequenced: rename first (so the published binary is named
right from day one), then publish.

### Existing artefacts in scope

- `apps/cli/src/aiw.ts` (worker-side bin entry, ~150 LOC of cac registrations)
- `apps/cli/src/aim.ts` (operator-side bin entry, ~280 LOC + cac argv preprocessing for two-word commands)
- `apps/cli/src/commands/*.ts` (worker command handlers, unchanged)
- `apps/cli/src/aim/commands/*.ts` (operator command handlers, unchanged)
- `apps/cli/package.json` `bin` map (currently `{ aiw, aim }`)
- `docs/cli.md` (full CLI reference, must rewrite for new tree)
- `docs/deployment.md` `aim install systemd` references
- `docs/architecture.md` references
- `README.md` (just shipped — has `aiw` / `aim` references, must update)
- `CLAUDE.md` § Project Development (references `aim` / `aiw` patterns)
- `apps/cli/src/aim/commands/install.ts` systemd unit template (`ExecStart=%h/.bun/bin/aim ...`)
- `scripts/deploy.ts` references in help text

### Existing tests

- `apps/cli/src/commands/run.test.ts` (worker run command)
- `apps/cli/src/aim/commands/{install,pair,enroll}.test.ts`

These tests currently exercise the handler functions directly (not the
CLI entry), so command tree restructure mostly doesn't affect them —
but the entry test (if any) needs updating.

## Proposal

### Stage A — CLI rename (FEAT-028)

#### A1. New entry `apps/cli/src/aiworker.ts`

Single cac instance registering the full subcommand tree:

```ts
const cli = cac('aiworker')

// worker side (was `aiw ...`):
cli.command('serve [--port <n>] [--gateway <url>]', '...').action(runServe)
cli.command('init', '...').action(runInit)
cli.command('run [--message <text>]', '...').action(runRun)
cli.command('config-show', '...').action(runConfigShow)
cli.command('config-set <json>', '...').option('--if-match <v>').action(runConfigSet)
cli.command('token-rotate', '...').action(runTokenRotate)
cli.command('approvals-list', '...').action(runApprovalsList_local)
cli.command('approvals-grant <taskId> <toolCallId>', '...').action(runApprovalsGrant_local)
cli.command('schedule-list', '...').action(runScheduleList_local)
cli.command('schedule-add', '...').action(runScheduleAdd_local)
cli.command('schedule-remove <jobId>', '...').action(runScheduleRemove_local)

// fleet management (was `aim workers ...`):
cli.command('fleet list', '...').action(runWorkersList)
cli.command('fleet info <workerId>', '...').action(runWorkersInfo)
cli.command('fleet launch', '...').action(runWorkersLaunch)
cli.command('fleet stop <workerId>', '...').action(runWorkersStop)
cli.command('fleet remove <workerId>', '...').action(runWorkersRemove)

// gateway lifecycle (was `aim gateway ...`):
cli.command('gateway start', '...').action(runGatewayStart)
cli.command('gateway status', '...').action(runGatewayStatus)
cli.command('gateway stop', '...').action(runGatewayStop)

// other operator (was `aim ...`):
cli.command('pair', '...').action(runPair)
cli.command('chat <workerId> <text>', '...').action(runChat)
cli.command('config get <workerId>', '...').action(runConfigGet)
cli.command('config set <workerId> <json>', '...').action(runConfigSet)
cli.command('token rotate <workerId>', '...').action(runTokenRotate_remote)
cli.command('approvals list', '...').action(runApprovalsList)
cli.command('approvals grant <workerId> <taskId> <toolCallId>', '...').action(runApprovalsGrant)
cli.command('schedule list <workerId>', '...').action(runScheduleList)
cli.command('schedule add <workerId>', '...').action(runScheduleAdd)
cli.command('schedule remove <workerId> <jobId>', '...').action(runScheduleRemove)
cli.command('enroll list', '...').action(runEnrollList)
cli.command('enroll approve <otp>', '...').action(runEnrollApprove)
cli.command('enroll reject <otp>', '...').action(runEnrollReject)
cli.command('logs <workerId>', '...').action(runLogs)
cli.command('install systemd', '...').action(runInstallSystemd)
```

> Note: a few command names overlap (`config get` vs `config-show`) —
> the former targets a remote worker over WS, the latter operates on
> local worker.db directly. Naming convention to disambiguate (TBD in
> implementation): worker-local commands use **dash form**
> (`config-show`), operator-remote commands use **two-word form**
> (`config get`). Same convention as `aiw` (dashed) vs `aim` (spaced)
> uses today.

cac argv preprocessing (currently in `aim.ts:272-292` for two-word
commands like `gateway start`, `config get`, `workers list`) needs to
be extended to detect ALL multi-word commands registered above and
collapse `argv[2]+argv[3]` (or 3+4 depending on tree depth — `fleet
list` is depth 2, `fleet launch` is depth 2, but `enroll approve` is
depth 2 too — manageable).

#### A2. Delete `aiw.ts` + `aim.ts`

No transition shim per user decision.

#### A3. `apps/cli/package.json`

```json
{
  "name": "@zonease/aiworker-cli",
  "bin": {
    "aiworker": "src/aiworker.ts"
  }
}
```

(Note: currently no `name` field for `apps/cli/package.json` was published-ready; this is the publish-time config.)

#### A4. systemd unit template (`apps/cli/src/aim/commands/install.ts` → rename file too)

`ExecStart=%h/.bun/bin/aim gateway start` → `ExecStart=%h/.bun/bin/aiworker gateway start`

When the npm published binary lands (Stage B), this changes to absolute
path of `aiworker` from npm install (`/usr/local/bin/aiworker` or
`$(npm bin -g)/aiworker`).

#### A5. Forward-looking docs sweep

Files to fully rewrite for `aiworker` command tree:
- `README.md`
- `docs/cli.md`
- `docs/deployment.md`
- `docs/architecture.md`
- `CLAUDE.md` § Project Development
- `apps/api/.env.example` (any aim/aiw mentions)
- `ops/compose/.env.example` (any aim/aiw mentions)

Files to LEAVE AS-IS (historical record):
- All `docs/plan/PLAN-NNN.md`
- All `docs/task/{FEAT,BUG,REFACTOR}-NNN.md`
- `docs/changelog.md` past entries

#### A6. Tests

- Existing handler tests don't change.
- Add `apps/cli/src/aiworker.test.ts`: smoke that cli is constructable,
  registers all expected commands, argv preprocessing collapses
  multi-word commands correctly.

#### A7. Local-dev convention

During development (no npm install -g), invocation becomes:

```
bun apps/cli/src/aiworker.ts serve --port 3001
bun apps/cli/src/aiworker.ts fleet list
```

The repo's `bun run smoke:aiw-run` etc. scripts in `apps/cli/package.json`
get renamed accordingly.

### Stage B — npm publish (FEAT-027)

Land Stage A first, then:

#### B1. `apps/cli/package.json` complete publish metadata

```json
{
  "name": "@zonease/aiworker-cli",
  "version": "0.1.0",
  "description": "AIWorker fleet CLI — gateway / worker / operator one binary",
  "license": "(待定 — FEAT-029 跟进)",
  "repository": { "type": "git", "url": "git+https://github.com/ZonEaseTech/aiworker.git" },
  "homepage": "https://github.com/ZonEaseTech/aiworker#readme",
  "publishConfig": { "access": "public" },
  "bin": { "aiworker": "src/aiworker.ts" },
  "files": ["src/", "README.md"],
  "engines": { "bun": ">=1.1" }
}
```

> ⚠️ Critical: cli depends on `@aiworker/core` / `@aiworker/shared` /
> etc. workspace packages. Two paths:
> - **B1a (recommended)**: bundle via `bun build --target=bun --minify
>   --outdir=dist apps/cli/src/aiworker.ts` → ship `dist/aiworker.js` as
>   the bin entry. No workspace dep resolution issue at install time.
> - B1b: also publish all `@aiworker/*` packages to npm under
>   `@zonease/*` scope. More work; deferred to FEAT-027 stage 2 if
>   needed.

Going with B1a — single bundled JS file, no internal package publishes
required.

#### B2. GH Actions `release.yml`

```yaml
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    permissions: { contents: write, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run typecheck && bun run test
      - run: bun build --target=bun --minify --outdir=apps/cli/dist apps/cli/src/aiworker.ts
      - working-directory: apps/cli
        run: bun publish --access public
        env:
          NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Compile binaries
        run: |
          bun build --compile --target=bun-linux-x64  --outfile=aiworker-linux-x64    apps/cli/src/aiworker.ts
          bun build --compile --target=bun-linux-arm64 --outfile=aiworker-linux-arm64 apps/cli/src/aiworker.ts
          bun build --compile --target=bun-darwin-x64  --outfile=aiworker-darwin-x64  apps/cli/src/aiworker.ts
          bun build --compile --target=bun-darwin-arm64 --outfile=aiworker-darwin-arm64 apps/cli/src/aiworker.ts
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            aiworker-linux-x64
            aiworker-linux-arm64
            aiworker-darwin-x64
            aiworker-darwin-arm64
```

> Blocked by: GH Actions billing (still down per 2026-04-26). If still
> blocked at Stage B, options:
> - Manual publish from local: `cd apps/cli && bun publish`
> - Self-hosted runner

#### B3. README.md install section update

```sh
# 1. Install bun (if missing)
curl -fsSL https://bun.sh/install | bash

# 2. Install aiworker
bun install -g @zonease/aiworker-cli
# or: npm install -g @zonease/aiworker-cli
# or download single-file binary from GH Releases

# 3. Use
aiworker serve
aiworker fleet list
aiworker chat <workerId> 'hello'
```

#### B4. systemd unit template (re-update from Stage A)

Stage A pointed `ExecStart` at `%h/.bun/bin/aiworker`. Once the npm
package is published, `bun install -g @zonease/aiworker-cli` resolves
to the same path → no change needed. Verify in deployment doc.

### Sequencing

| Step | Stage | Sub | What |
|---|---|---|---|
| 1 | A | A1+A2+A3 | New `aiworker.ts` entry + delete old + package.json |
| 2 | A | A4 | systemd unit template + install.ts rename |
| 3 | A | A5 | Forward-looking docs sweep |
| 4 | A | A6 | Tests |
| 5 | A | A7 | smoke verification |
| 6 | B | B1+B2 | publish metadata + release.yml |
| 7 | B | B3 | README install section |
| 8 | B | B4 | systemd template re-verify post-install |

Stage A and B are sequenced because publishing under wrong name then
renaming = bad for early adopters.

## Risks

- **Cac multi-word command collision**: command tree depth varies
  (`fleet list` = 2 words; `enroll approve <otp>` = 2 words + 1 arg;
  `gateway start` = 2 words; `install systemd` = 2 words). Need to
  test argv preprocessing on every multi-word combination. Mitigation:
  exhaustive smoke test in `aiworker.test.ts` covering all registered
  command names.
- **Workspace package resolution at npm install time**: solved by
  bundling via `bun build` to single-file. Verify the bundle actually
  loads (Bun runtime native APIs aren't always bundled cleanly —
  test with `bun run apps/cli/dist/aiworker.js serve --help` after
  build).
- **systemd template path drift**: post-publish `aiworker` lands in
  `~/.bun/bin/` (bun install -g) vs `/usr/local/bin/` (npm install -g).
  `aim install systemd` (renamed `aiworker install systemd`) should
  detect which manager installed it via `which aiworker` instead of
  hardcoding.
- **Repository docs sweep miss**: forward-looking docs are 6 files but
  internal references in code comments may also reference `aiw` /
  `aim` — coordinator to grep for `\baiw\b` / `\baim\b` (word boundaries)
  excluding `docs/plan/`, `docs/task/`, `docs/changelog.md`.
- **`@zonease/aiworker-cli` name availability**: untested — verify
  `npm view @zonease/aiworker-cli` returns 404 before Stage B.

## Scope

- **Files touched (Stage A)**: ~10
  - `apps/cli/src/aiworker.ts` (new, ~300 LOC)
  - `apps/cli/src/aiw.ts` (delete)
  - `apps/cli/src/aim.ts` (delete)
  - `apps/cli/package.json` (bin + name)
  - `apps/cli/src/aim/commands/install.ts` → unit template str
  - 6 forward-looking docs
  - `apps/cli/src/aiworker.test.ts` (new, ~50 LOC)
- **Files touched (Stage B)**: ~3
  - `apps/cli/package.json` (publish metadata)
  - `.github/workflows/release.yml` (new)
  - `README.md` install section
- **Approx LOC**: ~500 + ~150 docs
- **DB schema**: none
- **Protocol**: none
- **Production migration**: deployed gateway / aim users on
  `gateway.example.test` need to switch from `bun apps/cli/src/aim.ts ...`
  to `bun apps/cli/src/aiworker.ts ...` (Stage A) or `aiworker ...`
  (Stage B). systemd unit re-render required if previously installed.

## Alternatives

### A1 — Skip rename, publish as `@zonease/aiw` + `@zonease/aim`

- Pros: less work
- Cons: locks in cryptic names forever; npm scope sees two packages
  for one product. Rejected per user decision.

### A2 — Single binary but with explicit `worker` / `op` mode prefix

- `aiworker worker serve / aiworker op chat ...`
- Pros: very clear which side
- Cons: every command grows by 1 word; clunky. Subcommand groups
  (`fleet`, `gateway`, `enroll`, ...) already implicitly show role.

### A3 — Two binaries `aiworker` + `aiworker-fleet`

- Worker-side keeps single binary, operator side gets a separate one
- Pros: cleaner mental model (deployer's machine only needs `aiworker`,
  operator needs both)
- Cons: two packages on npm; install footprint twice. Single binary
  with subcommand split is industry-standard (`docker`, `kubectl`,
  `cargo`).

### B1 — Bundle as single file (B1a chosen) vs publish all workspace pkgs (B1b)

- B1a: 1 npm package, install = 1 download
- B1b: ~6 npm packages, version sync overhead, more flexible for
  external consumers wanting to embed the runtime
- Going with B1a; B1b can come later (FEAT-029+) if external runtime
  adoption needs it.

## Stage A0 — Full monorepo package rename（用户追加 2026-04-27 07:45）

把所有 `@aiworker/*` 内部 package 与 apps/* `package.json` `name`
字段统一迁到 `@zonease/aiworker-*` namespace。

### Rename matrix

| 当前 name | 新 name | 类型 |
|---|---|---|
| `@aiworker/core` | `@zonease/aiworker-core` | package |
| `@aiworker/shared` | `@zonease/aiworker-shared` | package |
| `@aiworker/gateway-proto` | `@zonease/aiworker-gateway-proto` | package |
| `@aiworker/storage-sqlite` | `@zonease/aiworker-storage-sqlite` | package |
| `@aiworker/fs-layout` | `@zonease/aiworker-fs-layout` | package |
| `@aiworker/api` | `@zonease/aiworker-api` | app |
| `@aiworker/cli` | `@zonease/aiworker-cli` | app（FEAT-027 published） |
| `@aiworker/gateway` | `@zonease/aiworker-gateway` | app |
| `@aiworker/web` | `@zonease/aiworker-web` | app |
| `aiworker`（root） | `aiworker`（不变） | private monorepo root |

### Mechanical changes

1. 9 份 `package.json` `name` 字段更新
2. `dependencies` / `devDependencies` 里所有 `@aiworker/X` → `@zonease/aiworker-X`
3. **全工作树 grep** `from ['"]@aiworker/` → `from ['"]@zonease/aiworker-` （估算 100-150 个 .ts 文件）
4. `@aiworker/storage-sqlite/fleet` / `/worker` subpath imports 也改
5. `bun install` 重生 `bun.lock`
6. `bun run typecheck` + `bun run test` 必须全过
7. `apps/api/src/index.ts` 等运行时入口不变（只 import path 变）
8. `scripts/deploy.ts` 不影响（不引用 `@aiworker/*`）

### Risks (additive to existing PLAN-020 §Risks)

- **某些字符串引用不在 import 语句**：例如错误消息含包名、文档代码块、
  test fixture。要全 grep `@aiworker/` 不限语境，逐条评估。
- **drizzle config files** (`packages/storage-sqlite/drizzle.*.config.ts`)
  也含包名引用——必须改。
- **公共面 re-export 路径**: `@aiworker/storage-sqlite/fleet` 等 subpath
  exports 在 package.json `exports` map 里——name 改了 subpath 不变，
  但 import 路径串改时要小心 `@aiworker/storage-sqlite/fleet` 改成
  `@zonease/aiworker-storage-sqlite/fleet` 而不是丢掉 subpath 段。

### Verification（必跑）

- `bun run typecheck` 9/9
- `bun run test` 全 pass（PLAN-019 后基线 ~470 case）
- `git grep '@aiworker/'` 返回空（除 historical docs/plan/PLAN-NNN.md /
  docs/task/{FEAT,BUG,REFACTOR}-NNN.md / docs/changelog.md 旧条目）
- `git grep "from ['\"]@aiworker"` 返回空

## Annotations

### 2026-04-27 07:45 — user `proceed + 同步修改 monorepo 里的每个包名和 app 名`

Plan approved + scope expanded. 入 implementing。BKD 编排：1 coordinator + 4 worktree subtask。

- **S1 monorepo rename**（A0）：9 个 package.json + 全工作树 import sweep + bun.lock 重生 + typecheck/test 全绿。**串行优先**——是其他 sub 的 base。
- **S2 CLI 重写**（A1-A3）：单 `aiworker.ts` entry + 删 `aiw.ts` / `aim.ts` + cac multi-word 解析覆盖所有 subcommand。依赖 S1。
- **S3 docs + systemd**（A4-A6）：5 forward-looking docs sweep + systemd unit + tests。可与 S2 并行（不同文件）。
- **S4 npm publish**（B）：bun build bundle + release.yml + GH Releases binaries。等 S2+S3 都 review。

合并顺序：S1 → S2 → S3 → S4。**强串行**——避免 import 改后 worktree merge 灾难。
