import type { AdminBootstrapStatus } from '@/lib/admin-remediation'

import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'

import { adminConsoleData } from '@/lib/admin-data'
import { AdminDataContext } from '@/lib/admin-data-context'
import { ProvisioningPage } from './provisioning-page'
// DOM + act tests for the /provisioning compat shell.
// The action-driven flow now lives in the cockpit (dashboard + row action + drawer);
// this page is only a read-only deep-link detail shell that must survive live data
// arriving asynchronously.
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
    async createMetadata<T>() {
      return undefined as T
    },
    data: adminConsoleData,
    decideApproval: async () => {},
    isLive: false,
    loadError: null,
    async loadSoulCatalog() {
      return []
    },
    async pairAssignment() {
      return undefined
    },
    async provisionAssignment() {
      return undefined
    },
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

describe('provisioning compat page (DOM + act)', () => {
  test('param ?assignment=asn-cara-acp renders cara detail on mount', async () => {
    const { text, unmount } = mountWithControllableCtx(
      '/provisioning?assignment=asn-cara-acp',
      makeCtx(),
    )
    await act(async () => {})
    expect(text()).toContain('cara@example.com')
    expect(text()).not.toContain('alice@example.com')
    unmount()
  })

  test('no param guides back to the cockpit instead of picking an assignment', async () => {
    const { text, unmount } = mountWithControllableCtx('/provisioning', makeCtx())
    await act(async () => {})
    expect(text()).toContain('去操作台开通')
    expect(text()).not.toContain('alice@example.com')
    unmount()
  })

  test('data arriving after mount resolves the requested assignment once it is in the snapshot', async () => {
    // Simulate live first render: control-plane not yet responded, assignments empty.
    const emptyCtx = makeCtx({ data: { ...adminConsoleData, assignments: [] } })
    const { text, setCtx, unmount } = mountWithControllableCtx(
      '/provisioning?assignment=asn-cara-acp',
      emptyCtx,
    )
    await act(async () => {})

    // Before data arrives: cara not resolvable.
    expect(text()).not.toContain('cara@example.com')

    // Data arrives (context value updates, same React tree stays mounted).
    await act(async () => {
      setCtx(makeCtx())
    })

    expect(text()).toContain('cara@example.com')
    expect(text()).not.toContain('alice@example.com')
    unmount()
  })
})
