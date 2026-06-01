import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { readWorkbenchLocator } from './locator'

const MODULES = [
  { id: 'worker-configuration-summary', title: 'Worker configuration summary' },
  { id: 'engine-target-readiness', title: 'Engine target readiness' },
  { id: 'skills-overlay-summary', title: 'Skills overlay summary' },
  { id: 'mcp-overlay-summary', title: 'MCP overlay summary' },
  { id: 'entry-workspace-files-summary', title: 'Entry workspace files summary' },
  { id: 'session-controls', title: 'Session controls' },
  { id: 'bridge-event-stream', title: 'Bridge event refs' },
  { id: 'projection-receipt-status', title: 'Projection receipt status' },
  { id: 'archive-controls', title: 'Archive controls' },
] as const

/**
 * SDK common workbench micro-app (方案 C). Mounted by the Worker/Host web shell
 * via micro-app `router-mode="search"`; the daemon injects the locator into the
 * URL query. This shell renders the module sections (filled out by later
 * sub-projects: chat, config, lifecycle). It preserves the markers the Freeform
 * browser proof asserts so the static→micro-app migration keeps the proof green.
 */
export function CommonWorkbench() {
  const locator = readWorkbenchLocator(globalThis.location?.search ?? '')
  return (
    <main
      data-aiworker-common-workbench="true"
      data-aiworker-bridge-event-refs="engine-invocations,engine-invocation-events"
      data-aiworker-locator={`${locator.workerId ?? ''}/${locator.workspaceId ?? ''}/${locator.sessionId ?? ''}`}
    >
      <h1>AIWorker Common Workbench</h1>
      {MODULES.map(module => (
        <section key={module.id} data-module={module.id}>
          <h2>{module.title}</h2>
          {module.id === 'bridge-event-stream'
            ? <p>engine_invocations / engine invocation events</p>
            : null}
        </section>
      ))}
    </main>
  )
}

const host = document.querySelector('#aiworker-common-workbench')
if (host) {
  createRoot(host).render(
    <StrictMode>
      <CommonWorkbench />
    </StrictMode>,
  )
}
