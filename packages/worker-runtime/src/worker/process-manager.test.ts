import type { LocalEngineProcessHandle } from './process-manager'
import { mkdtempSync } from 'node:fs'
import { chmod, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'
import { LocalEngineProcessManager } from './process-manager'

describe('LocalEngineProcessManager', () => {
  let roots: string[] = []
  let tick = 0

  afterEach(async () => {
    for (const item of roots)
      await rm(item, { force: true, recursive: true })
    roots = []
  })

  function now(): string {
    tick += 1
    return `2026-05-10T00:00:${String(tick).padStart(2, '0')}.000Z`
  }

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'aiworker-process-manager-'))
    roots.push(root)
    return root
  }

  async function makeScript(root: string): Promise<string> {
    const file = path.join(root, 'engine.sh')
    await writeFile(file, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat >/dev/null',
      'printf "started\\n" > started.txt',
      'trap \'printf "interrupted\\n" > interrupted.txt; exit 130\' INT TERM',
      'while true; do sleep 1; done',
      '',
    ].join('\n'), 'utf8')
    await chmod(file, 0o755)
    return file
  }

  async function waitForFile(file: string, expected: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await readFile(file, 'utf8')).includes(expected))
          return
      }
      catch {}
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`Timed out waiting for ${file}`)
  }

  function manager(): LocalEngineProcessManager {
    return new LocalEngineProcessManager({
      interruptGraceMs: 20,
      now,
      terminateGraceMs: 20,
      timeoutKillGraceMs: 20,
    })
  }

  it('rejects stale process leases before signaling an active process', async () => {
    const root = makeRoot()
    const command = await makeScript(root)
    const handles: LocalEngineProcessHandle[] = []
    const processes = manager()

    try {
      const result = processes.runProcess(command, [], '', 5_000, {
        cwd: root,
        invocationId: 'lease-invocation-1',
        maxBufferedLogChars: 1_000,
        onProcessHandle: handle => handles.push(handle),
      })
      await waitForFile(path.join(root, 'started.txt'), 'started')
      const handle = handles[0]
      if (!handle)
        throw new Error('Process handle was not captured.')

      await expect(
        processes.softInterrupt({ ...handle, leaseId: 'stale-lease' }, { invocationId: handle.invocationId }),
      ).rejects.toThrow(/lease/i)
      await expect(readFile(path.join(root, 'interrupted.txt'), 'utf8')).rejects.toThrow()

      await processes.softInterrupt(handle, { invocationId: handle.invocationId })
      await expect(result).resolves.toMatchObject({ code: 130 })
      await expect(readFile(path.join(root, 'interrupted.txt'), 'utf8')).resolves.toContain('interrupted')
    }
    finally {
      processes.dispose('test-cleanup')
    }
  })

  it('aborts invocation signals and interrupts active processes on dispose', async () => {
    const root = makeRoot()
    const command = await makeScript(root)
    const processes = manager()
    const run = processes.startInvocation('dispose-invocation-1')
    const result = processes.runProcess(command, [], '', 5_000, {
      cwd: root,
      invocationId: 'dispose-invocation-1',
      maxBufferedLogChars: 1_000,
      signal: run.signal,
    })
    await waitForFile(path.join(root, 'started.txt'), 'started')

    processes.dispose('runtime-dispose')

    expect(run.signal.aborted).toBe(true)
    await expect(result).resolves.toMatchObject({ code: 130 })
    await expect(readFile(path.join(root, 'interrupted.txt'), 'utf8')).resolves.toContain('interrupted')
  })

  it('interrupts a process that spawns after its invocation was already aborted', async () => {
    const root = makeRoot()
    const command = await makeScript(root)
    const processes = manager()
    const run = processes.startInvocation('pre-aborted-invocation-1')

    processes.cancelInvocation('pre-aborted-invocation-1', 'user-stop-before-spawn')
    await new Promise(resolve => setTimeout(resolve, 80))

    const startedAt = Date.now()
    const result = processes.runProcess(command, [], '', 1_500, {
      cwd: root,
      invocationId: 'pre-aborted-invocation-1',
      maxBufferedLogChars: 1_000,
      signal: run.signal,
    })

    const completed = await result
    expect(completed.stderr).toContain('Process interrupted by AIWorker Stop.')
    expect(completed.stderr).not.toContain('Process exceeded')
    expect(Date.now() - startedAt).toBeLessThan(700)
  })
})
