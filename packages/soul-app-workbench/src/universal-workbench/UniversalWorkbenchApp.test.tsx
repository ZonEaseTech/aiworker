import type { LocalWorkspace } from '@zonease/aiworker-shared'

import { describe, expect, it, mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  buildUniversalWorkbenchCreateSessionPayload,
  resolveUniversalWorkbenchDraftInput,
} from './client-entry'
import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

const vi = { fn: mock }

describe('UniversalWorkbenchApp', () => {
  it('renders the managed session composer for a selected workspace without raw new-session form markup', () => {
    const workspace: LocalWorkspace = {
      createdAt: '2026-05-23T00:00:00.000Z',
      id: 'workspace-1',
      metadataJson: {},
      name: 'Universal Workspace',
      rootPath: '/tmp/aiworker/workspace-1',
      sourcePointersJson: [],
      status: 'active',
      type: 'workspace',
      updatedAt: '2026-05-23T00:00:00.000Z',
      workerId: 'worker-1',
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[]}
        templates={[]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn(async () => {})}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-slot="session-composer"')
    expect(html).toContain('What do you want to work on?')
    expect(html).not.toContain('class="flex w-full max-w-xl gap-2"')
    expect(html).not.toContain('type="button">Start</button>')
  })

  it('renders the capability template selector in the new session composer', () => {
    const workspace: LocalWorkspace = {
      createdAt: '2026-05-23T00:00:00.000Z',
      id: 'workspace-1',
      metadataJson: {},
      name: 'Universal Workspace',
      rootPath: '/tmp/aiworker/workspace-1',
      sourcePointersJson: [],
      status: 'active',
      type: 'workspace',
      updatedAt: '2026-05-23T00:00:00.000Z',
      workerId: 'worker-1',
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[]}
        templates={[
          {
            description: 'Collect evidence before review.',
            id: 'aiworker-qa.evidence-review',
            name: 'Evidence Review',
            outputKind: 'review-pack',
          },
          {
            description: 'Prepare release decision.',
            id: 'aiworker-qa.release-gate',
            name: 'Release Gate',
            outputKind: 'release-verdict',
          },
        ]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn(async () => {})}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('Capability/template')
  })

  it('maps material-only create and continue drafts to a generic fallback input', () => {
    const material = {
      content: 'source material',
      encoding: 'utf8' as const,
      mimeType: 'text/plain',
      name: 'notes.txt',
      size: 15,
    }

    expect(resolveUniversalWorkbenchDraftInput({ input: '  Follow the notes  ', materials: [material] })).toBe('Follow the notes')
    expect(resolveUniversalWorkbenchDraftInput({ input: '', materials: [material] })).toBe('Use the attached source materials.')
    expect(resolveUniversalWorkbenchDraftInput({ input: '   ', materials: [] })).toBe('')
  })

  it('builds mounted create-session payloads only from an explicit template selection', () => {
    const material = {
      content: 'release notes',
      encoding: 'utf8' as const,
      mimeType: 'text/plain',
      name: 'release.txt',
      size: 13,
    }
    const templates = [
      { id: 'aiworker-qa.evidence-review', name: 'Evidence Review' },
      { id: 'aiworker-qa.release-gate', name: 'Release Gate' },
    ]

    expect(buildUniversalWorkbenchCreateSessionPayload({
      input: '  Check this release  ',
      materials: [material],
      mentions: [{ id: 'release-checklist', kind: 'skill', label: 'Release checklist' }],
      selectedTemplateId: 'aiworker-qa.release-gate',
    }, templates)).toEqual({
      capabilityTemplateId: 'aiworker-qa.release-gate',
      input: 'Check this release',
      metadata: {
        materials: [material],
        mentions: [{ id: 'release-checklist', kind: 'skill', label: 'Release checklist' }],
      },
      title: 'Check this release',
    })

    expect(buildUniversalWorkbenchCreateSessionPayload({
      input: 'Check this release',
      materials: [],
      mentions: [],
    }, templates)).toBeNull()
    expect(buildUniversalWorkbenchCreateSessionPayload({
      input: 'Check this release',
      materials: [],
      mentions: [],
      selectedTemplateId: 'aiworker-qa.unknown',
    }, templates)).toBeNull()
  })
})
