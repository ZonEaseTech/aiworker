import path from 'node:path'
import process from 'node:process'
import { resolveAiworkerHome } from '@aiworker/fs-layout'
import { WORKER_API_TOKEN_PATTERN, WORKER_ID_PATTERN } from '@aiworker/shared'
import { defaultWorkerMigrationsFolder } from '@aiworker/storage-sqlite/worker'
import { z } from 'zod'

/**
 * Worker-mode process env. PLAN-004 replaced the old `WORKER_ID` /
 * `WORKER_CONFIG_JSON` / `WORKER_CONFIG_VERSION` trio with a self-sufficient
 * bootstrap: the worker mints its own id + API token on first boot and reads
 * its config from `worker.db.worker_config`. The only thing the environment
 * still has to supply is the symmetric key that encrypts the vault.
 *
 * FEAT-015 (PLAN-007 §架构承诺 5) introduced ProcessManager — slot budget +
 * stall detection live as env vars (`MAX_CONCURRENT_TOTAL`, per-engine
 * `MAX_CONCURRENT_<ENGINE_UPPER>`, `PROCESS_*_MS`) so they don't pollute
 * `ExecutorProfile` (which FEAT-014 owns) and stay independent of any single
 * engine variant body.
 *
 * PLAN-011 phase 1a — parse lazily so `aiw --help` / `aiw --version`, which
 * transitively import this module, don't require a full env at import time.
 * Any consumer that actually *reads* a field still triggers validation.
 *
 * BUG-001 — `WORKER_DATA_ROOT` 与 `WORKER_MIGRATIONS_FOLDER` 不再硬编码到
 * `/var/lib/aiworker` / `./drizzle/worker` 这种依赖容器布局或 cwd 的值。dev /
 * 裸跑只需要 export `AIWORKER_MASTER_KEY`(+ INTERNAL_SHARED_SECRET 等) 就能起
 * 来,prod 容器仍可以显式覆盖(compose 已经写进 yml)。
 */
const schema = z.object({
  PORT: z.coerce.number().default(3001),
  WORKER_DB_PATH: z.string().default('/var/lib/aiworker/worker.db'),
  /**
   * 迁移目录。未设时回退到 `@aiworker/storage-sqlite` 内嵌路径
   * (`import.meta.url` 解析得来的绝对路径),源码运行 / 单文件 bundle 都能定位。
   * 外部 vendor 时仍可显式覆盖。
   */
  WORKER_MIGRATIONS_FOLDER: z.string().default(() => defaultWorkerMigrationsFolder),
  AIWORKER_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)'),
  AIWORKER_FORCE_ID: z.string().regex(WORKER_ID_PATTERN).optional(),
  AIWORKER_FORCE_TOKEN: z.string().regex(WORKER_API_TOKEN_PATTERN).optional(),
  AIWORKER_ADVERTISED_BASE_URL: z.string().optional(),
  /**
   * Root for per-conversation agentic-CLI workspaces (Claude Code, ACP, ...).
   * The per-worker executor config may override via `workspaceRoot`; whatever
   * value is used must pass the path-escape guard in `workspace.ts`.
   *
   * 未设时派生为 `<AIWORKER_HOME>/data-root`(默认 `~/.aiworker/data-root`),
   * 这样裸跑无需手工创建 `/var/lib/aiworker` 也能写入 workspaces。容器/systemd
   * 仍可显式覆盖到 `/var/lib/aiworker` 等路径(compose `docker-compose.yml`
   * 已显式设置)。
   */
  WORKER_DATA_ROOT: z.string().default(() => path.join(resolveAiworkerHome(), 'data-root')),
  /**
   * When set to a git repo URL or path, per-conversation workspaces are
   * provisioned as `git worktree add`; otherwise a plain empty dir.
   */
  WORKER_WORKSPACE_GIT_ORIGIN: z.string().optional(),

  /**
   * PLAN-018 / FEAT-024 worker self-enrollment：当 `AIWORKER_GATEWAY_URL` 与
   * `AIWORKER_JOIN_TOKEN` **都**设置时，`aiw serve` 会在 bootstrap 完成后用
   * outbound WS 主动 enroll 到 gateway，不需要 operator 手工 `aim pair`。
   * 缺一不触发（仅 `JOIN_TOKEN` 而无 URL → 启动时 warn）。
   * `DISPLAY_NAME` 仅作 fleet.db 展示用途，未设回落 workerId。
   */
  AIWORKER_GATEWAY_URL: z.string().url().optional(),
  AIWORKER_JOIN_TOKEN: z.string().min(1).optional(),
  AIWORKER_DISPLAY_NAME: z.string().min(1).max(80).optional(),
  /**
   * Default `@anthropic-ai/claude-code` version for the `npx` fallback used
   * by the Claude Code executor; per-worker config can override.
   */
  CLAUDE_CLI_VERSION: z.string().optional(),

  // ProcessManager（FEAT-015）—— slot 上限与 stall / GC 时延
  MAX_CONCURRENT_TOTAL: z.coerce.number().int().min(1).default(4),
  PROCESS_STALL_TIMEOUT_MS: z.coerce.number().int().min(1).default(120_000),
  PROCESS_KILL_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
  PROCESS_AUTO_CLEANUP_DELAY_MS: z.coerce.number().int().min(0).default(60_000),
  PROCESS_GC_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
})

