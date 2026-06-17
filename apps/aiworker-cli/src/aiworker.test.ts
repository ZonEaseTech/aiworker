import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { $ } from 'bun'
import { afterEach, describe, expect, test } from 'bun:test'
import { AISSH_EXEC_CWD_PREFIX, confirmApplyApproval, executePaseoPair, executeProvisionPlan, resolveAisshCredentials, resolveAisshInvocation } from './aiworker'

const cliPath = path.resolve(import.meta.dirname, 'aiworker.ts')
const packageJsonPath = path.resolve(import.meta.dirname, '../package.json')
const savedAisshBin = process.env.AISSH_BIN
const savedAisshToken = process.env.AISSH_TOKEN
const savedCwd = process.cwd()

afterEach(() => {
  if (savedAisshBin === undefined)
    delete process.env.AISSH_BIN
  else
    process.env.AISSH_BIN = savedAisshBin
  if (savedAisshToken === undefined)
    delete process.env.AISSH_TOKEN
  else
    process.env.AISSH_TOKEN = savedAisshToken
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

async function readCliPackageVersion() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version: string }
  return packageJson.version
}

function planArgs(descriptorPath: string) {
  return [
    '--user',
    'Alice@Example.com',
    '--target',
    'aissh:server-1',
    '--dedicated-target-user',
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
    expect(output).toContain('$ aiworker pair')
    expect(output).toContain('doctor')
    expect(output).toContain('plan')
    expect(output).toContain('apply')
    expect(output).toContain('pair')
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
    expect(output.trim()).toContain(await readCliPackageVersion())
  })

  test('plan defaults to a concise human preview without dumping the full script', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan ${planArgs(descriptorPath)}`.text()
    expect(output).toContain('AIWorker provisioning plan')
    expect(output).toContain('Assigned user: alice@example.com')
    expect(output).toContain('Project workdir: $HOME/.aiworker/alice-example.com/projects/hr-manager')
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

  test('plan requires an explicit target ownership assertion', async () => {
    const descriptorPath = await createDescriptor()
    const result = await $`bun ${cliPath} plan --user alice@example.com --target aissh:server-1 --environment env-alice --provider claude-work --soul ${descriptorPath}`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('Missing required ownership assertion')
    expect(result.stderr.toString()).toContain('--target-owner')
    expect(result.stderr.toString()).toContain('--dedicated-target-user')
  })

  test('plan accepts shared target owner by deriving an owner-scoped Paseo home', async () => {
    const descriptorPath = await createDescriptor()
    const output = await $`bun ${cliPath} plan --user alice@example.com --target-owner bob@example.com --target aissh:server-1 --environment env-alice --provider claude-work --soul ${descriptorPath} --json`.json()

    expect(output.environment.ownerEmail).toBe('bob@example.com')
    expect(output.ownership.kind).toBe('owner-scoped-shared-home')
    expect(output.workspacePolicy.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(output.workspacePolicy.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
  })

  test('plan requires explicit listen and host refs for TCP Paseo fallback', async () => {
    const descriptorPath = await createDescriptor()

    const missingHost = await $`bun ${cliPath} plan --user alice@example.com --target-owner bob@example.com --target aissh:server-1 --environment env-alice --provider claude-work --soul ${descriptorPath} --paseo-listen 127.0.0.1:6767 --json`.nothrow()
    expect(missingHost.exitCode).toBe(1)
    expect(missingHost.stderr.toString()).toContain('requires both --paseo-listen and --paseo-host')

    const legacyEndpoint = await $`bun ${cliPath} plan --user alice@example.com --target-owner bob@example.com --target aissh:server-1 --environment env-alice --provider claude-work --soul ${descriptorPath} --paseo-endpoint 127.0.0.1:6767 --json`.nothrow()
    expect(legacyEndpoint.exitCode).toBe(1)
    expect(legacyEndpoint.stderr.toString()).toContain('--paseo-endpoint is only for relay offers, Unix sockets, or legacy metadata')

    const output = await $`bun ${cliPath} plan --user alice@example.com --target-owner bob@example.com --target aissh:server-1 --environment env-alice --provider claude-work --soul ${descriptorPath} --paseo-listen 127.0.0.1:6767 --paseo-host 127.0.0.1:6767 --json`.json()
    expect(output.environment.endpointKind).toBe('tcp')
    expect(output.environment.daemonListenRef).toBe('127.0.0.1:6767')
    expect(output.environment.daemonHostRef).toBe('127.0.0.1:6767')
    expect(output.endpointBinding.bindingKind).toBe('external-endpoint')
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
    expect(output.environment.ownerEmail).toBe('alice@example.com')
    expect(output.environment.dedication).toEqual({
      kind: 'assigned-user-dedicated',
      assignedEmail: 'alice@example.com',
      assertedBy: 'aiworker-cli',
      reason: '--dedicated-target-user',
    })
    expect(output.ownership.kind).toBe('dedicated-target-asserted')
    expect(output.ownership.dedicatedTarget).toBe(true)
    expect(output.receipt.soulReleaseRef).toBe('hr-manager@1.0.0')
    expect(output.receipt.projectRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
    expect(output.receipt.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
    expect(output.workspacePolicy.projectName).toBe('hr-manager')
    expect(output.workspacePolicy.projectRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
    expect(output.workspacePolicy.projectRoot).toBe('$HOME/.aiworker/alice-example.com/projects')
    expect(output.workspacePolicy.ownerRoot).toBe('$HOME/.aiworker/alice-example.com')
    expect(output.workspacePolicy.paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(output.workspacePolicy.daemonListenRef).toBe('127.0.0.1:42057')
    expect(output.workspacePolicy.userSlug).toBe('alice-example.com')
    expect(output.workspacePolicy.workspaceName).toBe('hr-manager')
    expect(output.workspacePolicy.kind).toBe('project-workdir')
    expect(output.endpointBinding.bindingKind).toBe('owner-scoped-local-daemon')
    expect(output.endpointBinding.ref).toBe('127.0.0.1:42057')
    expect(output.providerReadiness.kind).toBe('paseo-provider-json-v1')
    expect(output.providerReadiness.effect).toBe('non-blocking-warning')
    expect(output.providerReadiness.modelListPolicy).toBe('not-collected-by-aiworker')
    expect(output.providerReadiness.providerListPredicate).toContain('warn if provider')
    expect(output.command).toContain('aissh exec server-1')
    expect(output.command).toContain('base64 -d')
    expect(output.command).toContain('unset PASEO_HOST')
    expect(output.command).toContain('AIWORKER_PASEO_HOME="$AIWORKER_OWNER_ROOT/.paseo"')
    expect(output.command).toContain('PASEO_LISTEN="$AIWORKER_PASEO_LISTEN"')
    expect(output.command).toContain('paseo provider ls --host "$AIWORKER_PASEO_HOST" --json')
    expect(output.command).not.toContain('paseo provider models')
    expect(output.command).toContain('AIWORKER_PROVIDER_WARNING')
    expect(output.command).not.toContain('/home/alice/workspaces')
    expect(output.command).not.toContain('PASEO_HOME=/home/alice/.paseo')
    expect(output.aissh.cwdPolicy).toBe('neutral-tempdir')
    expect(output.aissh.credentials.source).toBe('env')
  })

  test('plan can preserve an existing control-plane assignment id', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --assignment-id asn-existing-web --json`.json()

    expect(output.assignment.assignmentId).toBe('asn-existing-web')
  })

  test('plans ACP provider profiles with explicit Paseo provider ids', async () => {
    const descriptorPath = await createDescriptor()

    const output = await $`bun ${cliPath} plan --user Alice@Example.com --dedicated-target-user --target aissh:server-1 --environment env-alice --provider acp-team --provider-kind acp --paseo-provider-id paseo-acp-team --soul ${descriptorPath} --json`.json()

    expect(output.command).toContain('AIWORKER_PASEO_PROVIDER_ID=paseo-acp-team')
    expect(output.command).toContain('paseo provider ls --host "$AIWORKER_PASEO_HOST" --json')
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

  test('doctor accepts a local .aissh.yaml token without exposing it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-aissh-yaml-'))
    const token = 'test-aissh-token-from-yaml-123456789'
    await writeFile(path.join(root, '.aissh.yaml'), `token: ${token}\n`)
    const env = { ...process.env }
    delete env.AISSH_TOKEN

    const result = Bun.spawnSync([process.execPath, cliPath, 'doctor', '--json'], {
      cwd: root,
      env,
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const output = JSON.parse(result.stdout.toString())
    const tokenCheck = output.checks.find((check: { name: string }) => check.name === 'aissh-token')

    expect(result.exitCode).toBe(0)
    expect(tokenCheck.status).toBe('pass')
    expect(tokenCheck.message).toContain('.aissh.yaml token is available')
    expect(result.stdout.toString()).not.toContain(token)
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

  test('resolveAisshCredentials loads .aissh.yaml token for neutral-cwd aissh execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-aissh-credentials-'))
    const token = 'test-aissh-yaml-token-987654321'
    await writeFile(path.join(root, '.aissh.yaml'), `token: '${token}'\n`)

    expect(resolveAisshCredentials(root, {}).source).toBe('aissh-yaml')
    expect(resolveAisshCredentials(root, {}).env.AISSH_TOKEN).toBe(token)
    expect(resolveAisshCredentials(root, { AISSH_TOKEN: 'env-token' }).env.AISSH_TOKEN).toBe('env-token')
  })

  test('executeProvisionPlan uses mock executor, fresh neutral cwd, cleanup, and redacts output', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
    const calls: { args: string[], file: string, options: { cwd: string, env: NodeJS.ProcessEnv, maxBuffer: number } }[] = []
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

  test('executeProvisionPlan passes .aissh.yaml token through env while using a neutral cwd', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-aissh-exec-token-'))
    const token = 'test-aissh-token-from-local-yaml-987654321'
    await writeFile(path.join(root, '.aissh.yaml'), `token: \"${token}\"\n`)
    process.chdir(root)
    delete process.env.AISSH_TOKEN
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()
    const calls: { args: string[], file: string, options: { cwd: string, env: NodeJS.ProcessEnv, maxBuffer: number } }[] = []

    await executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile(file, args, options) {
          calls.push({ args, file, options })
          return { stderr: '', stdout: 'ok' }
        },
      },
    })

    const call = calls[0]!
    expect(call.options.cwd).toStartWith(AISSH_EXEC_CWD_PREFIX)
    expect(call.options.cwd).not.toBe(root)
    expect(call.options.env.AISSH_TOKEN).toBe(token)
    expect(call.args.join(' ')).not.toContain(token)
  })

  test('successful apply output omits generated script echoed by aissh wrappers', async () => {
    const descriptorPath = await createDescriptor('internal business context\n')
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-echoing-aissh-'))
    const fakeAissh = path.join(root, 'aissh')
    await writeFile(fakeAissh, '#!/bin/sh\necho "stdout sk-testsecret123456"\necho "https://relay.paseo.example/#offer=real-token"\necho "{\\"provider\\":\\"claude\\",\\"status\\":\\"available\\"}"\necho "[\\"gpt-5\\",\\"claude-opus\\"]"\necho "████████"\necho "AIWORKER_HANDOFF_READY: run paseo daemon pair --home \\"$PASEO_HOME\\" from \\"$AIWORKER_WORKSPACE_REF\\" and open the printed link in the Paseo frontend."\necho "argv $*"\necho "stderr sk-testsecret123456" >&2\necho "{\\"model\\":\\"claude-opus\\",\\"thinkingOptionIds\\":[\\"high\\"]}" >&2\necho "argv $*" >&2\n')
    await chmod(fakeAissh, 0o755)

    const output = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --yes --aissh-bin ${fakeAissh}`.text()

    expect(output).toContain('AIWorker provisioning executed')
    expect(output).toContain('Handoff: AIWorker derives owner-scoped PASEO_HOME')
    expect(output).toContain('AIWORKER_HANDOFF_READY')
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

  test('apply can persist redacted control-plane receipt, audit, and projection records', async () => {
    const descriptorPath = await createDescriptor('internal business context\n')
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-plane-'))
    const fakeAissh = path.join(root, 'aissh')
    const controlPlaneDir = path.join(root, 'control-plane')
    await writeFile(fakeAissh, '#!/bin/sh\necho "AIWorker target identity discovered: user=root uid=0 home=/root pwd=/root"\necho "{\\"provider\\":\\"claude\\",\\"status\\":\\"available\\"}"\necho "https://relay.paseo.example/#offer=real-token"\necho "AIWORKER_PROVIDER_WARNING: Paseo provider claude is not available/enabled for this aissh user; workspace projection will continue."\necho "AIWORKER_HANDOFF_READY: run paseo daemon pair --home \\"$PASEO_HOME\\" from \\"$AIWORKER_WORKSPACE_REF\\" and open the printed link in the Paseo frontend."\n')
    await chmod(fakeAissh, 0o755)

    await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --yes --aissh-bin ${fakeAissh} --control-plane-dir ${controlPlaneDir} --json`.json()

    const snapshot = JSON.parse(await readFile(path.join(controlPlaneDir, 'snapshot.json'), 'utf8'))
    const receipts = (await readFile(path.join(controlPlaneDir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const audits = (await readFile(path.join(controlPlaneDir, 'audit-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const projections = (await readFile(path.join(controlPlaneDir, 'projection-manifests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const persisted = JSON.stringify({ audits, projections, receipts, snapshot })

    expect(snapshot.assignments[0].status).toBe('needs_attention')
    expect(snapshot.assignments[0].handoff.instructions).toContain('paseo daemon pair --home "$PASEO_HOME"')
    expect(receipts[0].status).toBe('applied')
    expect(receipts[0].paseoHome).toBe('$HOME/.aiworker/alice-example.com/.paseo')
    expect(receipts[0].topologyKind).toBe('owner-scoped-paseo-home-v1')
    expect(receipts[0].ownerRoot).toBe('$HOME/.aiworker/alice-example.com')
    expect(receipts[0].projectRoot).toBe('$HOME/.aiworker/alice-example.com/projects')
    expect(receipts[0].environmentOwnerEmail).toBe('alice@example.com')
    expect(receipts[0].ownershipKind).toBe('dedicated-target-asserted')
    expect(receipts[0].dedicatedTarget).toBe(true)
    expect(receipts[0].userSlug).toBe('alice-example.com')
    expect(snapshot.environments[0].ownerEmail).toBe('alice@example.com')
    expect(snapshot.environments[0].dedication).toEqual({
      kind: 'assigned-user-dedicated',
      assignedEmail: 'alice@example.com',
      assertedBy: 'aiworker-cli',
      reason: '--dedicated-target-user',
    })
    expect(receipts[0].handoffState).toBe('instruction-only')
    expect(receipts[0].providerReadinessEffect).toBe('non-blocking-warning')
    expect(receipts[0].providerWarning).toContain('AIWORKER_PROVIDER_WARNING')
    expect(audits[0].action).toBe('provision.applied.needs_provider_attention')
    expect(audits[0].details).toContain('providerWarning=AIWORKER_PROVIDER_WARNING')
    expect(projections[0].files.map((file: { relativePath: string }) => file.relativePath)).toEqual(['AGENTS.md'])
    expect(persisted).not.toContain('real-token')
    expect(persisted).not.toContain('relay.paseo.example')
    expect(persisted).not.toContain('"status":"available"')
    expect(persisted).not.toContain('sk-testsecret123456')
  })

  test('failed apply persists only redacted failure metadata in the control plane', async () => {
    const descriptorPath = await createDescriptor()
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-control-plane-failed-'))
    const fakeAissh = path.join(root, 'aissh')
    const controlPlaneDir = path.join(root, 'control-plane')
    await writeFile(fakeAissh, '#!/bin/sh\necho "stdout sk-testsecret123456"\necho "https://relay.paseo.example/#offer=real-token"\necho "{\\"provider\\":\\"claude\\",\\"status\\":\\"available\\"}"\necho "stderr sk-testsecret123456" >&2\nexit 42\n')
    await chmod(fakeAissh, 0o755)

    const result = await $`bun ${cliPath} apply ${planArgs(descriptorPath)} --yes --aissh-bin ${fakeAissh} --control-plane-dir ${controlPlaneDir} --json`.nothrow()

    const receipts = (await readFile(path.join(controlPlaneDir, 'receipts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const audits = (await readFile(path.join(controlPlaneDir, 'audit-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const persisted = JSON.stringify({ audits, receipts })

    expect(result.exitCode).toBe(1)
    expect(receipts[0].status).toBe('failed')
    expect(audits[0].action).toBe('provision.failed')
    expect(audits[0].details).toContain('failure=aissh execution failed')
    expect(existsSync(path.join(controlPlaneDir, 'projection-manifests.jsonl'))).toBe(false)
    expect(persisted).not.toContain('sk-testsecret123456')
    expect(persisted).not.toContain('real-token')
    expect(persisted).not.toContain('"status":"available"')
  })

  test('pair emits transient Paseo pairing material without exposing generated script echoes', async () => {
    const descriptorPath = await createDescriptor()
    const result = await executePaseoPair({
      assignedEmail: 'alice@example.com',
      aisshBin: '/mock/aissh',
      executor: {
        async execFile(_file, args) {
          return {
            stderr: '',
            stdout: [
              'AIWorker target identity discovered: user=root uid=0 home=/root pwd=/root',
              `argv ${args.join(' ')}`,
              'https://relay.paseo.example/#offer=real-token',
            ].join('\n'),
          }
        },
      },
      soulPath: descriptorPath,
      targetOwnerEmail: 'alice@example.com',
      dedicatedTarget: true,
      targetRef: 'aissh:server-1',
    })

    expect(result.status).toBe('paired')
    expect(result.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
    expect(result.stdout).toContain('https://relay.paseo.example/#offer=real-token')
    expect(result.stdout).toContain('AIWorker target identity discovered')
    expect(result.stdout).toContain('[omitted: output echoed the generated provisioning command]')
    expect(result.stdout).not.toContain('set -euo pipefail')
    expect(result.stdout).not.toContain('paseo daemon pair --home "$PASEO_HOME"')
  })

  test('pair command keeps pairing output transient and redacts pairing material on failure', async () => {
    const descriptorPath = await createDescriptor()
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-pair-failure-'))
    const fakeAissh = path.join(root, 'aissh')
    await writeFile(fakeAissh, '#!/bin/sh\necho "https://relay.paseo.example/#offer=real-token"\necho "argv $*"\nexit 42\n')
    await chmod(fakeAissh, 0o755)

    const result = await $`bun ${cliPath} pair --user alice@example.com --dedicated-target-user --target aissh:server-1 --soul ${descriptorPath} --aissh-bin ${fakeAissh} --json`.nothrow()

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('[REDACTED_PAIRING_URL]')
    expect(result.stderr.toString()).toContain('[omitted: output echoed the generated provisioning command]')
    expect(result.stderr.toString()).not.toContain('real-token')
    expect(result.stderr.toString()).not.toContain('set -euo pipefail')
    expect(result.stderr.toString()).not.toContain('$AIWORKER_REMOTE_USER')
    expect(result.stderr.toString()).not.toContain('AIWORKER_PAIR_PROJECT_MISSING')
    expect(result.stderr.toString()).not.toContain('safe HOME-relative segment')
    expect(existsSync(path.join(root, 'control-plane'))).toBe(false)
  })

  test('pair accepts shared target ownership and invokes aissh against the assigned user scope', async () => {
    const descriptorPath = await createDescriptor()
    const calls: string[][] = []

    const result = await executePaseoPair({
      assignedEmail: 'alice@example.com',
      aisshBin: '/mock/aissh',
      executor: {
        async execFile(_file, args) {
          calls.push(args)
          return { stderr: '', stdout: 'paired' }
        },
      },
      soulPath: descriptorPath,
      targetOwnerEmail: 'bob@example.com',
      targetRef: 'aissh:server-1',
    })

    expect(result.ownership.kind).toBe('owner-scoped-shared-home')
    expect(result.workspaceRef).toBe('$HOME/.aiworker/alice-example.com/projects/hr-manager')
    expect(calls[0]?.join(' ')).toContain('AIWORKER_OWNER_ROOT="$AIWORKER_ROOT/$AIWORKER_USER_SLUG"')
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

  test('executeProvisionPlan preserves safe aissh envelope diagnostics while omitting raw provider payloads', async () => {
    const descriptorPath = await createDescriptor()
    const plan = await $`bun ${cliPath} plan ${planArgs(descriptorPath)} --json`.json()

    await expect(executeProvisionPlan(plan, {
      aisshBin: '/mock/aissh',
      executor: {
        async execFile() {
          throw Object.assign(new Error('remote failed'), {
            stdout: JSON.stringify({
              error: '',
              exit_code: 1,
              output: [
                'AIWorker target identity discovered: user=root uid=0 home=/root pwd=/root',
                '{\"provider\":\"codex\",\"status\":\"available\",\"modes\":[\"auto\"]}',
                'AIWORKER_PROVIDER_WARNING: Paseo provider codex is not available/enabled for this aissh user; workspace projection will continue.',
              ].join('\n'),
            }),
          })
        },
      },
    })).rejects.toThrow('AIWORKER_PROVIDER_WARNING')

    try {
      await executeProvisionPlan(plan, {
        aisshBin: '/mock/aissh',
        executor: {
          async execFile() {
            throw Object.assign(new Error('remote failed'), {
              stdout: JSON.stringify({
                error: '',
                exit_code: 1,
                output: [
                  'AIWorker target identity discovered: user=root uid=0 home=/root pwd=/root',
                  '{\"provider\":\"codex\",\"status\":\"available\",\"modes\":[\"auto\"]}',
                  'AIWORKER_PROVIDER_WARNING: Paseo provider codex is not available/enabled for this aissh user; workspace projection will continue.',
                ].join('\n'),
              }),
            })
          },
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain('AIWORKER_PROVIDER_WARNING')
      expect(message).toContain('[omitted: raw Paseo provider payload]')
      expect(message).not.toContain('"provider":"codex"')
      expect(message).not.toContain('"modes"')
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
    expect(stderr).not.toContain('safe HOME-relative segment')
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
