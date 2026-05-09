import { describe, expect, it } from 'bun:test'

import {
  runArtifactsList,
  runArtifactsShow,
  runRunsCancel,
  runRunsList,
  runRunsShow,
} from './workbench'

describe('aiworker worker workbench inspection commands', () => {
  function deps(responses: unknown[]) {
    const calls: Array<{ url: string, init?: RequestInit }> = []
    return {
      calls,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init })
        const body = responses.shift() ?? {}
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      },
      loadWorkerContext: async () => ({
        token: 'wtk_test',
        workerId: 'w_workbench_cli',
      }),
    }
  }

  function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
    const captured: string[] = []
    const original = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(arg => String(arg)).join(' '))
    }) as typeof console.log
    return fn()
      .then(result => ({ result, output: captured.join('\n') }))
      .finally(() => {
        console.log = original
      })
  }

  it('lists and shows daemon runs with worker id', async () => {
    const d = deps([
      { runs: [{ id: 'run-1', status: 'succeeded' }] },
      { run: { id: 'run-1', status: 'succeeded' } },
    ])

    const list = await captureConsole(() => runRunsList({ limit: 12 }, d))
    const show = await captureConsole(() => runRunsShow('run/1', d))

    expect(list.result).toBe(0)
    expect(show.result).toBe(0)
    expect(d.calls[0]?.url).toBe('http://localhost:9217/api/worker/runs?limit=12')
    expect(d.calls[1]?.url).toBe('http://localhost:9217/api/worker/runs/run%2F1')
    expect((d.calls[0]?.init?.headers as Headers).get('Authorization')).toBe('Bearer wtk_test')
    expect(JSON.parse(list.output)).toMatchObject({ workerId: 'w_workbench_cli', runs: [{ id: 'run-1' }] })
    expect(JSON.parse(show.output)).toMatchObject({ workerId: 'w_workbench_cli', run: { id: 'run-1' } })
  })

  it('cancels daemon runs through the run contract', async () => {
    const d = deps([{ run: { id: 'run-2', status: 'cancelled' } }])

    const { result, output } = await captureConsole(() => runRunsCancel('run-2', d))

    expect(result).toBe(0)
    expect(d.calls[0]?.url).toBe('http://localhost:9217/api/worker/runs/run-2/cancel')
    expect(d.calls[0]?.init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(output)).toMatchObject({ run: { status: 'cancelled' } })
  })

  it('lists and shows daemon artifact metadata', async () => {
    const d = deps([
      { artifacts: [{ id: 'artifact-1', relativePath: 'reports/summary.md' }] },
      { artifact: { id: 'artifact-1', relativePath: 'reports/summary.md' } },
    ])

    const list = await captureConsole(() => runArtifactsList({
      limit: 5,
      runId: 'run-1',
      status: 'available',
    }, d))
    const show = await captureConsole(() => runArtifactsShow('artifact/1', d))

    expect(list.result).toBe(0)
    expect(show.result).toBe(0)
    expect(d.calls[0]?.url).toBe('http://localhost:9217/api/worker/artifacts?limit=5&runId=run-1&status=available')
    expect(d.calls[1]?.url).toBe('http://localhost:9217/api/worker/artifacts/artifact%2F1')
    expect(JSON.parse(list.output)).toMatchObject({ artifacts: [{ id: 'artifact-1' }] })
    expect(JSON.parse(show.output)).toMatchObject({ artifact: { relativePath: 'reports/summary.md' } })
  })

  it('rejects missing ids before daemon calls', async () => {
    const d = deps([])

    expect(await runRunsShow('', d)).toBe(2)
    expect(await runArtifactsShow('', d)).toBe(2)
    expect(d.calls).toHaveLength(0)
  })

  it('rejects invalid artifact status before daemon calls', async () => {
    const d = deps([])

    expect(await runArtifactsList({ status: 'deleted' }, d)).toBe(2)
    expect(d.calls).toHaveLength(0)
  })
})
