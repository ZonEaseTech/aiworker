import { Buffer } from 'node:buffer'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { closeWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { preprocessArgv, runCli } from './aiworker'

describe('aiworker local CLI', () => {
  const originalEnv = { ...process.env }
  const originalWrite = process.stdout.write
  let root: string
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    closeWorkerDb()
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    process.stdout.write = originalWrite
    await rm(root, { recursive: true, force: true })
  })

  function argv(...args: string[]): string[] {
    return ['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args]
  }

  it('preprocesses multi-word local commands', () => {
    expect(preprocessArgv(argv('workspace', 'create', '--name', 'T')).slice(2, 3)).toEqual(['workspace create'])
    expect(preprocessArgv(argv('session', 'start', '--input', 'P')).slice(2, 3)).toEqual(['session start'])
  })

  it('initializes host-local workers without creating cwd project-scope files', async () => {
    expect(await runCli(argv('init'))).toBe(0)
    const body = JSON.parse(output) as { dbPath: string, home: string, workers: Array<{ soulId: string }>, workersRoot: string }

    expect(body.home).toBe(path.join(root, 'home'))
    expect(body.dbPath).toBe(path.join(root, 'home', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, 'home', 'workers'))
    expect(body.workers.map(worker => worker.soulId).sort()).toEqual(['devops', 'hr', 'pm', 'qa'])
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
    await expect(stat(path.join(root, 'home', 'workers', 'hr-worker', 'workspaces'))).resolves.toBeTruthy()
  })

  it('creates workspace/session command records and lists artifacts with a mocked engine', async () => {
    expect(await runCli(argv('workspace', 'create', '--name', 'Hiring', '--soul', 'hr'))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string } }).workspace.id).toBeTruthy()
    output = ''

    expect(await runCli(argv('commands'))).toBe(0)
    expect(output).toContain('dev')
    expect(output).toContain('workspace create|list|show')
    expect(output).toContain('session start|list|show')
    expect(output).not.toContain('run start')
  })
})
