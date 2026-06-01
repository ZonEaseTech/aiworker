import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WorkbenchChat } from './chat'
import { WorkbenchConfig } from './config'
import { readWorkbenchLocator } from './locator'
import './styles.css'

/**
 * Progressive-enhancement entry for the SDK common workbench micro-app (方案 C).
 *
 * The workbench shell (markers + module sections) is static HTML so the mount
 * proofs are robust against React timing inside the micro-app sandbox. This
 * bundle hydrates the interactive surface into #aiworker-workbench-root; later
 * sub-projects render the chat composer/transcript and the live config modules
 * here. For the build foundation it records the resolved locator so consumers can
 * see the micro-app booted with the daemon-injected context.
 *
 * It renders the live chat surface (WorkbenchChat), whose submit control is a real
 * `packages/ui` (shadcn/Tailwind) Button so the mount proof can assert — via
 * computed style, not text — that the bundled Tailwind stylesheet is injected and
 * applied inside the micro-app sandbox. The stylesheet is inlined into this IIFE
 * bundle (vite-plugin-css-injected-by-js) because lib mode emits a separate CSS
 * file that the classic-script shell would not link.
 */
export function WorkbenchRoot() {
  const locator = readWorkbenchLocator(globalThis.location?.search ?? '')
  return (
    <div
      data-aiworker-workbench-ready="true"
      data-aiworker-locator={`${locator.workerId ?? ''}/${locator.workspaceId ?? ''}/${locator.sessionId ?? ''}`}
    >
      <WorkbenchConfig workerId={locator.workerId} />
      <WorkbenchChat sessionId={locator.sessionId} workspaceId={locator.workspaceId} />
    </div>
  )
}

function mount(): void {
  const host = document.querySelector('#aiworker-workbench-root')
  if (host) {
    createRoot(host).render(
      <StrictMode>
        <WorkbenchRoot />
      </StrictMode>,
    )
  }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', mount, { once: true })
else
  mount()
