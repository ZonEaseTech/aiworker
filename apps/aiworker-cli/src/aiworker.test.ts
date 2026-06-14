import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { $ } from 'bun'
import { afterEach, describe, expect, test } from 'bun:test'
import { AISSH_EXEC_CWD, executeProvisionPlan, resolveAisshInvocation } from './aiworker'

const cliPath = path.resolve(import.meta.dirname, 'aiworker.ts')
const savedAisshBin = process.env.AISSH_BIN

afterEach(() => {
  if (savedAisshBin === undefined)
    delete process.env.AISSH_BIN
  else
    process.env.AISSH_BIN = savedAisshBin
})

async function createDescriptor() {
  const root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
  const descriptorPath = path.join(root, 'dist/soul.descriptor.json')
  await mkdir(path.join(root, 'dist/workspace-template'), { recursive: true })
  await writeFile(path.join(root, 'dist/workspace-template/AGENTS.md'), '# HR Manager\n')
  await writeFile(descriptorPath, JSON.stringify({
    protocol: 'soul/v1',
    identity: { id: 'hr-manager', name: 'HR Manager', version: '1.0.0' },
    workspaceTemplate: { root: 'dist/workspace-template', entryFiles: ['AGENTS.md'], mcpFiles: [], skillDirs: [] },
  }))
  return descriptorPath
}

function planArgs(descriptorPath: string) {
  return [
    '--user',
    'Alice@Example.com',
    '--target',
    'aissh:server-1',
    '--environment',
    'env-alice',
    '--paseo-home',
    '/home/alice/.paseo',
    '--paseo-endpoint',
    'unix:/run/paseo/alice.sock',
    '--provider',
    'claude-work',
    '--soul',
    descriptorPath,
    '--workspace',
    '/home/alice/workspaces/hr',
  ]
}

describe('aiworker thin CLI', () => {
  test('describes the new product boundary', async () => {
    const output = await $`bun ${cliPath} describe`.json()
    expect(output.aiworker).toContain('Soul filesystem projector')
    expect(output.notAiworker).toContain('Worker runtime')
  })

  test('reads CLI version from package metadata', async () => {
    const output = await $`bun ${cliPath} --version`.text()
    expect(output.trim()).toContain('1.0.0-rc.12')
  })

  test('plans a Paseo workspace provisioning command from a built Soul descriptor', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan-provision ${planArgs(descriptorPath)}`.json()
    expect(output.assignment.assignedEmail).toBe('alice@example.com')
    expect(output.receipt.soulReleaseRef).toBe('hr-manager@1.0.0')
    expect(output.command).toContain('aissh exec server-1')
    expect(output.command).toContain('base64 -d')
    expect(output.aissh.cwdPolicy).toBe('neutral-tempdir')
    expect(output.aissh.credentials.source).toBe('env')
  })

  test('plans ACP provider profiles with explicit Paseo provider ids', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan-provision --user Alice@Example.com --target aissh:server-1 --environment env-alice --paseo-home /home/alice/.paseo --paseo-endpoint unix:/run/paseo/alice.sock --provider acp-team --provider-kind acp --paseo-provider-id paseo-acp-team --soul ${descriptorPath} --workspace /home/alice/workspaces/hr`.json()

    expect(output.command).toContain('Paseo provider profile paseo-acp-team')
    expect(output.command).not.toContain('custom')
  })

  test('provision supports dry-run without invoking aissh', async () => {
    const descriptorPath = await createDescriptor()
    const output = await $`bun ${cliPath} provision ${planArgs(descriptorPath)} --dry-run`.json()

    expect(output.dryRun).toBe(true)
    expect(output.plan.aissh.args[0]).toBe('exec')
    expect(output.plan.aissh.args[1]).toBe('server-1')
  })

  test('resolveAisshInvocation follows explicit, env, bundled, then PATH priority', () => {
    process.env.AISSH_BIN = '/env/aissh'
    expect(resolveAisshInvocation('/explicit/aissh', () => '/bundled/aissh.js')).toEqual({ file: '/explicit/aissh', prefix: [], source: 'explicit' })
    expect(resolveAisshInvocation(undefined, () => '/bundled/aissh.js')).toEqual({ file: '/env/aissh', prefix: [], source: 'explicit' })
    delete process.env.AISSH_BIN
    expect(resolveAisshInvocation(undefined, () => '/bundled/aissh.js')).toEqual({ file: process.execPath, prefix: ['/bundled/aissh.js'], source: 'bundled' })
    expect(resolveAisshInvocation(undefined, () => null)).toEqual({ file: 'aissh', prefix: [], source: 'path' })
  })

  test('executeProvisionPlan uses mock executor, neutral cwd, and redacts output', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan-provision ${planArgs(descriptorPath)}`.json()
    const calls: unknown[] = []
    const result = await executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile(file, args, options) {
          calls.push({ args, file, options })
          return { stderr: 'warn sk-testsecret123456', stdout: 'ok sk-testsecret123456' }
        },
      },
    })

    expect(calls).toEqual([{ args: plan.aissh.args, file: '/mock/aissh', options: { cwd: AISSH_EXEC_CWD, maxBuffer: 1024 * 1024 * 8 } }])
    expect(result.stdout).toBe('ok [REDACTED]')
    expect(result.stderr).toBe('warn [REDACTED]')
    expect(result.aissh.cwd).toBe(tmpdir())
  })
})