type ParsedEnv = z.infer<typeof schema>

export type WorkerEnv = ParsedEnv & {
  readonly perEngineLimits: Readonly<Record<string, number>>
}

let cached: WorkerEnv | null = null

/**
 * 解析 `MAX_CONCURRENT_<ENGINE>` 形式的 env。约定：
 *   - env 名全大写 + 下划线
 *   - engine kind 用小写 + 中划线（dash → underscore + upper 反向映射）
 *   - 例：`MAX_CONCURRENT_CLAUDE_CODE=2` → `claude-code: 2`
 * 已知 engine：`http` / `mcp` / `cli` / `claude-code` / `acp` / `codex` /
 * `cursor`，但解析不限制白名单——任意 `MAX_CONCURRENT_<X>`（除 TOTAL）
 * 都进 perEngineLimits，便于 PLAN-007 后续扩展。
 */
function parseEngineLimits(env: NodeJS.ProcessEnv): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(env)) {
    const m = /^MAX_CONCURRENT_(.+)$/.exec(k)
    if (!m)
      continue
    if (m[1] === 'TOTAL')
      continue
    const engineKind = m[1]!.toLowerCase().replace(/_/g, '-')
    const n = Number.parseInt(v ?? '', 10)
    if (Number.isFinite(n) && n > 0)
      out[engineKind] = n
  }
  return out
}

/**
 * Test-only: drop the memoised `WorkerEnv` so the next `getWorkerEnv()` /
 * `workerEnv` access re-parses `process.env`. Production code should never
 * call this (env should not change after process start).
 *
 * @internal
 */
export function __resetWorkerEnvCacheForTest(): void {
  cached = null
}

/** Memoised parse of `process.env`. First call validates; subsequent calls are free. */
export function getWorkerEnv(): WorkerEnv {
  if (cached)
    return cached
  const parsed = schema.parse(process.env)
  cached = Object.freeze({
    ...parsed,
    perEngineLimits: Object.freeze({ ...parseEngineLimits(process.env) }),
  }) as WorkerEnv
  return cached
}

/**
 * Back-compat proxy: every existing `import { workerEnv }` keeps working.
 * The actual parse only fires on *property access*, so simply importing this
 * module (e.g. transitively from `aiw --help`) does not require a valid env.
 */
export const workerEnv: WorkerEnv = new Proxy({} as WorkerEnv, {
  get(_target, prop) {
    return getWorkerEnv()[prop as keyof WorkerEnv]
  },
  has(_target, prop) {
    return prop in getWorkerEnv()
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getWorkerEnv())
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getWorkerEnv(), prop)
  },
})
