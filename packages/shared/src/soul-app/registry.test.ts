import { describe, expect, it } from 'bun:test'

import { hrSoulAppManifest } from './fixtures'
import { mountedContributionForManifest } from './registry'

describe('Soul App registry projection', () => {
  it('projects shell descriptors as app-owned mounted contribution metadata', () => {
    const app = mountedContributionForManifest({
      ...hrSoulAppManifest,
      ui: {
        ...hrSoulAppManifest.ui,
        shell: {
          primaryAction: {
            id: 'create-people-profile',
            label: 'New people profile',
            protocolAction: 'profiles.create',
            slot: 'primary',
          },
        },
      },
    })

    expect(app.shell).toMatchObject({
      primaryAction: {
        id: 'create-people-profile',
        protocolAction: 'profiles.create',
        slot: 'primary',
      },
    })
  })
})
