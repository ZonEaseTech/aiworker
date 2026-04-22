import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@aiworker/shared'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'

export interface CliExecutorOptions {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  sandbox?: boolean
}

interface ToolInvocation {
  name: string
  arguments: Record<string, unknown>
}

/**
 * Spawn-based executor: invokes a CLI binary per tool call. The orchestrator
 * passes a JSON-encoded tool invocation on stdin; the binary responds with a
 * JSON result on stdout. `sandbox: true` is reserved for FEAT-002 (one-shot
 * docker wrap); MVP runs the bare process.
 *
 * Chat streaming is not supported by this executor directly — use the `http`
 * executor for text generation and wire CLI tools as exposed tools there.
 */
export class CliExecutor implements ExecutorProvider {
  readonly name = 'cli'

  constructor(private readonly opts: CliExecutorOptions) {}

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    try {
      const child = spawn(this.opts.command, ['--version'], {
        cwd: this.opts.cwd,
        env: { ...process.env, ...this.opts.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const code = await Promise.race([
        once(child, 'exit').then(([c]) => c as number | null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
      ])
      if (code === null) {
        child.kill('SIGKILL')
        return { name: this.name, status: 'degraded', lastChecked }
      }
      return { name: this.name, status: code === 0 ? 'healthy' : 'degraded', lastChecked }
    }
    catch {
      return { name: this.name, status: 'down', lastChecked }
    }
  }

  async listTools(): Promise<ExecutorTool[]> {
    return []
  }

  async* run(_input: AgentRunInput): AsyncGenerator<AgentEvent> {
    yield { type: 'error', error: 'CliExecutor.run is not implemented — CLI executors provide tools, not chat.' }
    yield { type: 'finish', reason: 'error' }
  }

  async invokeTool(call: ToolInvocation): Promise<string> {
    const timeoutMs = this.opts.timeoutMs ?? 30_000
    const child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: { ...process.env, ...this.opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    const errChunks: Buffer[] = []
    child.stderr.on('data', (d: Buffer) => errChunks.push(d))

    child.stdin.write(`${JSON.stringify(call)}\n`)
    child.stdin.end()

    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    const [code] = await once(child, 'exit') as [number | null]
    clearTimeout(timer)

    if (code !== 0) {
      const stderr = Buffer.concat(errChunks).toString('utf8')
      throw new Error(`CLI executor exited with ${code ?? 'null'}: ${stderr || '(no stderr)'}`)
    }

    return Buffer.concat(chunks).toString('utf8')
  }
}
