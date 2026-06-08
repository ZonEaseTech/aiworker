// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.resetModules()
  vi.unstubAllGlobals()
})

function stubOkJson(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

// local-client reads API_BASE at module load, so set the entry path before
// re-importing it for each prefix/no-prefix case.
async function loadLocalClientAt(pathname: string) {
  window.history.replaceState(null, '', pathname)
  vi.resetModules()
  return import('./local-client')
}

describe('local-client prefixing', () => {
  it('prefixes localJson requests with the worker base under the Host tunnel', async () => {
    const spy = stubOkJson()
    const { localJson } = await loadLocalClientAt('/workers/w_X')
    await localJson('/api/sessions')
    expect(spy).toHaveBeenCalledWith('/workers/w_X/api/sessions', expect.anything())
  })

  it('prefixes localJsonStrict requests with the worker base under the Host tunnel', async () => {
    const spy = stubOkJson()
    const { localJsonStrict } = await loadLocalClientAt('/workers/w_X/workspaces/ws')
    await localJsonStrict('/api/workers/w_X/config/agents-md/content')
    expect(spy).toHaveBeenCalledWith('/workers/w_X/api/workers/w_X/config/agents-md/content', expect.anything())
  })

  it('prefixes localText requests with the worker base under the Host tunnel', async () => {
    const spy = vi.fn(async () => new Response('file-body', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const { localText } = await loadLocalClientAt('/workers/w_X')
    await localText('/api/file')
    expect(spy).toHaveBeenCalledWith('/workers/w_X/api/file')
  })

  it('leaves absolute API paths unchanged at the standalone root entry', async () => {
    const spy = stubOkJson()
    const { localJson } = await loadLocalClientAt('/')
    await localJson('/api/sessions')
    expect(spy).toHaveBeenCalledWith('/api/sessions', expect.anything())
  })
})
