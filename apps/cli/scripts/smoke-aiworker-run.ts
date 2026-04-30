#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
/**
 * Phase-1a success demo for PLAN-011: build the worker runtime in-process
 * via the `aiworker` CLI entry and prove the conversation loop boots
 * without binding any HTTP port. The `--dry-run` form is deterministic
 * (no executor call, no network) so it fits into CI smoke.
 *
 * Exit non-zero if the CLI doesn't reach `--dry-run: runtime constructed`
 * within a bounded timeout.
 */
import process from 'node:process'
import { spawn } from 'bun'
import consola from 'consola'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const TIMEOUT_MS = 30_000

async function main(): Promise<number> {
  const workdir = mkdtempSync(join(tmpdir(), 'aiworker-smoke-'))
  const projectDir = join(workdir, 'project')
  const homeDir = join(workdir, 'home')
  mkdirSync(join(projectDir, '.git'), { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  const env = {
    ...process.env,
    HOME: homeDir,
    AIWORKER_MASTER_KEY: MASTER_KEY,
  }
  delete env.AIWORKER_HOME
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT

  consola.info(`[smoke-aiworker-run] using tmp project ${projectDir}`)

  try {
    const entry = new URL('../src/aiworker.ts', import.meta.url).pathname

    // Step 1: init
    const initProc = spawn(['bun', entry, 'init', '--soul', 'developer'], { cwd: projectDir, env, stdout: 'pipe', stderr: 'pipe' })
    const initCode = await initProc.exited
    if (initCode !== 0) {
      consola.error(`[smoke-aiworker-run] aiworker init exited ${initCode}`)
      return 1
    }

    // Step 2: run --dry-run (no executor call; proves runtime boots)
    const runProc = spawn(['bun', entry, 'run', '--message', 'hello', '--dry-run'], {
      cwd: projectDir,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const timer = setTimeout(() => runProc.kill(), TIMEOUT_MS)
    const code = await runProc.exited
    clearTimeout(timer)
    const stdout = await new Response(runProc.stdout).text()
    const stderr = await new Response(runProc.stderr).text()

    if (code !== 0) {
      consola.error(`[smoke-aiworker-run] aiworker run exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
      return 1
    }
    const combined = `${stdout}\n${stderr}`
    if (!combined.includes('runtime constructed')) {
      consola.error(`[smoke-aiworker-run] expected "runtime constructed" in output; got:\n${combined}`)
      return 1
    }

    consola.success('[smoke-aiworker-run] PASS: aiworker run --dry-run booted the runtime with no HTTP binding')
    return 0
  }
  finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(err)
    process.exit(1)
  })
