import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { sanitizeEngineEnv } from './engine-env'

export type NativeEngineInvocationStatus = 'failed' | 'running' | 'succeeded'

export type NativeEngineBridgeEvent
  = | { kind: 'status', status: NativeEngineInvocationStatus }
    | { chunk: string, kind: 'stderr' }
    | { chunk: string, kind: 'stdout' }
    | { code: number | null, kind: 'exit', signal: NodeJS.Signals | null, status: NativeEngineInvocationStatus }

export interface NativeEngineBridgeInput {
  args?: string[]
  command: string
  cwd: string
  env?: NodeJS.ProcessEnv
  input?: string
  invocationId?: string
  onEvent?: (event: NativeEngineBridgeEvent) => void
  workerId: string
}

export interface NativeEngineBridgeResult {
  args: string[]
  command: string
  cwd: string
  durationMs: number
  exitCode: number | null
  finishedAt: string
  invocationId: string
  signal: NodeJS.Signals | null
  startedAt: string
  status: Exclude<NativeEngineInvocationStatus, 'running'>
  stderr: string
  stdout: string
  workerId: string
}

export async function invokeNativeEngine(input: NativeEngineBridgeInput): Promise<NativeEngineBridgeResult> {
  await assertDirectory(input.cwd)
  const cwd = await realpath(input.cwd)

  const args = input.args ?? []
  const invocationId = input.invocationId ?? randomUUID()
  const startedAt = new Date()
  const startedMs = Date.now()
  let stdout = ''
  let stderr = ''

  input.onEvent?.({ kind: 'status', status: 'running' })

  const result = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn(input.command, args, {
      cwd,
      env: {
        ...sanitizeEngineEnv(),
        ...(input.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // eslint-disable-next-line node/prefer-global/buffer
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stdout += text
      input.onEvent?.({ chunk: text, kind: 'stdout' })
    })
    // eslint-disable-next-line node/prefer-global/buffer
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderr += text
      input.onEvent?.({ chunk: text, kind: 'stderr' })
    })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal }))
    child.stdin.end(input.input ?? '')
  })

  const status = result.code === 0 ? 'succeeded' : 'failed'
  input.onEvent?.({ code: result.code, kind: 'exit', signal: result.signal, status })

  const finishedAt = new Date()
  return {
    args,
    command: input.command,
    cwd,
    durationMs: Date.now() - startedMs,
    exitCode: result.code,
    finishedAt: finishedAt.toISOString(),
    invocationId,
    signal: result.signal,
    startedAt: startedAt.toISOString(),
    status,
    stderr,
    stdout,
    workerId: input.workerId,
  }
}

async function assertDirectory(cwd: string): Promise<void> {
  const stats = await stat(cwd).catch(() => null)
  if (!stats?.isDirectory())
    throw new Error(`Native engine cwd not found: ${cwd}`)
}
