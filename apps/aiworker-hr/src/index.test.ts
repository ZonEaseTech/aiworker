import type { LocalExecutor } from '@zonease/aiworker-soul-app-sdk'

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createMountedSoulAppTestRuntime,
  createStandaloneSoulAppRuntime,
  namespaceSoulAppCapabilityId,
} from '@zonease/aiworker-soul-app-sdk'
import { afterEach, describe, expect, it } from 'bun:test'

import { HR_REFERENCE_APP_BOUNDARY, hrReferenceSoulApp } from './index'

const now = () => '2026-05-13T00:25:00.000Z'

const executor: LocalExecutor = {
  async invoke(input) {
    return {
      artifacts: [{
        content: `# HR profile\n\n${input.prompt}`,
        kind: 'person-profile',
        path: `artifacts/${input.sessionId}/person-profile.md`,
        title: 'HR People Profile',
      }],
      review: {
        findings: [{ message: 'HR artifact requires human review before memory promotion.' }],
        risks: [],
        verdict: 'needs_review',
      },
      summary: 'HR reference app created one people profile artifact.',
    }
  },
}

describe('HR reference Soul App', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('declares an external package boundary and protocol handlers', async () => {
    expect(HR_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-hr')
    expect(hrReferenceSoulApp.manifest.id).toBe('aiworker-hr')
    expect(await hrReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-hr', permissions: hrReferenceSoulApp.manifest.permissions })).toHaveLength(2)
    expect((await hrReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-hr', permissions: hrReferenceSoulApp.manifest.permissions }, { capabilityId: 'candidate-screen' }))?.id).toBe('candidate-screen')
  })

  it('runs the HR app in standalone and Host-mounted smoke paths', async () => {
    const standaloneRoot = tempRoot('standalone')
    const standalone = await createStandaloneSoulAppRuntime(hrReferenceSoulApp, {
      appHome: standaloneRoot,
      availableConnectorIds: ['ats', 'calendar'],
      enabledConnectorIds: ['ats'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'hr-reference-worker',
      workerName: 'HR Reference',
    })

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-hr', 'person-profile')
    expect(standalone.snapshot().worker.soulId).toBe('aiworker-hr')
    const workspace = await standalone.runtime.createWorkspace({ name: 'Mia Chen', type: 'people-profile' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Build a people profile from reviewed evidence.',
      metadata: standalone.sessionMetadata(capabilityId),
      title: 'People profile',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Create the profile artifact.',
      metadata: standalone.sessionMetadata(capabilityId),
      sessionId: session.id,
    })
    expect(result.artifacts[0]?.metadataJson.soulAppId).toBe('aiworker-hr')
    expect(result.review?.verdict).toBe('needs_review')

    const mountedRoot = tempRoot('mounted')
    const mounted = await createMountedSoulAppTestRuntime(hrReferenceSoulApp, {
      availableConnectorIds: ['ats', 'calendar'],
      dbPath: path.join(mountedRoot, 'worker.db'),
      enabledConnectorIds: ['ats'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'mounted-hr-reference-worker',
      workerName: 'Mounted HR Reference',
      workersRoot: path.join(mountedRoot, 'workers'),
    })
    expect(mounted.catalog.apps.map(app => app.appId)).toContain('aiworker-hr')
    expect(mounted.catalog.templates.map(template => template.id)).toContain(capabilityId)
    expect(mounted.snapshot().worker.soulId).toBe('aiworker-hr')
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-hr-${label}-`))
    roots.push(root)
    return root
  }
})
