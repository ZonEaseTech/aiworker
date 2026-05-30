import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MountWorkerConfig } from './app'

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
})
