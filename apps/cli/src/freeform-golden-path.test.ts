import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { namespaceSoulAppCapabilityId } from '@zonease/aiworker-soul-protocol'
import { closeWorkerDb, initWorkerDb, listEngineInvocations, listSessionEvents } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runCli } from './aiworker'

const FREEFORM_APP_ID = 'aiworker-freeform'
const FREEFORM_CAPABILITY_ID = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')

describe('Freeform CLI golden path', () => {
  const originalEnv = { ...process.env }
  const originalErrorWrite = process.stderr.write
  const originalWrite = process.stdout.write
  let errorOutput = ''
  let root = ''
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    errorOutput = ''
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-freeform-cli-golden-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    await writeFakeCodexCommand()
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errorOutput += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stderr.write
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
    process.stderr.write = originalErrorWrite
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

    const savedConfig = await runCliJson<{
      config: {
        configKey: string
        source: string
        value: {
          enabled: boolean
          kind: string
          options: Record<string, unknown>
          sourceRef: string
          target: string
          updatedBy: string
        }
        workerId: string
      }
    }>(
      'worker',
      'config',
      'set',
      'freeform-golden-worker',
      'engine-selection',
      '--kind',
      'engine-selection',
      '--target',
      'codex',
      '--source-ref',
      'descriptor://configuration/default-engine',
      '--options-json',
      '{"profileRef":"secretref:codex/default-profile"}',
    )
    expect(savedConfig.config).toMatchObject({
      configKey: 'engine-selection',
      source: 'cli',
      value: {
        enabled: true,
        kind: 'engine-selection',
        options: { profileRef: 'secretref:codex/default-profile' },
        sourceRef: 'descriptor://configuration/default-engine',
        target: 'codex',
        updatedBy: 'cli',
      },
      workerId: 'freeform-golden-worker',
    })

    const listedConfig = await runCliJson<{
      config: {
        values: Array<{
          configKey: string
          value: { kind: string, target: string }
          workerId: string
        }>
      }
    }>('worker', 'config', 'list', 'freeform-golden-worker')
    expect(listedConfig.config.values).toContainEqual(expect.objectContaining({
      configKey: 'engine-selection',
      value: expect.objectContaining({ kind: 'engine-selection', target: 'codex' }),
      workerId: 'freeform-golden-worker',
    }))

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
      invocation: { engineId: string, id: string, inputRef: string, sessionId: string, status: string }
      session: { id: string, status: string, workspaceId: string }
    }>(
      'session',
      'start',
      '--worker',
      'freeform-golden-worker',
      '--workspace',
      workspace.workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Freeform golden session',
      '--input',
      'Start the Freeform golden path.',
    )
    expect(started.session).toMatchObject({ status: 'active', workspaceId: workspace.workspace.id })
    expect(started.invocation).toMatchObject({ engineId: 'codex', sessionId: started.session.id, status: 'succeeded' })
    expect(started.invocation.inputRef).toBe(`aiworker://sessions/${started.session.id}/invocations/${started.invocation.id}/input`)
    expect(started.invocation.inputRef).not.toContain('/turns/')
    expect('turn' in started).toBe(false)

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

    const secondFollowed = await runCliJson<{
      invocation: { engineId: string, id: string, sessionId: string, status: string }
    }>(
      'session',
      'invoke',
      '--session',
      started.session.id,
      '--input',
      'Continue through another session invocation.',
    )
    expect(secondFollowed.invocation).toMatchObject({ engineId: 'codex', sessionId: started.session.id, status: 'succeeded' })

    const shown = await runCliJson<{
      invocations: Array<{ id: string, sessionId: string, status: string }>
      session: { id: string, status: string }
    }>(
      'session',
      'show',
      started.session.id,
    )
    expect(shown.session).toMatchObject({ id: started.session.id, status: 'active' })
    expect('turns' in shown).toBe(false)
    expect(shown.invocations.map(invocation => invocation.id)).toEqual([
      started.invocation.id,
      followed.invocation.id,
      secondFollowed.invocation.id,
    ])
    expect(shown.invocations.map(invocation => invocation.status)).toEqual(['succeeded', 'succeeded', 'succeeded'])

    const cliEvents = await runCliJson<{
      events: Array<{ invocationId: string, payloadJson: Record<string, unknown>, sessionId: string, type: string }>
      invocation: { id: string, processState: string, sessionId: string, status: string }
    }>('session', 'events', started.invocation.id)
    expect(cliEvents.invocation).toEqual({
      id: started.invocation.id,
      processState: 'exited',
      sessionId: started.session.id,
      status: 'succeeded',
    })
    expect(cliEvents.events.every(event => event.invocationId === started.invocation.id)).toBe(true)
    expect(cliEvents.events.every(event => event.sessionId === started.session.id)).toBe(true)
    expect(cliEvents.events.map(event => event.type)).toEqual(expect.arrayContaining(['tool', 'assistant_delta', 'status']))
    expect(JSON.stringify(cliEvents)).not.toContain('literal-secret-value')
    expect(JSON.stringify(cliEvents)).not.toContain('/turns/')

    const missingInvocationExit = await runCli([
      '/usr/bin/bun',
      '/repo/apps/cli/src/aiworker.ts',
      'session',
      'events',
      'invocation-does-not-exist',
    ])
    expect(missingInvocationExit).toBe(1)
    expect(errorOutput).toContain('invocation not found: invocation-does-not-exist')

    initWorkerDb(process.env.WORKER_DB_PATH!)
    const invocations = listEngineInvocations(started.session.id).sort((left, right) => left.seq - right.seq)
    const bridgeEvents = listSessionEvents(started.session.id)
    closeWorkerDb()
    expect(invocations.map(invocation => invocation.status)).toEqual(['succeeded', 'succeeded', 'succeeded'])
    expect(invocations.map(invocation => invocation.sessionId)).toEqual([started.session.id, started.session.id, started.session.id])
    expect(invocations[0]?.inputRef).toBe(`aiworker://sessions/${started.session.id}/invocations/${started.invocation.id}/input`)
    expect(invocations[0]?.inputRef).not.toContain('/turns/')
    expect(invocations[1]?.inputRef).toBe(`aiworker://sessions/${started.session.id}/invocations/${followed.invocation.id}/input`)
    expect(invocations[1]?.inputRef).not.toContain('/turns/')
    expect(invocations[2]?.inputRef).toBe(`aiworker://sessions/${started.session.id}/invocations/${secondFollowed.invocation.id}/input`)
    expect(invocations[2]?.inputRef).not.toContain('/turns/')
    assertInvocationEventLogRefs(invocations, started.session.id)
    assertInvocationExternalSessionRefs(invocations)

    const startedEvents = bridgeEvents.filter(event => event.invocationId === started.invocation.id)
    expect(startedEvents).toContainEqual(expect.objectContaining({
      payloadJson: expect.objectContaining({
        bridgeEvent: 'invocation.tool.observed',
        tool: expect.objectContaining({ name: 'Bash', phase: 'use' }),
      }),
      type: 'tool',
    }))
    expect(startedEvents).toContainEqual(expect.objectContaining({
      payloadJson: expect.objectContaining({
        bridgeEvent: 'invocation.tool.observed',
        tool: expect.objectContaining({ content: 'bridge', phase: 'result' }),
      }),
      type: 'tool',
    }))
    expect(startedEvents).toContainEqual(expect.objectContaining({
      payloadJson: expect.objectContaining({
        bridgeEvent: 'invocation.output.delta',
        data: { text: 'Done.' },
      }),
      type: 'assistant_delta',
    }))
    expect(startedEvents).toContainEqual(expect.objectContaining({
      payloadJson: expect.objectContaining({
        bridgeEvent: 'invocation.usage.observed',
        usage: { costUsd: null, inputTokens: 3, outputTokens: 5 },
      }),
      type: 'status',
    }))
    expect(bridgeEvents).toContainEqual(expect.objectContaining({
      invocationId: followed.invocation.id,
      payloadJson: expect.objectContaining({
        bridgeEvent: 'invocation.output.delta',
        data: { text: 'Done.' },
      }),
      type: 'assistant_delta',
    }))
    expect(bridgeEvents.every(event => event.sessionId === started.session.id)).toBe(true)
    expect(JSON.stringify(bridgeEvents)).not.toContain('/turns/')
    for (const invocation of invocations)
      await assertRedactedEngineLogProof(invocation.metadataJson)

    await expect(readFile(path.join(workspace.workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('AIWorker Freeform Workspace')
    await expect(stat(path.join(workspace.workspace.rootPath, '.agents', 'skills', 'aiworker-freeform-freeform-session', 'SKILL.md'))).resolves.toBeTruthy()

    const archived = await runCliJson<{ session: { id: string, status: string } }>('session', 'archive', started.session.id)
    expect(archived.session).toMatchObject({ id: started.session.id, status: 'archived' })
    await assertArchivedSessionBlocksFollowUp(started.session.id)

    const archivedShown = await runCliJson<{
      invocations: Array<{ id: string, status: string }>
      session: { id: string, status: string }
    }>('session', 'show', started.session.id)
    expect(archivedShown.session).toMatchObject({ id: started.session.id, status: 'archived' })
    expect(archivedShown.invocations.map(invocation => invocation.id)).toEqual([
      started.invocation.id,
      followed.invocation.id,
      secondFollowed.invocation.id,
    ])
    expect(archivedShown.invocations.map(invocation => invocation.status)).toEqual(['succeeded', 'succeeded', 'succeeded'])

    const reconciled = await runCliJson<{
      invocation: { failureCode: string | null, id: string, processState: string, sessionId: string, status: string, summary: string | null }
      session: { id: string, status: string, workspaceId: string }
    }>(
      'session',
      'reconcile',
      secondFollowed.invocation.id,
      '--diagnostic',
      'native process vanished token=sk-cli-reconcile-secret',
    )
    expect(reconciled.invocation).toMatchObject({
      id: secondFollowed.invocation.id,
      processState: 'lost',
      sessionId: started.session.id,
      status: 'lost',
      summary: 'Native engine process was lost.',
    })
    expect(reconciled.session).toMatchObject({
      id: started.session.id,
      status: 'archived',
      workspaceId: workspace.workspace.id,
    })
    expect(JSON.stringify(reconciled)).not.toContain('sk-cli-reconcile-secret')
    expect(JSON.stringify(reconciled)).not.toContain('/turns/')

    const missingReconcileExit = await runCli([
      '/usr/bin/bun',
      '/repo/apps/cli/src/aiworker.ts',
      'session',
      'reconcile',
      'invocation-does-not-exist',
    ])
    expect(missingReconcileExit).toBe(1)
    expect(errorOutput).toContain('invocation not found: invocation-does-not-exist')

    const cancelledTerminal = await runCliJson<{
      invocation: { id: string, processState: string, sessionId: string, status: string }
      session: { id: string, status: string }
    }>(
      'session',
      'cancel',
      followed.invocation.id,
      '--reason',
      'operator pressed Ctrl+C token=sk-cli-cancel-secret',
    )
    expect(cancelledTerminal.invocation).toMatchObject({
      id: followed.invocation.id,
      sessionId: started.session.id,
      status: 'succeeded',
    })
    expect(cancelledTerminal.session).toMatchObject({
      id: started.session.id,
      status: 'archived',
    })
    expect(JSON.stringify(cancelledTerminal)).not.toContain('sk-cli-cancel-secret')
    expect(JSON.stringify(cancelledTerminal)).not.toContain('/turns/')

    const missingCancelExit = await runCli([
      '/usr/bin/bun',
      '/repo/apps/cli/src/aiworker.ts',
      'session',
      'cancel',
      'invocation-does-not-exist',
    ])
    expect(missingCancelExit).toBe(1)
    expect(errorOutput).toContain('invocation not found: invocation-does-not-exist')
  })

  async function runCliJson<T>(...args: string[]): Promise<T> {
    errorOutput = ''
    output = ''
    const exitCode = await runCli(['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args])
    expect(output).not.toContain('[error]')
    expect(errorOutput).not.toContain('[error]')
    expect(exitCode).toBe(0)
    return JSON.parse(output) as T
  }

  async function assertArchivedSessionBlocksFollowUp(sessionId: string): Promise<void> {
    errorOutput = ''
    output = ''
    const exitCode = await runCli([
      '/usr/bin/bun',
      '/repo/apps/cli/src/aiworker.ts',
      'session',
      'invoke',
      '--session',
      sessionId,
      '--input',
      'This follow-up should be blocked after archive.',
    ])
    expect(exitCode).toBe(1)
    expect(output).toBe('')
    expect(errorOutput).toContain(`Session ${sessionId} is archived and cannot start new work.`)
    expect(errorOutput).not.toContain('/turns/')
    expect(errorOutput).not.toContain('literal-secret-value')
  }

  async function writeFakeCodexCommand(): Promise<void> {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = path.join(binDir, 'codex')
    const counterPath = shellSingleQuote(path.join(root, 'codex-thread-counter'))
    const shCounter = '$' + '{counter}'
    const shThreadSeq = '$' + '{thread_seq}'
    await writeFile(commandPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat >/dev/null',
      `counter=${counterPath}`,
      'thread_seq=1',
      `if [ -f "${shCounter}" ]; then thread_seq=$(( $(cat "${shCounter}") + 1 )); fi`,
      `printf '%s' "${shThreadSeq}" > "${shCounter}"`,
      'printf \'authorization = "literal-secret-value"\\n\' >&2',
      `printf '%s\\n' "{\\"type\\":\\"thread.started\\",\\"thread_id\\":\\"native-thread-${shThreadSeq}\\"}"`,
      'printf \'%s\\n\' \'{"type":"turn.started"}\'',
      'printf \'%s\\n\' \'{"type":"item.started","item":{"type":"command_execution","id":"tool-1","command":"printf bridge"}}\'',
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"command_execution","id":"tool-1","command":"printf bridge","aggregated_output":"bridge","exit_code":0}}\'',
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
      'printf \'%s\\n\' \'{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":5}}\'',
      '',
    ].join('\n'))
    await chmod(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  }
})

