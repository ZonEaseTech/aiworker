import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HostControlPlane, WorkerDistributionSummary } from './app'

describe('host-web distribution control plane', () => {
  it('summarizes assignment and readiness without rendering a micro-app', () => {
    const { container } = render(
      <WorkerDistributionSummary
        assignment={{ soulVersion: 'freeform@1.0.0', connectors: 2, permissions: 3 }}
        worker={{ id: 'worker-1', ready: true, workbenchUrl: '/' }}
      />,
    )
    expect(container.querySelector('micro-app')).toBeNull()
    expect(container.querySelector('[data-slot="host-worker-distribution"]')).not.toBeNull()
    expect(container.textContent).toContain('freeform@1.0.0')
    expect(container.textContent).toContain('Ready')
  })

  it('shows a Worker-owned Workbench destination instead of an embedded surface', () => {
    const { container } = render(<HostControlPlane />)
    expect(container.querySelector('micro-app')).toBeNull()
    const destination = container.querySelector('[data-slot="employee-workbench-link"]')
    expect(destination?.getAttribute('href')).toBe('/')
    expect(container.textContent).toContain('Open Worker')
  })

  it('uses a host-resolved Worker-owned Workbench URL when supplied', () => {
    const { container } = render(<HostControlPlane workbenchUrl="https://worker.local/" />)
    const destination = container.querySelector('[data-slot="employee-workbench-link"]')
    expect(destination?.getAttribute('href')).toBe('https://worker.local/')
  })
})
