import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { $ } from 'bun'
import { afterEach, describe, expect, test } from 'bun:test'
import { AISSH_EXEC_CWD_PREFIX, executeProvisionPlan, resolveAisshInvocation } from './aiworker'

const cliPath = path.resolve(import.meta.dirname, 'aiworker.ts')
const savedAisshBin = process.env.AISSH_BIN
const savedCwd = process.cwd()

afterEach(() => {
  if (savedAisshBin === undefined)
    delete process.env.AISSH_BIN
  else
    process.env.AISSH_BIN = savedAisshBin
  process.chdir(savedCwd)
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

  test('resolveAisshInvocation anchors bundled launcher to the installed CLI package, not cwd', async () => {
    delete process.env.AISSH_BIN
    const hostileRoot = await mkdtemp(path.join(tmpdir(), 'aiworker-hostile-cwd-'))
    await mkdir(path.join(hostileRoot, 'node_modules/aissh-cli/bin'), { recursive: true })
    await writeFile(path.join(hostileRoot, 'node_modules/aissh-cli/bin/aissh.js'), 'throw new Error("hostile")\n')
    process.chdir(hostileRoot)

    const invocation = resolveAisshInvocation()

    expect(invocation.source).toBe('bundled')
    expect(invocation.prefix[0]).toContain('apps/aiworker-cli/node_modules/aissh-cli/bin/aissh.js')
    expect(invocation.prefix[0]).not.toContain(hostileRoot)
  })

  test('executeProvisionPlan uses mock executor, fresh neutral cwd, cleanup, and redacts output', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan-provision ${planArgs(descriptorPath)}`.json()
    const calls: { args: string[], file: string, options: { cwd: string, maxBuffer: number } }[] = []
    const cwdExistsDuringExecution: boolean[] = []
    const result = await executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile(file, args, options) {
          calls.push({ args, file, options })
          cwdExistsDuringExecution.push(existsSync(options.cwd))
          return { stderr: 'warn sk-testsecret123456', stdout: 'ok sk-testsecret123456' }
        },
      },
    })

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.args).toEqual(plan.aissh.args)
    expect(call.file).toBe('/mock/aissh')
    expect(call.options.cwd).toStartWith(AISSH_EXEC_CWD_PREFIX)
    expect(call.options.cwd).not.toBe(tmpdir())
    expect(call.options.maxBuffer).toBe(1024 * 1024 * 8)
    expect(cwdExistsDuringExecution).toEqual([true])
    expect(existsSync(call.options.cwd)).toBe(false)
    expect(result.stdout).toBe('ok [REDACTED]')
    expect(result.stderr).toBe('warn [REDACTED]')
    expect(result.aissh.cwd).toBe(call.options.cwd)
  })

  test('executeProvisionPlan redacts failed aissh stdout, stderr, and messages', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan-provision ${planArgs(descriptorPath)}`.json()

    await expect(executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile() {
          throw Object.assign(new Error('boom sk-testsecret123456'), {
            stderr: 'stderr sk-testsecret123456',
            stdout: 'stdout sk-testsecret123456',
          })
        },
      },
    })).rejects.toThrow('aissh execution failed')

    try {
      await executeProvisionPlan(plan, {
        aisshBin: '/mock/aissh',
        executor: {
          async execFile() {
            throw Object.assign(new Error('boom sk-testsecret123456'), {
              stderr: 'stderr sk-testsecret123456',
              stdout: 'stdout sk-testsecret123456',
            })
          },
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('[REDACTED]')
      expect(message).not.toContain('sk-testsecret123456')
    }
  })

  test('CLI provision failure prints sanitized error output', async () => {
    const descriptorPath = await createDescriptor()
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-failing-aissh-'))
    const fakeAissh = path.join(root, 'aissh')
    await writeFile(fakeAissh, '#!/bin/sh\necho "stderr sk-testsecret123456" >&2\necho "stdout sk-testsecret123456"\nexit 42\n')
    await chmod(fakeAissh, 0o755)

    const result = await $`bun ${cliPath} provision ${planArgs(descriptorPath)} --aissh-bin ${fakeAissh}`.nothrow()
    const stderr = result.stderr.toString()

    expect(result.exitCode).toBe(1)
    expect(stderr).toContain('[REDACTED]')
    expect(stderr).not.toContain('sk-testsecret123456')
  })
})
