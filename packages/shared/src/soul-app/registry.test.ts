import { describe, expect, it } from 'bun:test'

import { hrSoulAppManifest } from './fixtures'
import { mountedContributionForManifest } from './registry'

describe('Soul App registry projection', () => {
  it('projects workbench descriptors and workspace context as app-owned mounted contribution metadata', () => {
    const app = mountedContributionForManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        workbench: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            role: 'primary',
          },
        },
        workspaceContext: {
          terminal: {
            cwd: { source: 'host-workspace-root' },
            id: 'hr-workspace-terminal',
            label: 'People workspace terminal',
          },
        },
      },
    })

    expect(app.workbench).toMatchObject({
      primaryAction: {
        id: 'create-people-profile',
        protocolAction: 'profiles.create',
        role: 'primary',
      },
    })
    expect(app.workspaceContext).toMatchObject({
      terminal: {
        cwd: { source: 'host-workspace-root' },
        id: 'hr-workspace-terminal',
      },
    })
    expect(app.microAppSurfaceIds).toEqual(['universal-workbench', 'hr-home', 'hr-people-widget'])
    expect(app).not.toHaveProperty('frameSurfaceIds')
  })
})
