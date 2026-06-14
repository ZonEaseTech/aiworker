import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { $ } from 'bun'
import { describe, expect, test } from 'bun:test'

const cliPath = path.resolve(import.meta.dirname, 'aiworker.ts')

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
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    const descriptorPath = path.join(root, 'dist/soul.descriptor.json')
    await mkdir(path.join(root, 'dist/workspace-template'), { recursive: true })
    await writeFile(path.join(root, 'dist/workspace-template/AGENTS.md'), '# HR Manager\n')
    await writeFile(descriptorPath, JSON.stringify({
      protocol: 'soul/v1',
      identity: { id: 'hr-manager', name: 'HR Manager', version: '1.0.0' },
      workspaceTemplate: { root: 'dist/workspace-template', entryFiles: ['AGENTS.md'], mcpFiles: [], skillDirs: [] },
    }))

    const output = await $`bun ${cliPath} plan-provision --user Alice@Example.com --target aissh:server-1 --environment env-alice --paseo-home /home/alice/.paseo --paseo-endpoint unix:/run/paseo/alice.sock --provider claude-work --soul ${descriptorPath} --workspace /home/alice/workspaces/hr`.json()
    expect(output.assignment.assignedEmail).toBe('alice@example.com')
    expect(output.receipt.soulReleaseRef).toBe('hr-manager@1.0.0')
    expect(output.command).toContain('aissh exec aissh:server-1')
    expect(output.command).toContain('base64 -d')
  })

  test('plans ACP provider profiles with explicit Paseo provider ids', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    const descriptorPath = path.join(root, 'dist/soul.descriptor.json')
    await mkdir(path.join(root, 'dist/workspace-template'), { recursive: true })
    await writeFile(path.join(root, 'dist/workspace-template/AGENTS.md'), '# HR Manager\n')
    await writeFile(descriptorPath, JSON.stringify({
      protocol: 'soul/v1',
      identity: { id: 'hr-manager', name: 'HR Manager', version: '1.0.0' },
      workspaceTemplate: { root: 'dist/workspace-template', entryFiles: ['AGENTS.md'], mcpFiles: [], skillDirs: [] },
    }))

    const output = await $`bun ${cliPath} plan-provision --user Alice@Example.com --target aissh:server-1 --environment env-alice --paseo-home /home/alice/.paseo --paseo-endpoint unix:/run/paseo/alice.sock --provider acp-team --provider-kind acp --paseo-provider-id paseo-acp-team --soul ${descriptorPath} --workspace /home/alice/workspaces/hr`.json()

    expect(output.command).toContain('Paseo provider profile paseo-acp-team')
    expect(output.command).not.toContain('custom')
  })
})
