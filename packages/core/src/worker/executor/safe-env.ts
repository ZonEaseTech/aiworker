import process from 'node:process'

/**
 * Variables passed through to CLI engine subprocesses by exact name.
 * Locale / shell context only — nothing that could carry credentials.
 */
const PASSTHROUGH_EXACT = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'PWD',
  'LANG',
  'TZ',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
])

/**
 * Variables passed through by prefix. Union of every supported CLI engine's
 * native knobs — `CLAUDE_*` is harmless to a `codex` child and vice versa, so
 * the shared whitelist keeps the helper simple. If a future engine needs
 * narrower scope, add an opt-in parameter rather than carving up the list.
 */
const PASSTHROUGH_PREFIXES = [
  'LC_',
  'NODE_',
  'NPM_CONFIG_',
  'XDG_',
  'CLAUDE_',
  'CODEX_',
  'CURSOR_',
  'GEMINI_',
  'QWEN_',
]

/**
 * Git workspace helpers need only enough environment to find `git`, discover
 * user/credential config under HOME/XDG, and reach SSH/askpass helpers.
 */
const GIT_PASSTHROUGH_EXACT = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'PWD',
  'LANG',
  'TZ',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'EMAIL',
  'DISPLAY',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'SSH_ASKPASS',
  'GIT_ASKPASS',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_TERMINAL_PROMPT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_SYSTEM',
  'GIT_SSL_CAINFO',
  'GIT_SSL_CAPATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
])

const GIT_PASSTHROUGH_PREFIXES = [
  'LC_',
  'XDG_',
  'GIT_AUTHOR_',
  'GIT_COMMITTER_',
]

/**
 * Hard block on these prefixes / suffixes even if a passthrough rule matched.
 * Worker process env carries `AIWORKER_MASTER_KEY` (vault key),
 * `INTERNAL_SHARED_SECRET` (gateway bearer), `AIWORKER_JOIN_TOKEN` (self-enroll
 * bearer), and arbitrary `*_TOKEN` / `*_SECRET` / `*_API_KEY` that callers
 * inject for other reasons; none of them belong in a CLI engine subprocess.
 */
const BLOCK_PREFIXES = [
  'AIWORKER_',
  'INTERNAL_',
  'WORKER_',
]

const BLOCK_SUFFIXES = [
  '_TOKEN',
  '_SECRET',
  '_API_KEY',
  '_PRIVATE_KEY',
  '_PASSWORD',
]

function isPassthrough(
  name: string,
  exact: ReadonlySet<string>,
  prefixes: readonly string[],
): boolean {
  if (exact.has(name))
    return true
  return prefixes.some(prefix => name.startsWith(prefix))
}

function isBlocked(name: string): boolean {
  if (BLOCK_PREFIXES.some(prefix => name.startsWith(prefix)))
    return true
  if (BLOCK_SUFFIXES.some(suffix => name.endsWith(suffix)))
    return true
  return false
}

function buildFilteredEnv(
  source: NodeJS.ProcessEnv,
  exact: ReadonlySet<string>,
  prefixes: readonly string[],
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined)
      continue
    if (isBlocked(key))
      continue
    if (!isPassthrough(key, exact, prefixes))
      continue
    out[key] = value
  }
  return out
}

/**
 * Build the env passed to a CLI engine subprocess (claude-code, acp,
 * codex, cursor, plus the generic `cli` provider). Strips every secret
 * carried by the worker process env, then layers `extra` from engine
 * config on top — operator-supplied overrides bypass the block list on
 * purpose, since the worker config explicitly chose to forward them
 * (e.g. an `ANTHROPIC_API_KEY` for claude-code).
 *
 * `source` defaults to `process.env`; tests pass a stub so the result is
 * deterministic regardless of the host environment.
 */
export function buildSafeChildEnv(
  extra?: Record<string, string>,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out = buildFilteredEnv(source, PASSTHROUGH_EXACT, PASSTHROUGH_PREFIXES)
  if (extra) {
    for (const [key, value] of Object.entries(extra))
      out[key] = value
  }
  return out
}

/**
 * Build the env passed to non-agentic git workspace helper processes.
 *
 * This deliberately does not accept an `extra` override: workspace setup should
 * not receive worker secrets by default. Git still keeps normal behavior via
 * PATH lookup, HOME/XDG config discovery, author identity env, and SSH/askpass
 * hooks.
 */
export function buildSafeGitEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return buildFilteredEnv(source, GIT_PASSTHROUGH_EXACT, GIT_PASSTHROUGH_PREFIXES)
}
