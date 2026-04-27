# PLAN-023 Phase A — Worker 项目级落位（fs-layout scope 解析 + CLI init/scope 命令）

- **status**: completed
- **createdAt**: 2026-04-27 18:30
- **approvedAt**: 2026-04-27 19:00
- **completedAt**: 2026-04-27 19:30
- **relatedTask**: REFACTOR-011 + FEAT-036（双 task 协同；本 plan 同时覆盖两条工作）

> 隶属 PLAN-021（master）Phase A。后续 Phase B/D/C/E 将分别由 PLAN-024 / PLAN-025 / PLAN-026 / PLAN-027 承接。

## 现状

### 1. fs-layout 当前是「单根多 worker」结构

`packages/fs-layout/src/index.ts:32-49`：

- `resolveAiworkerHome()`：仅有 `AIWORKER_HOME` env > `~/.aiworker` 两档
- `resolveWorkerHome(workerId)` = `<home>/workers/<workerId>/`
- `ensureWorkerHome(workerId)` 幂等创建 `workers/<workerId>/{AGENT.md, SOUL.md, USER.md, brain/{MEMORY.md, memories/, skills/}, workspaces/, ...}`，并种 `AGENT.md` / `SOUL.md` / `USER.md` / `MEMORY.md` 模板

文档注释暗示 `worker.db` 在 `workers/<workerId>/worker.db`，但**实际 `WORKER_DB_PATH` 默认是 `<AIWORKER_HOME>/worker.db`**（`packages/core/src/config/worker.ts:38`）—— 即「一个 home 里只能有一个 worker.db」，与 doc 中的多 worker 子目录设想脱节。

### 2. CLI init / dotenv-bootstrap 假设 user 级单 home

- `apps/cli/src/commands/init.ts`：直接 `loadWorkerContext()`，无 scope 概念。
- `apps/cli/src/lib/dotenv-bootstrap.ts:26`：`DEFAULT_HOME = path.join(homedir(), '.aiworker')`，读 `AIWORKER_HOME` env 但不识别 cwd。
- 已有 `BootstrapOptions.home` 入参（line 38），可被外部传值，但 CLI 入口当前不传。

### 3. 多消费者依赖 `resolveAiworkerHome()` 系列 API

`grep` 显示 25 个文件引用：
- `packages/core/src/config/worker.ts`（WORKER_DB_PATH / WORKER_DATA_ROOT 默认值）
- `packages/core/src/worker/bootstrap/identity.ts`（loadOrMintIdentity → ensureWorkerHome）
- `apps/cli/src/aim/commands/install.ts`（systemd unit 渲染）
- `apps/cli/src/aim/state.ts` / `daemon.ts`（aim 元数据落位）
- `docs/{architecture,deployment,cli}.md` / `README.md`（用户文档）
- 测试：`packages/core/src/config/worker.test.ts` / `safe-env.test.ts` / `bootstrap.test.ts`

任何 API 签名破坏都会牵动这些处。改动策略：**保持 `resolveAiworkerHome()` / `resolveWorkerHome()` 等签名不变**，内部转调 scope 解析，零回归。

### 4. 已落 user 偏好（PLAN-021 批注 §决策点）

- Engine credential 全 user 级：`<project>/.aiworker/local/` 仅放 worker 自身产物，`~/.claude.json` / `~/.codex/` 等 host 级保持。
- 后续 Phase 都基于 project layout，故 Phase A 必须先把基础设施铺好。

### 5. ID 修订

PLAN-021 batch §6 决议「分批起子 PLAN-022~026」时 ID 池被 PLAN-022（独立 Web UI epic）抢占。本 plan 改用 PLAN-023；后续 Phase 顺移：PLAN-024（Phase B）、PLAN-025（Phase D）、PLAN-026（Phase C）、PLAN-027（Phase E）。

## 方案

> 拆为两个 task 协同。本 plan 是 Phase A 的总协调 + 设计契约。

### Part 1 — REFACTOR-011：fs-layout 改造

**新增 API**：

