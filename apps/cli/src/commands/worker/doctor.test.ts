import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

const cliEntry = path.resolve(import.meta.dir, '..', '..', 'aiworker.ts')

function isolatedEnv(home: string): Record<string, string> {
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
  return env
}

async function runCli(args: string[], cwd: string, home: string): Promise<{ exitCode: number, output: string }> {
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd,
    env: isolatedEnv(home),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(proc.stdout)
  const stderr = new TextDecoder().decode(proc.stderr)
  return { exitCode: proc.exitCode, output: `${stdout}\n${stderr}` }
}

describe('aiworker doctor', () => {
  it('validates a freshly initialized project without bootstrapping extra state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)

    const doctor = await runCli(['doctor'], project, home)

    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain('[aiworker doctor] capability validation')
    expect(doctor.output).toContain('Status: PASS')
    expect(doctor.output).toContain('PASS    policy.json')
    expect(doctor.output).toContain('PASS    capability-packs.json')
  })

  it('fails when MCP descriptors contain plaintext secrets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(path.join(project, '.aiworker', 'mcp.json'), `${JSON.stringify({
      servers: {
        docs: {
          token: 'plain-secret',
          transport: 'streamable-http',
        },
      },
    }, null, 2)}\n`, 'utf8')

    const doctor = await runCli(['doctor'], project, home)

    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('Status: FAIL')
    expect(doctor.output).toContain('mcp.plaintext_secret')
    expect(doctor.output).toContain('mcp.http_missing_url')
  })

  it('does not create worker state when run outside an initialized project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-empty-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-empty-home-'))

    const doctor = await runCli(['doctor'], root, home)

    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('Status: FAIL')
    expect(existsSync(path.join(home, '.aiworker', '.env'))).toBe(false)
    expect(existsSync(path.join(home, '.aiworker', 'worker.db'))).toBe(false)
  })
})
