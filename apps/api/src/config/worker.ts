import process from 'node:process'
import { WORKER_API_TOKEN_PATTERN, WORKER_ID_PATTERN } from '@aiworker/shared'
import { z } from 'zod'

/**
 * Worker-mode process env. PLAN-004 replaced the old `WORKER_ID` /
 * `WORKER_CONFIG_JSON` / `WORKER_CONFIG_VERSION` trio with a self-sufficient
 * bootstrap: the worker mints its own id + API token on first boot and reads
 * its config from `worker.db.worker_config`. The only thing the environment
 * still has to supply is the symmetric key that encrypts the vault.
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
})

export const workerEnv = schema.parse(process.env)
export type WorkerEnv = typeof workerEnv
