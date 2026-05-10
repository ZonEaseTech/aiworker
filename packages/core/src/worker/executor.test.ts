import type { LocalExecutorEvent } from './executor'

import { mkdtempSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { createExternalEngineExecutor } from './executor'

describe('createExternalEngineExecutor', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const item of roots)
      await rm(item, { force: true, recursive: true })
    roots = []
  })

  function makeRoot(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'aiworker-executor-'))
    roots.push(root)
    return root
  }

  async function makeScript(body: string): Promise<string> {
    const dir = makeRoot()
    const file = path.join(dir, 'engine.sh')
    await writeFile(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, 'utf8')
    await chmod(file, 0o755)
    return file
  }

  function baseInput(command: string, workspaceRoot: string, events: LocalExecutorEvent[] = []) {
    return {
      engineCommand: command,
      engineId: 'codex',
      invocationId: 'invocation-1',
      invocationRoot: path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001'),
      onEvent: (event: LocalExecutorEvent) => events.push(event),
      prompt: 'Prepare a business answer.',
      sessionId: 'session-1',
      turnId: 'turn-1',
      workspaceId: 'workspace-1',
      workspaceRoot,
      metadata: {
        outputKind: 'candidate-screen',
        skillName: 'Candidate Screen',
      },
    }
  }

  it('parses Codex JSONL into structured session events and discovers real artifacts', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(path.join(workspaceRoot, 'artifacts', 'session-1'), { recursive: true })
    const command = await makeScript(`
cat >/dev/null
cat > artifacts/session-1/turn-1-candidate-screen.md <<'EOF'
# Candidate Screen

Evidence attached.
EOF
printf '%s\\n' '{"type":"thread.started"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.started","item":{"type":"command_execution","id":"tool-1","command":"printf hi"}}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"command_execution","id":"tool-1","command":"printf hi","aggregated_output":"hi","exit_code":0}}'
printf '%s\\n' '{"type":"item.started","item":{"id":"file-1","type":"file_change","changes":[{"path":"artifacts/session-1/turn-1-candidate-screen.md","kind":"add"}],"status":"in_progress"}}'
printf '%s\\n' '{"type":"item.completed","item":{"id":"file-1","type":"file_change","changes":[{"path":"artifacts/session-1/turn-1-candidate-screen.md","kind":"add"}],"status":"completed"}}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}'
printf '%s\\n' '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":5}}'
`)
    const events: LocalExecutorEvent[] = []

    const result = await createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))

    expect(result.summary).toBe('Done.')
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]?.path).toBe('artifacts/session-1/turn-1-candidate-screen.md')
    expect(events.map(event => event.kind)).toContain('tool_use')
    expect(events.map(event => event.kind)).toContain('tool_result')
    expect(events.map(event => event.kind)).toContain('usage')
    expect(events.some(event => event.kind === 'status' && event.label === 'file_change')).toBe(true)
    expect(events.some(event => event.kind === 'raw')).toBe(false)
    expect(events.some(event => event.kind === 'log' && event.stream === 'stderr')).toBe(false)
  })

  it('allows text-only successful turns without inventing an artifact', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf '%s\\n' '{"type":"thread.started"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Plain answer."}}'
`)
    const events: LocalExecutorEvent[] = []

    const result = await createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))

    expect(result.summary).toBe('Plain answer.')
    expect(result.artifacts).toEqual([])
    expect(result.review).toBeUndefined()
    expect(events.some(event => event.kind === 'text' && event.text === 'Plain answer.')).toBe(true)
  })

  it('surfaces stderr only when the engine process fails', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
cat >/dev/null
printf 'fatal engine error\\n' >&2
exit 9
`)
    const events: LocalExecutorEvent[] = []

    await expect(createExternalEngineExecutor().invoke(baseInput(command, workspaceRoot, events))).rejects.toThrow('exited with code 9')
    expect(events.some(event => event.kind === 'log' && event.stream === 'stderr' && event.chunk.includes('fatal engine error'))).toBe(true)
  })
})