```ts
// packages/fs-layout/src/index.ts

export type AiworkerScope = 'explicit' | 'project' | 'user'

export interface AiworkerScopeResult {
  scope: AiworkerScope
  home: string                  // 绝对路径
  projectRoot?: string          // scope='project' 时填，指向 <project>/
  source: 'cli-flag' | 'env' | 'project-detect' | 'user-default'
}

export interface ResolveScopeOptions {
  cwd?: string                  // 默认 process.cwd()
  explicitHome?: string         // CLI --aiworker-home 透传
  disableProjectDetect?: boolean
}

export function resolveAiworkerScope(opts?: ResolveScopeOptions): AiworkerScopeResult
export function resolveProjectRoot(cwd?: string): string | null
export async function ensureProjectAiworker(projectRoot: string): Promise<void>
```

**优先级**（高 → 低）：
1. `opts.explicitHome`（CLI `--aiworker-home <path>`）→ scope='explicit'
2. `process.env.AIWORKER_HOME`（兼容现有 systemd / docker）→ scope='explicit'
3. `resolveProjectRoot(cwd)` 不为 null → scope='project'，home = `<projectRoot>/.aiworker`
4. fallback → scope='user'，home = `~/.aiworker`

**`resolveProjectRoot(cwd)` 算法**：

```
cur = path.resolve(cwd ?? process.cwd())
while (true):
  if isDir(`${cur}/.aiworker`): return cur
  parent = path.dirname(cur)
  if parent === cur: return null    # fs root
  if isDir(`${cur}/.git`) and not isDir(`${cur}/.aiworker`): return null  # git root，不跨 git 边界
  cur = parent
```

**`resolveAiworkerHome()` 内部转写**：

```ts
export function resolveAiworkerHome(): string {
  return resolveAiworkerScope().home
}
```

**`resolveWorkerHome(workerId)` 内部分支**：

```ts
export function resolveWorkerHome(workerId: string): string {
  const { scope, home } = resolveAiworkerScope()
  if (scope === 'project') {
    // 一 project 一 worker，无 workers/<id>/ 中间层
    // workerId 仅作 identity 落 db，不入路径
    return home
  }
  return path.join(home, 'workers', workerId)
}
```

> ⚠️ 行为变化：project 模式下 `resolveWorkerHome(id)` 不再嵌 `workers/<id>/`。兼容性靠 user 模式分支保住——已部署的 systemd / docker 走 `AIWORKER_HOME` env，命中 `scope='explicit'`，仍走原 `<home>/workers/<id>/` 路径（**但 explicit 模式行为如何，下面 §5 备选方案需用户拍板**）。

**`ensureProjectAiworker(projectRoot)`**：

```
mkdir -p <projectRoot>/.aiworker/{skills,memories,local,local/workspaces}
seedIfAbsent .aiworker/AGENT.md          # 默认人格模板
seedIfAbsent .aiworker/SOUL.md
seedIfAbsent .aiworker/USER.md
seedIfAbsent .aiworker/MEMORY.md         # 长期事实
seedIfAbsent .aiworker/ROLLUP.md         # 占位（Phase E cron 写入）
seedIfAbsent .aiworker/mcp.json          # 占位 { "servers": {} }（Phase D 启用）
seedIfAbsent .aiworker/local/.gitignore  # *.db、*.db-wal、*.db-shm、identity.json、.env、workspaces/、tmp/
seedIfAbsent .aiworker/.gitignore        # local/
chmod 0700 .aiworker/local/              # secrets 目录权限
```

**新增导出**：

```ts
export function resolveProjectMcpJsonPath(home: string): string  // <home>/mcp.json
export function resolveLocalWorkspacesRoot(home: string): string // <home>/local/workspaces
export function resolveLocalWorkerDbPath(home: string): string   // <home>/local/worker.db
export function resolveLocalEnvPath(home: string): string        // <home>/local/.env
export function resolveRollupMdPath(home: string): string        // <home>/ROLLUP.md
```

**单测覆盖**（packages/fs-layout/test/）：
- explicit > env > project-detect > user-default 优先级
- 跨 git 边界停止（不跨 monorepo）
- 子目录命中最近祖先
- `ensureProjectAiworker` 幂等 + 模板内容
- `resolveWorkerHome(id)` 在 project 模式下退化为 home

### Part 2 — FEAT-036：CLI 命令改造

**`aiworker init`** 重构（`apps/cli/src/commands/init.ts`）：

