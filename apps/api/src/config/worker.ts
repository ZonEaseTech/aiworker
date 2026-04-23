import process from 'node:process'
import { WORKER_API_TOKEN_PATTERN, WORKER_ID_PATTERN } from '@aiworker/shared'
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
 */
const schema = z.object({
  PORT: z.coerce.number().default(3001),
  WORKER_DB_PATH: z.string().default('/var/lib/aiworker/worker.db'),
  WORKER_MIGRATIONS_FOLDER: z.string().default('./drizzle/worker'),
  AIWORKER_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)'),
  AIWORKER_FORCE_ID: z.string().regex(WORKER_ID_PATTERN).optional(),
  AIWORKER_FORCE_TOKEN: z.string().regex(WORKER_API_TOKEN_PATTERN).optional(),
  AIWORKER_ADVERTISED_BASE_URL: z.string().optional(),
  /**
   * Root for per-conversation agentic-CLI workspaces (Claude Code, ACP, ...).
   * The per-worker executor config may override via `workspaceRoot`; whatever
   * value is used must pass the path-escape guard in `workspace.ts`.
   */
  WORKER_DATA_ROOT: z.string().default('/var/lib/aiworker'),
  /**
   * When set to a git repo URL or path, per-conversation workspaces are
   * provisioned as `git worktree add`; otherwise a plain empty dir.
   */
  WORKER_WORKSPACE_GIT_ORIGIN: z.string().optional(),
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

const parsed = schema.parse(process.env)

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

export const workerEnv = {
  ...parsed,
  perEngineLimits: parseEngineLimits(process.env),
} as const
export type WorkerEnv = typeof workerEnv
