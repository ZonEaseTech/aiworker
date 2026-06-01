import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HostControlPlane, MountWorkerConfig } from './app'

describe('host-web management mount', () => {
  it('mounts the worker configuration micro-app via router-mode="search"', () => {
    const { container } = render(
      <MountWorkerConfig entry="/api/mount/workbench" name="worker-config" />,
    )
    const microApp = container.querySelector('micro-app')
    expect(microApp).not.toBeNull()
    expect(microApp?.getAttribute('router-mode')).toBe('search')
    expect(microApp?.getAttribute('url')).toBe('/api/mount/workbench')
    expect(microApp?.getAttribute('name')).toBe('worker-config')
  })

  it('frames the worker configuration micro-app in the control-plane shell at the canonical entry', () => {
    const { container } = render(<HostControlPlane />)
    const mount = container.querySelector('[data-slot="host-management-mount"]')
    expect(mount).not.toBeNull()
    const microApp = container.querySelector('[data-slot="worker-config-micro-app"]')
    expect(microApp?.getAttribute('router-mode')).toBe('search')
    expect(microApp?.getAttribute('url')).toBe('/api/mount/workbench')
  })

  it('frames a host-daemon-resolved per-worker config entry when supplied', () => {
    const { container } = render(<HostControlPlane configMicroAppEntry="https://worker.local/api/mount/workbench" />)
    const microApp = container.querySelector('[data-slot="worker-config-micro-app"]')
    expect(microApp?.getAttribute('url')).toBe('https://worker.local/api/mount/workbench')
  })
})
