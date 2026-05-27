import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { namespaceSoulAppCapabilityId } from '@zonease/aiworker-soul-protocol'
import { closeWorkerDb, initWorkerDb, listEngineInvocations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runCli } from './aiworker'

const FREEFORM_APP_ID = 'aiworker-freeform'
const FREEFORM_CAPABILITY_ID = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')

describe('Freeform CLI golden path', () => {
  const originalEnv = { ...process.env }
  const originalWrite = process.stdout.write
  let root = ''
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-freeform-cli-golden-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    await writeFakeCodexCommand()
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    closeWorkerDb()
    process.exitCode = 0
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    process.stdout.write = originalWrite
    await rm(root, { recursive: true, force: true })
  })

  it('runs descriptor install through worker, workspace, session, and follow-up invocation', async () => {
    const installed = await runCliJson<{ app: { appId: string, status: string } }>('app', 'install', freeformDescriptorPath())
    expect(installed.app).toMatchObject({ appId: FREEFORM_APP_ID, status: 'installed' })

    const enabled = await runCliJson<{ app: { appId: string, status: string } }>('app', 'enable', FREEFORM_APP_ID)
    expect(enabled.app).toMatchObject({ appId: FREEFORM_APP_ID, status: 'enabled' })

    const worker = await runCliJson<{ worker: { id: string, soulId: string } }>(
      'worker',
      'create',
      '--id',
      'freeform-golden-worker',
      '--name',
      'Freeform Golden Worker',
      '--soul',
      FREEFORM_APP_ID,
    )
    expect(worker.worker).toMatchObject({ id: 'freeform-golden-worker', soulId: FREEFORM_APP_ID })

    const workspace = await runCliJson<{ workspace: { id: string, rootPath: string, type: string, workerId: string } }>(
      'workspace',
      'create',
      '--worker',
      'freeform-golden-worker',
      '--name',
      'Freeform Golden Workspace',
      '--type',
      'freeform',
    )
    expect(workspace.workspace).toMatchObject({ type: 'freeform', workerId: 'freeform-golden-worker' })

    const started = await runCliJson<{
      invocation: { engineId: string, id: string, sessionId: string, status: string }
      session: { id: string, status: string, workspaceId: string }
      turn: { sessionId: string, status: string }
    }>(
      'session',
      'start',
      '--worker',
      'freeform-golden-worker',
      '--workspace',
      workspace.workspace.id,
      '--skill',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Freeform golden session',
      '--context',
      'CLI-first golden path context.',
      '--input',
      'Start the Freeform golden path.',
    )
    expect(started.session).toMatchObject({ status: 'active', workspaceId: workspace.workspace.id })
    expect(started.invocation).toMatchObject({ engineId: 'codex', sessionId: started.session.id, status: 'succeeded' })
    expect(started.turn).toMatchObject({ sessionId: started.session.id, status: 'succeeded' })

    const followed = await runCliJson<{
      invocation: { engineId: string, id: string, sessionId: string, status: string }
    }>(
      'session',
      'invoke',
      '--session',
      started.session.id,
      '--input',
      'Continue the Freeform golden path.',
    )
    expect(followed.invocation).toMatchObject({ engineId: 'codex', sessionId: started.session.id, status: 'succeeded' })

    const shown = await runCliJson<{ session: { id: string, status: string }, turns: Array<{ sessionId: string, status: string }> }>(
      'session',
      'show',
      started.session.id,
    )
    expect(shown.session).toMatchObject({ id: started.session.id, status: 'active' })
    expect(shown.turns).toEqual([])

    initWorkerDb(process.env.WORKER_DB_PATH!)
    const invocations = listEngineInvocations(started.session.id).sort((left, right) => left.seq - right.seq)
    closeWorkerDb()
    expect(invocations.map(invocation => invocation.status)).toEqual(['succeeded', 'succeeded'])
    expect(invocations.map(invocation => invocation.sessionId)).toEqual([started.session.id, started.session.id])
    expect(invocations[1]?.inputRef).toBe(`aiworker://sessions/${started.session.id}/invocations/${followed.invocation.id}/input`)
    expect(invocations[1]?.inputRef).not.toContain('/turns/')

    await expect(readFile(path.join(workspace.workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker Freeform Workspace')
    await expect(stat(path.join(workspace.workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'))).resolves.toBeTruthy()
  })

  async function runCliJson<T>(...args: string[]): Promise<T> {
    output = ''
    const exitCode = await runCli(['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args])
    expect(output).not.toContain('[error]')
    expect(exitCode).toBe(0)
    return JSON.parse(output) as T
  }

  async function writeFakeCodexCommand(): Promise<void> {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = path.join(binDir, 'codex')
    await writeFile(commandPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat >/dev/null',
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
      '',
    ].join('\n'))
    await chmod(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  }
})

function freeformDescriptorPath(): string {
  return path.resolve(import.meta.dir, '..', '..', '..', 'souls', FREEFORM_APP_ID, 'dist', 'soul.descriptor.json')
}