```ts
export async function runInit(opts: { global?: boolean, force?: boolean }): Promise<void> {
  if (opts.global) {
    // 走原 user 级路径
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] user-scope worker ${ctx.workerId} ready`)
    return
  }

  const cwd = process.cwd()
  const projectRoot = resolveProjectRoot(cwd)
  // 已存在 .aiworker/ → idempotent re-init
  if (projectRoot) {
    await ensureProjectAiworker(projectRoot)
    process.env.AIWORKER_HOME ??= path.join(projectRoot, '.aiworker', 'local')  // 关键：让 dotenv-bootstrap + worker config 都走 project local 子目录
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${projectRoot})`)
    return
  }
  // 新建 .aiworker/，前提：cwd 是 git repo
  if (!opts.force && !await isGitRepo(cwd))
    throw new CliError('aiworker init 需要 cwd 是 git 仓库（保护 worker.db 不被误 commit）；如确认无 git 隔离需求，重新执行：aiworker init --global 或 aiworker init --force')

  await ensureProjectAiworker(cwd)
  process.env.AIWORKER_HOME ??= path.join(cwd, '.aiworker', 'local')
  const ctx = await loadWorkerContext()
  consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${cwd})`)
}
```

> 关键设计：project 模式下 `AIWORKER_HOME` 被指向 `.aiworker/local/`，让现有 `WORKER_DB_PATH` 默认值自动落 `<project>/.aiworker/local/worker.db`，**下游零改动**——所有读 `resolveAiworkerHome()` 的代码自动获得 project 隔离。

> 副效应：`worker.db` 与 SOUL.md/AGENT.md 等 markdown 现在分两层（local/ 与 .aiworker/ 顶层），需要在 `ensureWorkerHome(id)` 改为不再种 SOUL/AGENT 模板（已由 `ensureProjectAiworker` 种），避免重复。具体由 REFACTOR-011 协同处理。

**`aiworker scope`** 新命令（`apps/cli/src/commands/scope.ts`）：

```ts
export async function runScope(): Promise<void> {
  const result = resolveAiworkerScope()
  consola.box([
    `Scope:        ${result.scope}`,
    `Home:         ${result.home}`,
    `Source:       ${result.source}`,
    result.projectRoot ? `Project root: ${result.projectRoot}` : null,
  ].filter(Boolean).join('\n'))

  // 列各文件存在性
  const files = [
    ['AGENT.md', resolveAgentMdPath(...)],
    ['SOUL.md', resolveSoulMdPath(...)],
    ['USER.md', resolveUserMdPath(...)],
    ['MEMORY.md', ...],
    ['ROLLUP.md', resolveRollupMdPath(...)],
    ['mcp.json', resolveProjectMcpJsonPath(...)],
    ['local/worker.db', resolveLocalWorkerDbPath(...)],
    ['local/.env', resolveLocalEnvPath(...)],
  ]
  for (const [label, p] of files) {
    const exists = await access(p).then(() => true, () => false)
    consola.info(`  ${exists ? '✓' : '·'} ${label}  ${p}`)
  }
}
```

**`apps/cli/src/index.ts` 顶部 dotenv 调用改造**：

```ts
const scope = resolveAiworkerScope({ explicitHome: parseFlag('--aiworker-home') })
bootstrapDotenv({ home: scope.home })
```

**`.gitignore` 模板内容**（写入 `<project>/.aiworker/local/.gitignore`）：

```
*
!.gitignore
```

> 极简策略：`local/` 子目录全部 ignore，仅保留 `.gitignore` 自身。worker.db / identity.json / .env / workspaces/ 全部进 local/，天然不入 git。`<project>/.aiworker/.gitignore` 仅 ignore `local/`，让 SOUL/AGENT/MEMORY/ROLLUP/mcp.json/skills/ 默认入 git。

**README + docs/cli.md** 更新（quickstart 段）：

```
# 1. 进入项目目录
cd ~/code/my-project

# 2. 初始化 worker（默认 project 模式，要求 git repo）
aiworker init

# 输出：
# ✓ project-scope worker wkr_xxx ready (~/code/my-project)
# Master key written to .aiworker/local/.env (chmod 0600)

# 3. 启 worker
aiworker serve  # 自动按 cwd 找到 .aiworker/

