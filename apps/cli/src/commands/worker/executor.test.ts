import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')

function isolatedEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      env[key] = value
  }
  env.HOME = home
  env.NO_COLOR = '1'
  delete env.AIWORKER_HOME
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_MIGRATIONS_FOLDER
  return { ...env, ...extra }
}

async function runCli(args: string[], cwd: string, home: string, extraEnv: Record<string, string> = {}): Promise<{ exitCode: number, output: string }> {
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd,
    env: isolatedEnv(home, extraEnv),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(proc.stdout)
  const stderr = new TextDecoder().decode(proc.stderr)
  return { exitCode: proc.exitCode, output: `${stdout}\n${stderr}` }
}

async function initProject(): Promise<{ home: string, project: string, root: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'aiworker-executor-capability-'))
  const home = await mkdtemp(path.join(tmpdir(), 'aiworker-executor-capability-home-'))
  const project = path.join(root, 'repo')
  await mkdir(project, { recursive: true })
  const init = await runCli(['init', '--soul', 'developer'], project, home)
  expect(init.exitCode).toBe(0)
  return { home, project, root }
}

describe('aiworker executor capability commands', () => {
  it('adds executor MCP declarations without touching the brain/runtime mcp descriptor', async () => {
    const { home, project } = await initProject()
    const beforeMcp = await readFile(path.join(project, '.aiworker', 'mcp.json'), 'utf8')

    const add = await runCli([
      'executor',
      'mcp',
      'add',
      'context7',
      '--engine',
      'codex',
      '--url',
      'https://mcp.example.com/mcp',
      '--description',
      'Docs MCP',
    ], project, home)

    expect(add.exitCode).toBe(0)
    expect(add.output).toContain('[aiworker executor mcp add] added')
    const manifest = JSON.parse(await readFile(path.join(project, '.aiworker', 'executor-capabilities.json'), 'utf8'))
    expect(manifest.engines.codex.mcp.context7).toEqual({
      description: 'Docs MCP',
      scope: 'project',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
    })
    expect(await readFile(path.join(project, '.aiworker', 'mcp.json'), 'utf8')).toBe(beforeMcp)
  })

  it('dry-runs executor MCP sync as engine CLI projection commands', async () => {
    const { home, project } = await initProject()
    const add = await runCli([
      'executor',
      'mcp',
      'add',
      'filesystem',
      '--engine',
      'claude-code',
      '--command',
      'npx',
      '--arg',
      '@modelcontextprotocol/server-filesystem',
      '--arg',
      '.',
    ], project, home)
    expect(add.exitCode).toBe(0)

    const sync = await runCli(['executor', 'mcp', 'sync', '--engine', 'claude-code', '--dry-run'], project, home)

    expect(sync.exitCode).toBe(0)
    expect(sync.output).toContain('[aiworker executor mcp sync] dry-run claude-code')
    expect(sync.output).toContain('claude mcp add filesystem --scope project -- npx @modelcontextprotocol/server-filesystem .')
  })

  it('doctor rejects plaintext secret-like executor MCP fields', async () => {
    const { home, project } = await initProject()
    await writeFile(path.join(project, '.aiworker', 'executor-capabilities.json'), `${JSON.stringify({
      engines: {
        codex: {
          mcp: {
            privateDocs: {
              headers: {
                Authorization: 'Bearer plain',
              },
              scope: 'project',
              transport: 'streamable-http',
              url: 'https://mcp.example.com/mcp',
            },
          },
        },
      },
      schemaVersion: 1,
    }, null, 2)}\n`, 'utf8')

    const doctor = await runCli(['executor', 'doctor', '--engine', 'codex'], project, home)

    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('executor.mcp.plaintext_secret')
  })

  it('non-dry-run sync refuses unresolved secretRef values', async () => {
    const { home, project } = await initProject()
    await writeFile(path.join(project, '.aiworker', 'executor-capabilities.json'), `${JSON.stringify({
      engines: {
        codex: {
          mcp: {
            privateDocs: {
              headers: {
                Authorization: { secretRef: 'executor.private-docs.authorization' },
              },
              scope: 'project',
              transport: 'streamable-http',
              url: 'https://mcp.example.com/mcp',
            },
          },
        },
      },
      schemaVersion: 1,
    }, null, 2)}\n`, 'utf8')

    const sync = await runCli(['executor', 'mcp', 'sync', '--engine', 'codex'], project, home)

    expect(sync.exitCode).toBe(1)
    expect(sync.output).toContain('executor.mcp.secret_ref_projection_unsupported')
  })

  it('sync runs engine CLI with project cwd and without AIWorker secrets', async () => {
    const { home, project } = await initProject()
    const binDir = await mkdtemp(path.join(tmpdir(), 'aiworker-fake-codex-bin-'))
    const traceFile = path.join(binDir, 'trace.json')
    const codexBin = path.join(binDir, 'codex')
    await writeFile(codexBin, [
      '#!/usr/bin/env bun',
      'import { writeFileSync } from "node:fs"',
      'writeFileSync(process.env.CODEX_TRACE_FILE!, JSON.stringify({',
      '  argv: process.argv.slice(2),',
      '  cwd: process.cwd(),',
      '  env: {',
      '    AIWORKER_MASTER_KEY: process.env.AIWORKER_MASTER_KEY ?? null,',
      '    CODEX_TRACE_FILE: process.env.CODEX_TRACE_FILE ?? null,',
      '  },',
      '}))',
      '',
    ].join('\n'), 'utf8')
    await chmod(codexBin, 0o755)

    const add = await runCli([
      'executor',
      'mcp',
      'add',
      'context7',
      '--engine',
      'codex',
      '--url',
      'https://mcp.example.com/mcp',
    ], project, home)
    expect(add.exitCode).toBe(0)

    const sync = await runCli(['executor', 'mcp', 'sync', '--engine', 'codex'], project, home, {
      AIWORKER_MASTER_KEY: 'should-not-leak',
      CODEX_TRACE_FILE: traceFile,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    })

    expect(sync.exitCode).toBe(0)
    expect(existsSync(traceFile)).toBe(true)
    const trace = JSON.parse(await readFile(traceFile, 'utf8')) as {
      argv: string[]
      cwd: string
      env: { AIWORKER_MASTER_KEY: string | null, CODEX_TRACE_FILE: string | null }
    }
    expect(trace.cwd).toBe(await realpath(project))
    expect(trace.argv).toEqual([
      'mcp',
      'add',
      'context7',
      '--scope',
      'project',
      '--transport',
      'streamable-http',
      '--url',
      'https://mcp.example.com/mcp',
    ])
    expect(trace.env.AIWORKER_MASTER_KEY).toBeNull()
    expect(trace.env.CODEX_TRACE_FILE).toBe(traceFile)
  })
})