function assertInvocationEventLogRefs(invocations: Array<{ eventLogRef: string | null, id: string }>, sessionId: string): void {
  for (const invocation of invocations) {
    expect(invocation.eventLogRef).toBe(`aiworker://sessions/${sessionId}/invocations/${invocation.id}/events`)
    expect(invocation.eventLogRef).not.toContain('/turns/')
  }
}

function assertInvocationExternalSessionRefs(invocations: Array<{ externalSessionRef: string | null, metadataJson: Record<string, unknown> }>): void {
  const ids: string[] = []
  for (const invocation of invocations) {
    expect(invocation.externalSessionRef).toBeTruthy()
    expect(invocation.externalSessionRef).not.toContain('/turns/')
    const ref = JSON.parse(invocation.externalSessionRef!) as { id?: string, target?: string }
    expect(ref.target).toBe('codex')
    expect(ref.id).toMatch(/^native-thread-\d+$/)
    expect(invocation.metadataJson).toMatchObject({ externalSessionRef: ref })
    ids.push(ref.id!)
  }
  expect(new Set(ids).size).toBe(invocations.length)
}

async function assertRedactedEngineLogProof(metadataJson: Record<string, unknown>): Promise<void> {
  const stderrLog = metadataJson.stderrLog
  expect(typeof stderrLog).toBe('string')
  const stderr = await readFile(stderrLog as string, 'utf8')
  expect(stderr).toContain('[REDACTED]')
  expect(stderr).not.toContain('literal-secret-value')
}

function freeformDescriptorPath(): string {
  return path.resolve(import.meta.dir, '..', '..', '..', 'souls', FREEFORM_APP_ID, 'dist', 'soul.descriptor.json')
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}