# 4. 想要 user 级（host 上唯一 worker）
aiworker init --global
```

### 推进顺序

1. REFACTOR-011 单 PR 落 fs-layout（pure additions + 内部转写，可独立单测）
2. FEAT-036 单 PR 落 CLI（依赖 REFACTOR-011 的 API），含 docs 更新
3. 合并后跑 `apps/cli/scripts/smoke-aiworker-fleet.ts` 验证 user 级仍通

## 风险

1. **explicit / project 优先级冲突**：用户在项目目录里 export 了 `AIWORKER_HOME=~/.aiworker`（旧脚本），按设计 explicit 优先 → 命中 user 级 home，与项目 `.aiworker/` 共存但不互通。**对策**：`aiworker scope` 输出明示 source，发现冲突在 init 时 warn。

2. **systemd unit 模板**（`apps/cli/src/aim/commands/install.ts`）已显式设 `AIWORKER_HOME=%h/.aiworker` —— 命中 scope='explicit'，行为不变。零回归。

3. **现有 `ensureWorkerHome(id)` 在 project 模式下职责重叠**：会把 SOUL/AGENT 等模板再种一遍到 `<project>/.aiworker/`。**对策**：REFACTOR-011 内 `ensureWorkerHome` 在 project 模式下变成 no-op（templates 已被 `ensureProjectAiworker` 处理）。

4. **dotenv-bootstrap 已 mint 过 user 级 master key 的用户在新项目首次 `aiworker init` 会再 mint 一份 project key**——这是预期行为（每 worker 独立 master key），但用户可能期望「项目复用 user 级 key」。**对策**：文档明示「每 worker 独立 master key 是数据安全边界」；后续 Phase D 提供 secrets vault inherit 解决「OpenAI key 等可共享 secret」的复用诉求，**不再共享 master key**。

5. **`<project>/.aiworker/` 在非 git repo 创建会污染随机目录**（如 `/tmp` 试跑）—— `aiworker init` 在 cwd 非 git repo 时报错（除非 `--force` / `--global`），从源头防御。

6. **多 worker per host 的 user 级用户**（极少数，但 fs-layout doc 提及过）：原 `~/.aiworker/workers/<id>/` 多 worker 模式仍保留（user / explicit scope 走原路径）；project scope 才退化为「一 project 一 worker」。

7. **路径权限**：`local/` 必须 0700（含 master key 与 worker.db）。`ensureProjectAiworker` 显式 chmod，`bootstrapDotenv` 已 chmod 0600 给 .env。

## 工作量

- REFACTOR-011：~5 文件改动（fs-layout/src/index.ts 主改 + 新单测 + 引用更新），低风险，~0.5 day
- FEAT-036：~6 文件改动（commands/init.ts 重构、新增 commands/scope.ts、apps/cli/src/index.ts dotenv 入口、docs/cli.md、README quickstart 段、smoke 脚本）+ e2e 验证，低-中风险，~1 day

合计 ~1.5 day dev，加 review/QA ~1 周内完结。

## 备选方案

**方案 A — explicit scope 行为（推荐）**：保留原语义，`AIWORKER_HOME` 显式设置 → 路径直接 = `<home>/workers/<id>/`（user 级多 worker 模型）。理由：systemd / docker 已落地的部署习惯不变，零回归。

**方案 B — explicit scope 同 project**：`AIWORKER_HOME` 显式设置 → 也按 project 退化为「单 worker, 无 workers/<id>/ 中间层」。优点：心智模型统一；缺点：破坏现有 systemd 部署的 worker.db 路径（`%h/.aiworker/workers/<id>/worker.db` → `%h/.aiworker/worker.db`），有迁移成本。

→ 推荐 **方案 A**，零回归优先。

**`.aiworker/local/.gitignore` 内容**：
- 选项 1：`*` + `!.gitignore`（极简，全 ignore）—— 推荐
- 选项 2：列出具体文件 `worker.db*`、`identity.json`、`.env`、`workspaces/` —— 可读但易遗漏新产物

→ 推荐 **选项 1**。

**`aiworker init` 在非 git repo 是否报错**：
- 报错 + `--force` / `--global` escape hatch（推荐，防误污染）
- 仅 warn 不 block

→ 推荐 **报错**。

## 批注

### 2026-04-27 19:00 — 批准 + 3 项决策按推荐执行

- explicit scope 行为 = **方案 A**（保留 `<home>/workers/<id>/`，零回归 systemd / docker）
- `.aiworker/local/.gitignore` = **选项 1**（极简 `* + !.gitignore`）
- 非 git repo `aiworker init` = **报错 + `--force`/`--global` 逃生**

实施顺序：REFACTOR-011（fs-layout） → FEAT-036（CLI），两个独立单测 + smoke 验证。
