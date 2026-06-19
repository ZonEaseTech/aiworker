import type { AdminBootstrapStatus } from '@/lib/admin-remediation'

import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'

import { adminConsoleData } from '@/lib/admin-data'
import { AdminDataContext } from '@/lib/admin-data-context'
import { ProvisioningPage } from './provisioning-page'
// Effect-exercising tests for ProvisioningPage.
// Uses happy-dom + React createRoot/act to run useEffect hooks,
// unlike admin-pages.test.tsx which uses renderToStaticMarkup (effects don't fire).
import '../test-setup-dom'

const defaultBootstrap: AdminBootstrapStatus = {
  adminTokenRequired: false,
  auth: { authenticated: true, loginRequired: false, loginUrl: '', logoutUrl: '', mode: 'local' },
  controlPlaneDirConfigured: true,
  host: 'localhost',
  remoteAccessEnabled: false,
  source: 'fixture',
}

type CtxValue = NonNullable<React.ContextType<typeof AdminDataContext>>

function makeCtx(overrides: Partial<CtxValue> = {}): CtxValue {
  return {
    bootstrap: defaultBootstrap,
    data: adminConsoleData,
    decideApproval: async () => {},
    isLive: false,
    loadError: null,
    reload: async () => {},
    ...overrides,
  }
}

const containers: HTMLElement[] = []

afterEach(() => {
  for (const c of containers.splice(0)) {
    if (document.body.contains(c))
      document.body.removeChild(c)
  }
})

/**
 * Mounts ProvisioningPage inside a controllable context wrapper.
 * The wrapper holds context in state so tests can swap it after mount,
 * simulating live data arriving asynchronously.
 */
function mountWithControllableCtx(path: string, initialCtx: CtxValue) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)

  let _setCtx!: (v: CtxValue) => void

  function Wrapper() {
    const [ctx, setCtx] = useState(initialCtx)
    _setCtx = setCtx
    return createElement(
      AdminDataContext.Provider,
      { value: ctx },
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(ProvisioningPage),
      ),
    )
  }

  const root = createRoot(container)
  root.render(createElement(Wrapper))

  return {
    text: () => container.textContent ?? '',
    setCtx: (v: CtxValue) => _setCtx(v),
    unmount: () => root.unmount(),
  }
}

describe('provisioning page effect tests (DOM + act)', () => {
  test('param ?assignment=asn-cara-acp seeds cara on mount', async () => {
    const { text, unmount } = mountWithControllableCtx(
      '/provisioning?assignment=asn-cara-acp',
      makeCtx(),
    )
    await act(async () => {})
    expect(text()).toContain('cara@example.com')
    expect(text()).not.toContain('alice@example.com')
    unmount()
  })

  test('no param falls back to first assignment (alice)', async () => {
    const { text, unmount } = mountWithControllableCtx('/provisioning', makeCtx())
    await act(async () => {})
    expect(text()).toContain('alice@example.com')
    unmount()
  })

  test('data arrives after mount with assignment absent — param effect applies cara once data includes it', async () => {
    // Simulate live first render: control-plane not yet responded, assignments empty
    const emptyCtx = makeCtx({ data: { ...adminConsoleData, assignments: [] } })
    const { text, setCtx, unmount } = mountWithControllableCtx(
      '/provisioning?assignment=asn-cara-acp',
      emptyCtx,
    )
    await act(async () => {})

    // Before data arrives: cara not resolvable, no email in selected-employee summary
    expect(text()).not.toContain('cara@example.com')

    // Data arrives (context value updates, same React tree stays mounted)
    await act(async () => {
      setCtx(makeCtx())
    })

    // Param effect must now resolve asn-cara-acp → cara (HIGH bug was that ref was marked
    // consumed before resolution succeeded, blocking this re-apply)
    expect(text()).toContain('cara@example.com')
    expect(text()).not.toContain('alice@example.com')
    unmount()
  })

  test('after param applied, data identity change does not re-clobber selection back', async () => {
    const { text, setCtx, unmount } = mountWithControllableCtx(
      '/provisioning?assignment=asn-cara-acp',
      makeCtx(),
    )
    await act(async () => {})
    expect(text()).toContain('cara@example.com')

    // Shallow-clone adminData (identity change, same content) — simulates a data refresh
    await act(async () => {
      setCtx(makeCtx({ data: { ...adminConsoleData } }))
    })

    // ref guard (lastAppliedRequestedId.current === requestedAssignmentId) prevents re-apply;
    // cara must still be showing
    expect(text()).toContain('cara@example.com')
    unmount()
  })
})
