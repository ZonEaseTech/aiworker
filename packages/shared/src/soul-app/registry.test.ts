import { describe, expect, it } from 'bun:test'

import { hrSoulAppManifest } from './fixtures'
import { mountedContributionForManifest, projectSoulAppCapabilityTemplate } from './registry'

describe('Soul App registry projection', () => {
  it('projects capability template from manifest refs without Host-authored prompt/rubric text', () => {
    const capability = hrSoulAppManifest.capabilities[0]!
    const tpl = projectSoulAppCapabilityTemplate(hrSoulAppManifest, capability)
    expect(tpl.promptRef).toBe(capability.promptRef)
    expect(tpl.reviewRubricRef).toBe(capability.reviewRubricRef ?? null)
    expect((tpl as Record<string, unknown>).prompt).toBeUndefined()
    expect((tpl as Record<string, unknown>).reviewRubric).toBeUndefined()
  })

  it('projects capability template with null reviewRubricRef when capability has none', () => {
    const capability = { ...hrSoulAppManifest.capabilities[0]!, reviewRubricRef: undefined }
    const tpl = projectSoulAppCapabilityTemplate(hrSoulAppManifest, capability)
    expect(tpl.reviewRubricRef).toBeNull()
    expect((tpl as Record<string, unknown>).reviewRubric).toBeUndefined()
  })

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
