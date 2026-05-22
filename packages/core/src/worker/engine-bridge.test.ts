import { mkdtempSync } from 'node:fs'
import { chmod, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { invokeNativeEngine } from './engine-bridge'

describe('invokeNativeEngine', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { force: true, recursive: true })
    roots = []
  })

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'aiworker-native-bridge-'))
    roots.push(root)
    return root
  }

  async function makeScript(body: string): Promise<string> {
    const dir = makeRoot()
    const file = path.join(dir, 'engine.sh')
    await writeFile(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, 'utf8')
    await chmod(file, 0o755)
    return file
  }

  it('runs a worker-scoped native command with raw stdin and cwd only', async () => {
    const cwd = path.join(makeRoot(), 'worker-cwd')
    await mkdir(cwd, { recursive: true })
    const command = await makeScript(`
printf 'cwd=%s\\n' "$PWD"
printf 'args=%s\\n' "$*"
printf 'stdin<<EOF\\n'
cat
printf '\\nEOF\\n'
`)
    const events: Array<{ kind: string }> = []
    const resolvedCwd = await realpath(cwd)

    const result = await invokeNativeEngine({
      args: ['--native-flag', 'value'],
      command,
      cwd,
      input: 'hello native engine\n',
      onEvent: event => events.push(event),
      workerId: 'worker-1',
    })

    expect(result.workerId).toBe('worker-1')
    expect(result.cwd).toBe(resolvedCwd)
    expect(result.exitCode).toBe(0)
    expect(result.status).toBe('succeeded')
    expect(result.stdout).toContain(`cwd=${resolvedCwd}`)
    expect(result.stdout).toContain('args=--native-flag value')
    expect(result.stdout).toContain('stdin<<EOF\nhello native engine\n\nEOF')
    expect(result.stdout).not.toContain('AIWorker session contract')
    expect(events.map(event => event.kind)).toContain('status')
    expect(events.map(event => event.kind)).toContain('stdout')
    expect(events.map(event => event.kind)).toContain('exit')
  })

  it('returns native failure state without inventing worker-owned outputs', async () => {
    const cwd = path.join(makeRoot(), 'worker-cwd')
    await mkdir(cwd, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'native failure\\n' >&2
exit 7
`)
    const events: Array<{ kind: string }> = []

    const result = await invokeNativeEngine({
      command,
      cwd,
      input: 'raw request\n',
      onEvent: event => events.push(event),
      workerId: 'worker-1',
    })

    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(7)
    expect(result.stderr).toContain('native failure')
    expect(result).not.toHaveProperty('workspaceId')
    expect(result).not.toHaveProperty('sessionId')
    expect(result).not.toHaveProperty('turnId')
    expect(result).not.toHaveProperty('artifacts')
    expect(events.some(event => event.kind === 'stderr')).toBe(true)
    expect(events.some(event => event.kind === 'exit')).toBe(true)
  })

  it('rejects missing cwd before starting the native engine', async () => {
    const missingCwd = path.join(makeRoot(), 'missing')
    const command = await makeScript(`cat >/dev/null`)

    await expect(invokeNativeEngine({
      command,
      cwd: missingCwd,
      input: 'raw request\n',
      workerId: 'worker-1',
    })).rejects.toThrow(`Native engine cwd not found: ${missingCwd}`)
  })
})
