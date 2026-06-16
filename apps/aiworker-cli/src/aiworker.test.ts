import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { $ } from 'bun'
import { afterEach, describe, expect, test } from 'bun:test'
import { AISSH_EXEC_CWD_PREFIX, confirmApplyApproval, executeProvisionPlan, resolveAisshInvocation } from './aiworker'

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

async function createDescriptor(content = '# HR Manager\n', id = 'hr-manager') {
  const root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
  const descriptorPath = path.join(root, 'dist/soul.descriptor.json')
  await mkdir(path.join(root, 'dist/workspace-template'), { recursive: true })
  await writeFile(path.join(root, 'dist/workspace-template/AGENTS.md'), content)
  await writeFile(descriptorPath, JSON.stringify({
    protocol: 'soul/v1',
    identity: { id, name: 'HR Manager', version: '1.0.0' },
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
    '--provider',
    'claude-work',
    '--soul',
    descriptorPath,
  ]
}

describe('aiworker thin CLI', () => {
  test('root help explains the tool, examples, and public command surface', async () => {
    const output = await $`bun ${cliPath} --help`.text()

    expect(output).toContain('Thin enterprise distribution CLI for Paseo workspaces')
    expect(output).toContain('$ aiworker plan')
    expect(output).toContain('$ aiworker apply')
    expect(output).toContain('doctor')
    expect(output).toContain('plan')
    expect(output).toContain('apply')
    expect(output).not.toContain('describe')
    expect(output).not.toContain('plan-provision')
    expect(output).not.toContain('--paseo-home')
    expect(output).not.toContain('--workspace <path>')
  })

  test('bare aiworker prints concise help instead of silently exiting', async () => {
    const output = await $`bun ${cliPath}`.text()

    expect(output).toContain('Thin enterprise distribution CLI for Paseo workspaces')
    expect(output).toContain('Commands:')
  })

  test('removed product-boundary describe command fails loudly', async () => {
    const result = await $`bun ${cliPath} describe`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('unknown command `describe`')
    expect(result.stderr.toString()).toContain('aiworker --help')
  })

  test('reads CLI version from package metadata', async () => {
    const output = await $`bun ${cliPath} --version`.text()
    expect(output.trim()).toContain('1.0.0-rc.12')
  })

  test('plan defaults to a concise human preview without dumping the full script', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan ${planArgs(descriptorPath)}`.text()
    expect(output).toContain('AIWorker provisioning plan')
    expect(output).toContain('Assigned user: alice@example.com')
    expect(output).toContain('Workspace: $HOME/aiworker-workspaces/hr-manager')
    expect(output).toContain('Next step: aiworker apply')
    expect(output).not.toContain('base64 -d')
    expect(output.trim()).not.toStartWith('{')
  })

  test('missing required options explain how to fix the command', async () => {
    const result = await $`bun ${cliPath} plan --user alice@example.com`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('Missing required option: --soul')
    expect(result.stderr.toString()).toContain('aiworker plan --help')
  })

  test('missing Soul descriptor has an actionable error', async () => {
    const result = await $`bun ${cliPath} plan ${planArgs('/tmp/aiworker-missing-soul.descriptor.json')} --json`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('Soul descriptor not found')
    expect(result.stderr.toString()).toContain('bun run build:official-souls')
  })

  test('plan --json emits the full structured provisioning command', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
    expect(output.assignment.assignedEmail).toBe('alice@example.com')
    expect(output.receipt.soulReleaseRef).toBe('hr-manager@1.0.0')
    expect(output.receipt.workspaceRef).toBe('$HOME/aiworker-workspaces/hr-manager')
    expect(output.workspacePolicy.workspaceName).toBe('hr-manager')
    expect(output.workspacePolicy.kind).toBe('home-derived')
    expect(output.endpointBinding.bindingKind).toBe('home-derived-local-daemon')
    expect(output.providerReadiness.kind).toBe('paseo-provider-json-v1')
    expect(output.providerReadiness.providerListPredicate).toContain('status == "available"')
    expect(output.command).toContain('aissh exec server-1')
    expect(output.command).toContain('base64 -d')
    expect(output.command).toContain('unset PASEO_HOST')
    expect(output.command).toContain('PASEO_HOME="$AIWORKER_REMOTE_HOME/.paseo"')
    expect(output.command).toContain('paseo provider ls --json')
    expect(output.command).toContain('paseo provider models')
    expect(output.command).not.toContain('/home/alice/workspaces')
    expect(output.command).not.toContain('PASEO_HOME=/home/alice/.paseo')
    expect(output.aissh.cwdPolicy).toBe('neutral-tempdir')
    expect(output.aissh.credentials.source).toBe('env')
  })

  test('plans ACP provider profiles with explicit Paseo provider ids', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan --user Alice@Example.com --target aissh:server-1 --environment env-alice --provider acp-team --provider-kind acp --paseo-provider-id paseo-acp-team --soul ${descriptorPath} --json`.json()

    expect(output.command).toContain('AIWORKER_PASEO_PROVIDER_ID=paseo-acp-team')
    expect(output.command).toContain('paseo provider ls --json')
    expect(output.command).not.toContain('custom')
  })

  test('malicious Soul ids fail before script generation without echoing attacker text', async () => {
    const descriptorPath = await createDescriptor('hostile context\n', '../evil; echo SHOULD_NOT_RUN')

    const result = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.nothrow()
    const stderr = result.stderr.toString()

    expect(result.exitCode).toBe(1)
    expect(stderr).toContain('Invalid Soul descriptor')
    expect(stderr).not.toContain('SHOULD_NOT_RUN')
    expect(stderr).not.toContain('../evil')
    expect(stderr).not.toContain('base64 -d')
  })

  test('apply refuses execution unless explicitly approved', async () => {
    const descriptorPath = await createDescriptor()
    const result = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --aissh-bin /mock/aissh`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('--yes')
  })

  test('apply --json requires explicit approval to keep stdout machine-readable', async () => {
    const descriptorPath = await createDescriptor()
    const result = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --json --aissh-bin /mock/aissh`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stdout.toString()).toBe('')
    expect(result.stderr.toString()).toContain('refusing `aiworker apply --json`')
    expect(result.stderr.toString()).toContain('--json --yes')
  })

  test('apply can ask for interactive confirmation before executing', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
    const writes: string[] = []
    const prompts: string[] = []

    await confirmApplyApproval(plan, {}, {
      isInteractive: () => true,
      async prompt(question) {
        prompts.push(question)
        return 'yes'
      },
      write(value) {
        writes.push(value)
      },
    })

    expect(writes.join('')).toContain('AIWorker provisioning plan')
    expect(writes.join('')).not.toContain('base64 -d')
    expect(prompts.join('')).toContain('Type "yes"')
  })

  test('apply interactive cancellation makes no target changes', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()

    await expect(confirmApplyApproval(plan, {}, {
      isInteractive: () => true,
      async prompt() {
        return 'no'
      },
      write() {},
    })).rejects.toThrow('No target changes were made')
  })

  test('doctor reports local diagnostics in human output without exposing secrets', async () => {
    const descriptorPath = await createDescriptor()
    const oldToken = process.env.AISSH_TOKEN
    process.env.AISSH_TOKEN = 'sk-testsecret123456'
    try {
      const output = await $`bun ${cliPath} doctor --soul ${descriptorPath}`.text()

      expect(output).toContain('AIWorker doctor')
      expect(output).toContain('PASS')
      expect(output).toContain('Soul descriptor')
      expect(output).not.toContain('sk-testsecret123456')
    }
    finally {
      if (oldToken === undefined)
        delete process.env.AISSH_TOKEN
      else
        process.env.AISSH_TOKEN = oldToken
    }
  })

  test('doctor --json emits structured diagnostics', async () => {
    const descriptorPath = await createDescriptor()
    const output = await $`bun ${cliPath} doctor --soul ${descriptorPath} --json`.json()

    expect(['pass', 'warn', 'fail']).toContain(output.status)
    expect(output.checks.map((check: { name: string }) => check.name)).toContain('cli-package')
    expect(output.checks.map((check: { name: string }) => check.name)).toContain('soul-descriptor')
  })

  test('doctor redacts secret-like configured executable values in human and JSON output', async () => {
    const jsonResult = Bun.spawnSync([process.execPath, cliPath, 'doctor', '--aissh-bin', 'sk-testsecret123456', '--json'], {
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const humanResult = Bun.spawnSync([process.execPath, cliPath, 'doctor', '--aissh-bin', 'sk-testsecret123456'], {
      stderr: 'pipe',
      stdout: 'pipe',
    })

    expect(jsonResult.exitCode).toBe(1)
    expect(humanResult.exitCode).toBe(1)
    expect(jsonResult.stdout.toString()).toContain('[REDACTED]')
    expect(humanResult.stdout.toString()).toContain('[REDACTED]')
    expect(jsonResult.stdout.toString()).not.toContain('sk-testsecret123456')
    expect(humanResult.stdout.toString()).not.toContain('sk-testsecret123456')
  })

  test('doctor validates explicit bare aissh commands against PATH', async () => {
    const missingCommand = `aiworker-missing-aissh-${Date.now()}`
    const result = Bun.spawnSync([process.execPath, cliPath, 'doctor', '--aissh-bin', missingCommand, '--json'], {
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const output = JSON.parse(result.stdout.toString())
    const aisshCheck = output.checks.find((check: { name: string }) => check.name === 'aissh')

    expect(result.exitCode).toBe(1)
    expect(output.status).toBe('fail')
    expect(aisshCheck.status).toBe('fail')
    expect(aisshCheck.message).toContain('not found on PATH')
    expect(aisshCheck.message).toContain(missingCommand)
  })

  test('doctor rejects literal provider secrets in projected Soul files without echoing them', async () => {
    const descriptorPath = await createDescriptor('key sk-testsecret123456\n')
    const result = await $`bun ${cliPath} doctor --soul ${descriptorPath} --json`.nothrow()
    const output = JSON.parse(result.stdout.toString())
    const soulCheck = output.checks.find((check: { name: string }) => check.name === 'soul-descriptor')

    expect(result.exitCode).toBe(1)
    expect(output.status).toBe('fail')
    expect(soulCheck.status).toBe('fail')
    expect(soulCheck.message).toContain('literal provider secrets')
    expect(soulCheck.message).not.toContain('sk-testsecret123456')
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
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
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

  test('successful apply output omits generated script echoed by aissh wrappers', async () => {
    const descriptorPath = await createDescriptor('internal business context\n')
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-echoing-aissh-'))
    const fakeAissh = path.join(root, 'aissh')
    await writeFile(fakeAissh, '#!/bin/sh\necho "stdout sk-testsecret123456"\necho "https://relay.paseo.example/#offer=real-token"\necho "{\\"provider\\":\\"claude\\",\\"status\\":\\"available\\"}"\necho "[\\"gpt-5\\",\\"claude-opus\\"]"\necho "████████"\necho "argv $*"\necho "stderr sk-testsecret123456" >&2\necho "{\\"model\\":\\"claude-opus\\",\\"thinkingOptionIds\\":[\\"high\\"]}" >&2\necho "argv $*" >&2\n')
    await chmod(fakeAissh, 0o755)

    const output = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --yes --aissh-bin ${fakeAissh}`.text()

    expect(output).toContain('AIWorker provisioning executed')
    expect(output).toContain('Handoff: AIWorker derives PASEO_HOME')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('[omitted: output echoed the generated provisioning command]')
    expect(output).not.toContain('sk-testsecret123456')
    expect(output).not.toContain('base64 -d')
    expect(output).not.toContain('printf \'%s\'')
    expect(output).not.toContain('set -euo pipefail')
    expect(output).not.toContain('export PASEO_HOME=')
    expect(output).not.toContain('npm install -g @getpaseo/cli')
    expect(output).not.toContain('paseo daemon status')
    expect(output).not.toContain('real-token')
    expect(output).not.toContain('"provider"')
    expect(output).not.toContain('"model"')
    expect(output).not.toContain('gpt-5')
    expect(output).not.toContain('claude-opus')
    expect(output).not.toContain('████')
    expect(output).toContain('[REDACTED_PAIRING_URL]')
    expect(output).toContain('[omitted: raw Paseo provider payload]')
    expect(output).not.toContain('aW50ZXJuYWwgYnVzaW5lc3MgY29udGV4dAo=')
  })

  test('executeProvisionPlan redacts standalone base64 payload echoes from projected files', async () => {
    const descriptorPath = await createDescriptor('standalone business context\n')
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
    const base64Payload = Array.from(String(plan.aissh.script).matchAll(/printf '%s' (?:(['"])([A-Za-z0-9+/=]{16,})\1|([A-Za-z0-9+/=]{16,})) \| base64 -d/g), match => match[2] ?? match[3] ?? '').find(Boolean)

    expect(base64Payload).toBeTruthy()

    const result = await executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile() {
          return { stderr: '', stdout: `${base64Payload}\n` }
        },
      },
    })

    expect(result.stdout).toContain('[omitted: output echoed the generated provisioning command]')
    expect(result.stdout).not.toContain(base64Payload!)
  })

  test('executeProvisionPlan redacts failed aissh stdout, stderr, and messages', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()

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

  test('CLI provision failure prints sanitized error output without dumping the generated script', async () => {
    const descriptorPath = await createDescriptor('internal business context\n')
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-failing-aissh-'))
    const fakeAissh = path.join(root, 'aissh')
    await writeFile(fakeAissh, '#!/bin/sh\necho "stderr sk-testsecret123456" >&2\necho "https://relay.paseo.example/?offer=stderr-token" >&2\necho "{\\"provider\\":\\"claude\\",\\"status\\":\\"available\\"}" >&2\necho "argv $*" >&2\necho "stdout sk-testsecret123456"\necho "████████"\nprintf "%s\\n" "[" "  {" "    \\"id\\": \\"gpt-5.5\\"" "  }" "]"\necho "argv $*"\nexit 42\n')
    await chmod(fakeAissh, 0o755)

    const result = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --yes --aissh-bin ${fakeAissh}`.nothrow()
    const stderr = result.stderr.toString()

    expect(result.exitCode).toBe(1)
    expect(stderr).toContain('[REDACTED]')
    expect(stderr).not.toContain('sk-testsecret123456')
    expect(stderr).not.toContain('base64 -d')
    expect(stderr).not.toContain('printf \'%s\'')
    expect(stderr).not.toContain('set -euo pipefail')
    expect(stderr).not.toContain('export PASEO_HOME=')
    expect(stderr).not.toContain('npm install -g @getpaseo/cli')
    expect(stderr).not.toContain('paseo daemon status')
    expect(stderr).not.toContain('paseo daemon pair')
    expect(stderr).not.toContain('stderr-token')
    expect(stderr).not.toContain('"provider"')
    expect(stderr).not.toContain('"id"')
    expect(stderr).not.toContain('gpt-5.5')
    expect(stderr).not.toContain('████')
    expect(stderr).toContain('[REDACTED_PAIRING_URL]')
    expect(stderr).toContain('[omitted: raw Paseo provider payload]')
    expect(stderr).not.toContain('aW50ZXJuYWwgYnVzaW5lc3MgY29udGV4dAo=')
    expect(stderr).toContain('[omitted: output echoed the generated provisioning command]')
    expect(stderr).toContain('aiworker plan ... --show-script')
    expect(stderr).toContain('aiworker doctor')
  })
})
