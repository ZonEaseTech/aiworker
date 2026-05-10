import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
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
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'worker.db')
    process.env.WORKER_WORKSPACE_ROOT = path.join(root, 'workspace')
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
    expect(preprocessArgv(argv('project', 'create', '--title', 'T')).slice(2, 3)).toEqual(['project create'])
    expect(preprocessArgv(argv('run', 'start', '--prompt', 'P')).slice(2, 3)).toEqual(['run start'])
  })

  it('runs init -> project -> run -> artifact -> lesson locally', async () => {
    expect(await runCli(argv('init', '--name', 'Hiring', '--root', root))).toBe(0)
    expect(output).toContain('"workspace"')
    const soulRoot = path.join(root, '.aiworker')
    await expect(readFile(path.join(soulRoot, 'SOUL.md'), 'utf8')).resolves.toContain('Soul workspace')
    await expect(readFile(path.join(soulRoot, 'DOMAIN.md'), 'utf8')).resolves.toContain('Domain systems')
    await expect(readFile(path.join(soulRoot, 'TEMPLATES.md'), 'utf8')).resolves.toContain('Capability templates')
    await expect(readFile(path.join(soulRoot, 'PROJECTS.md'), 'utf8')).resolves.toContain('Projects')
    await expect(stat(path.join(soulRoot, 'local'))).rejects.toThrow()
    await expect(stat(path.join(soulRoot, 'scope.json'))).rejects.toThrow()
    await expect(stat(path.join(soulRoot, 'brain-capabilities.json'))).rejects.toThrow()
    await expect(stat(path.join(soulRoot, 'executor-capabilities.json'))).rejects.toThrow()
    output = ''

    expect(await runCli(argv('project', 'create', '--title', 'Screen', '--body', 'Review candidate'))).toBe(0)
    const projectBody = JSON.parse(output) as { project: { id: string } }
    output = ''

    expect(await runCli(argv('run', 'start', '--project', projectBody.project.id))).toBe(0)
    const run = JSON.parse(output) as { artifacts: Array<{ id: string }>, lessons: unknown[], run: { status: string } }
    expect(run.run.status).toBe('succeeded')
    expect(run.artifacts).toHaveLength(1)
    output = ''

    expect(await runCli(argv('artifacts', 'show', run.artifacts[0]!.id))).toBe(0)
    expect(output).toContain('"artifact"')
    output = ''

    expect(await runCli(argv('lessons', 'list'))).toBe(0)
    expect(JSON.parse(output)).toMatchObject({ lessons: run.lessons })
  })

  it('prints the greenfield command index', async () => {
    expect(await runCli(argv('commands'))).toBe(0)
    expect(output).toContain('project create|list|show')
    expect(output).toContain('files list|show|write|delete|search')
    expect(output).not.toContain('schedule')
  })
})
