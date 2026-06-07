/* eslint-disable no-template-curly-in-string */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const repoRoot = resolve(import.meta.dir, '..', '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function lineIndexMatching(content: string, pattern: RegExp): number {
  return content.split(/\r?\n/).findIndex(line => pattern.test(line))
}

function lineIndexContaining(content: string, text: string): number {
  return content.split(/\r?\n/).findIndex(line => line.includes(text))
}

describe('Worker startup contract', () => {
  it('keeps dev-local Web startup behind the CLI start worker bootstrap', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const ensureIndex = script.indexOf('apps/worker-cli/src/aiworker.ts start --host "$AIWORKER_HOST" --port "$PORT"')
    const pidReadIndex = script.indexOf('DAEMON_PID="$(read_daemon_pid)"')
    const cleanupIndex = script.indexOf('stop_daemon_after_start_failure')
    const webIndex = script.indexOf('starting Worker Web')

    expect(ensureIndex, 'dev-local must invoke aiworker start before launching Worker Web').toBeGreaterThanOrEqual(0)
    expect(pidReadIndex, 'dev-local must read the daemon pid file after aiworker start succeeds').toBeGreaterThan(ensureIndex)
    expect(cleanupIndex, 'dev-local must clean up a started daemon if pid capture fails').toBeGreaterThanOrEqual(0)
    expect(webIndex, 'dev-local should still launch Worker Web after the startup gate').toBeGreaterThanOrEqual(0)
    expect(ensureIndex, 'Worker bootstrap must run before Worker Web starts').toBeLessThan(webIndex)
    expect(pidReadIndex, 'dev-local must know the daemon pid before Worker Web starts').toBeLessThan(webIndex)
    expect(cleanupIndex, 'startup-failure cleanup must be defined before Worker Web starts').toBeLessThan(webIndex)
    expect(script, 'dev-local must not pass unsupported open flags to aiworker start').not.toMatch(/\s--(?:no-)?open(?:\s|$)/)
    expect(script, 'dev-local must not depend on parsing aiworker start stdout JSON').not.toContain('JSON.parse(input)')
  })

  it('reads the daemon pid from the fleet default worker home after aiworker start', () => {
    const script = readRepoFile('scripts/dev-local.sh')

    expect(script, 'dev-local must derive the pid file from fleet metadata after fleet start').toContain('default_worker_pid_file()')
    expect(script, 'dev-local must inspect fleet.json instead of assuming the root home pid file').toContain('fleet.json')
    expect(script, 'dev-local must resolve per-worker homes under AIWORKER_HOME/workers').toContain('workers')
    expect(script, 'dev-local must read the fleet worker pid file after aiworker start').toContain('pid_file="$(default_worker_pid_file)"')
  })

  it('loads Worker daemon process env when starting the dev Worker daemon', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const envFileIndex = script.indexOf('WORKER_DAEMON_ENV_FILE="$ROOT_DIR/packages/worker-daemon/.env"')
    const startIndex = script.indexOf('bun --env-file="$WORKER_DAEMON_ENV_FILE" apps/worker-cli/src/aiworker.ts start')

    expect(envFileIndex, 'dev-local must name the Worker daemon env file explicitly').toBeGreaterThanOrEqual(0)
    expect(startIndex, 'dev-local must pass Worker daemon env to the CLI start path').toBeGreaterThan(envFileIndex)
  })

  it('writes an agent-readable worker dev manifest with fixed API and Web URLs', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const statusScript = readRepoFile('scripts/dev-status.sh')

    expect(script).toContain('AIWORKER_WORKER_MANIFEST="${AIWORKER_WORKER_MANIFEST:-${AIWORKER_HOME}/dev-worker.json}"')
    expect(script).toContain('default_worker_id()')
    expect(script).toContain('"profile": "worker"')
    expect(script).toContain('"apiUrl": "$AIWORKER_API_URL"')
    expect(script).toContain('"webUrl": "http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}"')
    expect(script).toContain('"kind": "worker-daemon"')
    expect(script).toContain('"kind": "worker-web"')
    expect(statusScript).toContain('AIWORKER_WORKER_MANIFEST="${AIWORKER_WORKER_MANIFEST:-${AIWORKER_HOME}/dev-worker.json}"')
    expect(statusScript).toContain('[dev:status] manifest:')
  })

  it('runs Worker Web Vite in a fixed tmux session instead of a foreground child', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const cleanScript = readRepoFile('scripts/dev-clean.sh')
    const statusScript = readRepoFile('scripts/dev-status.sh')

    expect(script).toContain('AIWORKER_WORKER_WEB_TMUX_SESSION="${AIWORKER_WORKER_WEB_TMUX_SESSION:-aiworker-vite-worker}"')
    expect(script).toContain('require_tmux')
    expect(script).toContain('restart_worker_web_tmux')
    expect(script).toContain('tmux new-session')
    expect(script).toContain('--strictPort')
    expect(script).toContain('"tmuxSession": "$AIWORKER_WORKER_WEB_TMUX_SESSION"')
    expect(script).not.toContain('WEB_PID=$!')
    expect(cleanScript).toContain('tmux kill-session -t "$AIWORKER_WORKER_WEB_TMUX_SESSION"')
    expect(statusScript).toContain('tmux has-session -t "$AIWORKER_WORKER_WEB_TMUX_SESSION"')
  })

  it('shell-quotes Worker Web tmux command arguments that come from environment configuration', () => {
    const script = readRepoFile('scripts/dev-local.sh')

    expect(script).toContain('shell_quote()')
    expect(script).toContain('AIWORKER_API_URL=$(shell_quote "$AIWORKER_API_URL")')
    expect(script).toContain('bun run dev --host $(shell_quote "$AIWORKER_HOST") --port $(shell_quote "$AIWORKER_WEB_PORT") --strictPort')
  })

  it('restarts an existing dev daemon before checking the daemon port', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const restartCallLine = lineIndexMatching(script, /^restart_existing_dev_daemon$/)
    const verifiedStopCallLine = lineIndexMatching(script, /^\s*stop_verified_dev_daemon$/)
    const aiworkerListenerCleanupLine = lineIndexMatching(script, /^\s*kill_matching_aiworker_listener "\$PORT"$/)
    const daemonPortCheckLine = lineIndexMatching(script, /^ensure_port_free "\$PORT"$/)
    const startLine = lineIndexMatching(script, /^start_daemon_with_worker$/)

    expect(restartCallLine, 'dev-local must have an explicit restart gate call for stale dev daemons').toBeGreaterThanOrEqual(0)
    expect(verifiedStopCallLine, 'dev-local restart gate must verify and stop the current AIWORKER_HOME daemon').toBeGreaterThanOrEqual(0)
    expect(aiworkerListenerCleanupLine, 'dev-local restart gate must clear AIWorker-owned listeners on the target daemon port').toBeGreaterThan(verifiedStopCallLine)
    expect(restartCallLine, 'dev-local must restart/cleanup before treating the daemon port as unavailable').toBeLessThan(daemonPortCheckLine)
    expect(daemonPortCheckLine, 'dev-local must still fail fast after cleanup if a non-AIWorker process owns the daemon port').toBeLessThan(startLine)
  })

  it('verifies daemon pid-file ownership before invoking daemon stop', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const ownershipCheckLine = lineIndexContaining(script, 'if is_aiworker_dev_daemon_process "$command" "$cwd"; then')
    const daemonStopLine = lineIndexContaining(script, 'apps/worker-cli/src/aiworker.ts daemon stop')

    expect(script, 'dev-local must read the daemon pid file itself before deciding whether to stop it').toContain('read_existing_daemon_pid')
    expect(script, 'dev-local must remove polluted daemon metadata instead of letting aiworker start reuse it').toContain('remove_daemon_metadata_files')
    expect(ownershipCheckLine, 'dev-local must verify the pid-file process identity before daemon stop').toBeGreaterThanOrEqual(0)
    expect(daemonStopLine, 'dev-local must only invoke daemon stop after the pid-file process is classified as AIWorker-owned').toBeGreaterThan(ownershipCheckLine)
  })

  it('uses a path-boundary-safe cwd check for AIWorker daemon ownership', () => {
    const script = readRepoFile('scripts/dev-local.sh')

    expect(script, 'dev-local must canonicalize the repo root before comparing process cwd').toContain('pwd -P')
    expect(script, 'dev-local must centralize cwd ownership classification behind a path-boundary helper').toContain('is_path_inside_root')
    expect(script, 'dev-local must accept the repo root itself as owned').toContain('"$candidate" == "$ROOT_DIR"')
    expect(script, 'dev-local must accept only descendants under ROOT_DIR/ as owned').toContain('"$candidate" == "$ROOT_DIR/"*')
    expect(script, 'dev-local must not use prefix-only cwd matching that treats aiworker-old as aiworker-owned').not.toContain('"$cwd" == "$ROOT_DIR"*')
  })

  it('treats process cwd lookup failures as non-owned instead of failing dev startup', () => {
    const script = readRepoFile('scripts/dev-local.sh')

    expect(script, 'dev-local must look up process cwd through a helper').toContain('process_cwd()')
    expect(script, 'process_cwd must tolerate lsof or pipeline failure under pipefail').toContain('| head -n 1 || true')
    expect(script, 'ownership checks must still reject empty cwd through the path-boundary helper').toContain('is_path_inside_root "$cwd"')
  })

  it('limits automatic daemon-port cleanup to AIWorker dev processes', () => {
    const script = readRepoFile('scripts/dev-local.sh')

    expect(script, 'dev-local must classify AIWorker daemon listeners before killing them').toContain('is_aiworker_dev_daemon_process')
    expect(script, 'dev-local may only auto-kill the source-checkout daemon foreground command').toContain('apps/worker-cli/src/aiworker.ts daemon foreground')
    expect(script, 'dev-local must report skipped non-AIWorker listeners instead of killing them').toContain('skip pid=$pid port=$port')
    expect(script, 'dev-local must keep the generic port-free gate for non-AIWorker conflicts').toContain('ensure_port_free "$PORT"')
  })
})
