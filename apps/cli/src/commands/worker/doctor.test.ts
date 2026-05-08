import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    expect(doctor.output).toContain('[aiworker doctor] Project Brain capability validation')
    expect(doctor.output).toContain('Status: PASS')
    expect(doctor.output).toContain('Brain identity:')
    expect(doctor.output).toContain('PASS    SOUL.md')
    expect(doctor.output).toContain('Scope manifest:')
    expect(doctor.output).toContain('PASS    scope.json')
    expect(doctor.output).toContain('kind         : developer-repo')
    expect(doctor.output).toContain('primary soul : developer')
    expect(doctor.output).toContain('privacy      : private')
    expect(doctor.output).toContain('Brain runtime: run `aiworker brain status`')
    expect(doctor.output).toContain('Gateway enrollment:')
    expect(doctor.output).toContain('INFO    standalone mode (AIWORKER_GATEWAY_URL is not set)')
    expect(doctor.output).toContain('aiworker env gateway-url wss://your-gateway.example/')
    expect(doctor.output).toContain('aiworker env display-name my-laptop')
    expect(doctor.output).toContain('PASS    policy.json')
    expect(doctor.output).toContain('PASS    brain-capabilities.json')

    const envText = await readFile(path.join(project, '.aiworker', 'local', '.env'), 'utf8')
    expect(envText).toContain('# AIWORKER_GATEWAY_URL=wss://your-gateway.example/')
    expect(envText).toContain('# AIWORKER_DISPLAY_NAME=my-laptop')
    expect(envText).not.toContain('\nAIWORKER_GATEWAY_URL=')
    expect(envText).not.toContain('\nAIWORKER_DISPLAY_NAME=')
  })

  it('reports configured gateway enrollment and missing display name as INFO', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-gateway-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-gateway-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(
      path.join(project, '.aiworker', 'local', '.env'),
      [
        'AIWORKER_MASTER_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'INTERNAL_SHARED_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'AIWORKER_GATEWAY_URL=wss://operator:secret@gateway.example.com/ws',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['doctor'], project, home)

    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain('Gateway enrollment:')
    expect(doctor.output).toContain('PASS    AIWORKER_GATEWAY_URL is set')
    expect(doctor.output).toContain('INFO    AIWORKER_DISPLAY_NAME is not set')
    expect(doctor.output).toContain('Set it with: aiworker env display-name <name>')
    expect(doctor.output).not.toContain('operator:secret')
  })

  it('reports display name as set when gateway enrollment is fully configured', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-gateway-name-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-gateway-name-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(
      path.join(project, '.aiworker', 'local', '.env'),
      [
        'AIWORKER_MASTER_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'INTERNAL_SHARED_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'AIWORKER_GATEWAY_URL=wss://gateway.example.com/ws',
        'AIWORKER_DISPLAY_NAME=edge-laptop',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['doctor'], project, home)

    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain('PASS    AIWORKER_GATEWAY_URL is set')
    expect(doctor.output).toContain('PASS    AIWORKER_DISPLAY_NAME is set')
    expect(doctor.output).not.toContain('AIWORKER_DISPLAY_NAME is not set')
  })

  it('reports WARN when scope.json is missing in an otherwise valid project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-noscope-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-noscope-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await rm(path.join(project, '.aiworker', 'scope.json'))

    const doctor = await runCli(['doctor'], project, home)
    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain('WARN    scope.json (no business-scope manifest declared')
  })

  it('fails when scope.json references an unknown Soul', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-soul-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-soul-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(path.join(project, '.aiworker', 'scope.json'), `${JSON.stringify({
      kind: 'developer-repo',
      primarySoul: 'not-a-real-soul',
      schemaVersion: 1,
    }, null, 2)}\n`, 'utf8')

    const doctor = await runCli(['doctor'], project, home)
    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('FAIL    scope.json — unknown-soul')
  })

  it('fails when scope.json kind does not belong to its Soul', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-kind-mismatch-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-kind-mismatch-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(path.join(project, '.aiworker', 'scope.json'), `${JSON.stringify({
      kind: 'finance-period',
      primarySoul: 'developer',
      schemaVersion: 1,
    }, null, 2)}\n`, 'utf8')

    const doctor = await runCli(['doctor'], project, home)
    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('FAIL    scope.json — kind-mismatch')
  })

  it('fails when scope.json is malformed JSON', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-malformed-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-malformed-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(path.join(project, '.aiworker', 'scope.json'), '{ not json', 'utf8')

    const doctor = await runCli(['doctor'], project, home)
    expect(doctor.exitCode).toBe(1)
    expect(doctor.output).toContain('FAIL    scope.json — malformed')
  })

  it('fails when MCP descriptors contain plaintext secrets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-bad-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)
    await writeFile(path.join(project, '.aiworker', 'brain-capabilities.json'), `${JSON.stringify({
      defaultToolsets: ['filesystem-read'],
      mcp: {
        servers: {
          docs: {
            token: 'plain-secret',
            transport: 'streamable-http',
          },
        },
      },
      packs: [
        { id: 'code', status: 'draft', validation: { issues: [], status: 'pending' } },
      ],
      schemaVersion: 1,
      soul: 'developer',
      status: 'draft',
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

  it('emits a leading OK summary line for a freshly initialized project with seeded native executor skills', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-summary-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-summary-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)

    const doctor = await runCli(['doctor'], project, home)

    expect(doctor.exitCode).toBe(0)
    // Default Soul packs now seed real native executor skills, so a freshly initialized
    // project is no longer considered sparse by doctor.
    expect(doctor.output).toMatch(/\[aiworker doctor\] OK — \d+ checks; \d+ PASS · \d+ info · \d+ WARN · \d+ FAIL/)
    expect(doctor.output).not.toContain('fresh-init defaults')
    // Old empty-skill codes must not surface for seeded defaults.
    expect(doctor.output).not.toContain('skills.empty')
    expect(doctor.output).not.toContain('brain-skills.empty')
    expect(doctor.output).not.toContain('native-skills.empty')
    // Original Status: PASS line still printed for compatibility
    expect(doctor.output).toContain('Status: PASS')
  })

  it('does not surface legacy fallback skill empty codes for native defaults', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-skills-'))
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-doctor-skills-home-'))
    const project = path.join(root, 'repo')
    await mkdir(project, { recursive: true })

    const init = await runCli(['init', '--soul', 'developer'], project, home)
    expect(init.exitCode).toBe(0)

    const doctor = await runCli(['doctor'], project, home)
    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).not.toContain('[info] skills.empty')
    expect(doctor.output).not.toContain('brain-skills.empty')
    expect(doctor.output).not.toContain('native-skills.empty')
  })
})
