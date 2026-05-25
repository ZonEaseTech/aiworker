import type { LocalSession, LocalSessionEvent, LocalTurn, LocalWorkspace } from '@zonease/aiworker-shared'

import { describe, expect, it, mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  buildUniversalWorkbenchCreateSessionPayload,
  resolveUniversalWorkbenchDraftInput,
} from './client-entry'
import { createSessionTimelineViewModel, normalizeSessionEvents } from './timeline/session-view-model'
import { resolveDefaultTemplateId, UniversalWorkbenchApp } from './UniversalWorkbenchApp'

const vi = { fn: mock }

describe('UniversalWorkbenchApp', () => {
  it('server-renders selected sessions with narrow-safe workbench structure', () => {
    const workspace = workspaceFixture()
    const session: LocalSession = {
      capabilityTemplateId: 'aiworker-qa.evidence-review',
      context: '',
      createdAt: '2026-05-24T07:03:42.523Z',
      endedAt: null,
      id: 'session-selected',
      metadataJson: {},
      startedAt: '2026-05-24T07:03:42.523Z',
      status: 'active',
      title: 'Review the release evidence',
      updatedAt: '2026-05-24T07:03:42.523Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={session.id}
        sessions={[session]}
        templates={[{ id: 'aiworker-qa.evidence-review', name: 'Evidence Review' }]}
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

    expect(classForSlot(html, 'universal-workbench')).toContain('max-md:flex-col')
    expect(classForSlot(html, 'workbench-sidebar')).toContain('max-md:w-full')
    expect(html).toContain('data-slot="workbench-main"')
    expect(classForSlot(html, 'artifact-rail')).toContain('max-md:flex-none')
  })

  it('keeps long workspace and session names inside the fixed sidebar', () => {
    const longWorkspaceName = 'Workspace-' + 'Alpha'.repeat(24)
    const longSessionLabel = 'aiworker-qa.' + 'evidence-review-'.repeat(16)
    const workspace = {
      ...workspaceFixture(),
      name: longWorkspaceName,
    }
    const session: LocalSession = {
      capabilityTemplateId: longSessionLabel,
      context: '',
      createdAt: '2026-05-26T00:00:00.000Z',
      endedAt: null,
      id: 'session-long-label',
      metadataJson: {},
      startedAt: '2026-05-26T00:00:00.000Z',
      status: 'active',
      title: 'Review the release evidence',
      updatedAt: '2026-05-26T00:00:00.000Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[session]}
        templates={[{ id: longSessionLabel, name: 'Evidence Review' }]}
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

    const sidebarClass = classForSlot(html, 'workbench-sidebar')
    expectClassToken(sidebarClass, 'w-56')
    expectClassToken(sidebarClass, 'basis-56')
    expectClassToken(sidebarClass, 'max-w-56')
    expectClassToken(sidebarClass, 'max-md:w-full')
    expectClassToken(sidebarClass, 'max-md:max-w-none')
    expectClassToken(sidebarClass, 'max-md:basis-auto')
    expect(html).toContain(`title="${longWorkspaceName}"`)
    expect(html).toContain(`title="${longSessionLabel}"`)

    const itemTitleClasses = classesForSlot(html, 'item-title')
    expect(itemTitleClasses.length).toBeGreaterThanOrEqual(2)
    for (const classes of itemTitleClasses) {
      expectClassToken(classes, 'w-full')
      expectClassToken(classes, 'min-w-0')
      expectClassToken(classes, 'truncate')
    }
  })

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

  it('defaults the composer template selection to the first available capability while preserving valid choices', () => {
    const templates = [
      { id: 'aiworker-qa.evidence-review', name: 'Evidence Review' },
      { id: 'aiworker-qa.release-gate', name: 'Release Gate' },
    ]

    expect(resolveDefaultTemplateId(undefined, templates)).toBe('aiworker-qa.evidence-review')
    expect(resolveDefaultTemplateId('aiworker-qa.unknown', templates)).toBe('aiworker-qa.evidence-review')
    expect(resolveDefaultTemplateId('aiworker-qa.release-gate', templates)).toBe('aiworker-qa.release-gate')
    expect(resolveDefaultTemplateId('aiworker-qa.release-gate', [])).toBeUndefined()
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

  it('renders a failed session as recoverable without stale running status or duplicate timeout errors', () => {
    const workspace = workspaceFixture()
    const session: LocalSession = {
      capabilityTemplateId: 'aiworker-hr.person-profile',
      context: '',
      createdAt: '2026-05-24T07:03:42.523Z',
      endedAt: '2026-05-24T07:08:43.533Z',
      id: 'session-failed',
      metadataJson: {},
      startedAt: '2026-05-24T07:03:42.523Z',
      status: 'failed',
      title: 'E2E audit task',
      updatedAt: '2026-05-24T07:08:43.533Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }
    const timeoutMessage = '/Users/ben/.local/bin/claude exited with code 143: Process exceeded 300000ms and was terminated.'
    const turn: LocalTurn = {
      createdAt: '2026-05-24T07:03:42.526Z',
      error: timeoutMessage,
      id: 'turn-failed',
      input: 'Create the Claude artifact.',
      metadataJson: {},
      response: 'Claude Code exited with code 143.',
      seq: 1,
      sessionId: session.id,
      status: 'failed',
      updatedAt: '2026-05-24T07:08:43.533Z',
    }
    const events: LocalSessionEvent[] = [
      sessionEvent({ id: 366, payloadJson: { status: 'running', turnId: turn.id }, seq: 2, type: 'status', turnId: turn.id }),
      sessionEvent({ id: 369, payloadJson: { agentEvent: { kind: 'status', label: 'requesting' } }, seq: 5, type: 'status', turnId: turn.id }),
      sessionEvent({ id: 371, payloadJson: { message: timeoutMessage, turnId: turn.id }, seq: 7, type: 'error', turnId: turn.id }),
    ]

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Claude Code is ready for session turns.', label: 'Claude Code', ready: true }}
        events={events}
        selectedSessionId={session.id}
        sessions={[session]}
        templates={[{ id: 'aiworker-hr.person-profile', name: 'Person Profile' }]}
        turnInput=""
        turnSubmitting={false}
        turns={[turn]}
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

    expect(html).toContain('failed')
    expect(html).not.toContain('Session running')
    expect(html).not.toContain('Sending...')
    expect(html).not.toContain('requesting')
    expect((html.match(/Process exceeded 300000ms/g) ?? [])).toHaveLength(1)
  })

  it('filters stale non-terminal status signals from terminal turns while preserving terminal status', () => {
    const staleOnlyEvents = normalizeSessionEvents([
      sessionEvent({ id: 401, payloadJson: { agentEvent: { kind: 'status', label: 'requesting' } }, seq: 1, type: 'status', turnId: 'turn-stale' }),
    ], { parser: 'codex-cli' })
    const failedEvents = normalizeSessionEvents([
      sessionEvent({ id: 402, payloadJson: { status: 'failed', turnId: 'turn-failed' }, seq: 1, type: 'status', turnId: 'turn-failed' }),
    ], { parser: 'codex-cli' })
    const succeededEvents = normalizeSessionEvents([
      sessionEvent({ id: 403, payloadJson: { status: 'succeeded', turnId: 'turn-succeeded' }, seq: 1, type: 'status', turnId: 'turn-succeeded' }),
    ], { parser: 'codex-cli' })

    const viewModel = createSessionTimelineViewModel({
      events: [...staleOnlyEvents, ...failedEvents, ...succeededEvents],
      turns: [
        terminalTurn({ id: 'turn-stale', status: 'failed' }),
        terminalTurn({ id: 'turn-failed', status: 'failed' }),
        terminalTurn({ id: 'turn-succeeded', status: 'succeeded' }),
      ],
    })

    expect(viewModel.turns.find(item => item.turn.id === 'turn-stale')?.events).toEqual([])
    expect(viewModel.turns.find(item => item.turn.id === 'turn-failed')?.events).toMatchObject([
      { kind: 'signal', signalKind: 'status', status: 'failed' },
    ])
    expect(viewModel.turns.find(item => item.turn.id === 'turn-succeeded')?.events).toMatchObject([
      { kind: 'signal', signalKind: 'status', status: 'succeeded' },
    ])
  })

  it('filters stale running activity from succeeded terminal turns while preserving succeeded status', () => {
    const events = normalizeSessionEvents([
      sessionEvent({
        id: 404,
        payloadJson: {
          agentEvent: {
            id: 'tool-echo',
            input: { command: 'echo done' },
            kind: 'tool_use',
            name: 'shell',
          },
        },
        seq: 1,
        type: 'status',
        turnId: 'turn-succeeded',
      }),
      sessionEvent({ id: 405, payloadJson: { status: 'running', turnId: 'turn-succeeded' }, seq: 2, type: 'status', turnId: 'turn-succeeded' }),
      sessionEvent({ id: 406, payloadJson: { status: 'succeeded', turnId: 'turn-succeeded' }, seq: 3, type: 'status', turnId: 'turn-succeeded' }),
    ], { parser: 'codex-cli' })

    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [terminalTurn({ id: 'turn-succeeded', status: 'succeeded' })],
    })

    expect(viewModel.turns.find(item => item.turn.id === 'turn-succeeded')?.events).toEqual([
      expect.objectContaining({ kind: 'signal', signalKind: 'status', status: 'succeeded' }),
    ])
  })

  it('preserves running activity and status signals for queued turns', () => {
    const events = normalizeSessionEvents([
      sessionEvent({
        id: 407,
        payloadJson: {
          agentEvent: {
            id: 'tool-queued',
            input: { command: 'echo queued' },
            kind: 'tool_use',
            name: 'shell',
          },
        },
        seq: 1,
        type: 'status',
        turnId: 'turn-queued',
      }),
      sessionEvent({ id: 408, payloadJson: { status: 'running', turnId: 'turn-queued' }, seq: 2, type: 'status', turnId: 'turn-queued' }),
    ], { parser: 'codex-cli' })

    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [terminalTurn({ id: 'turn-queued', status: 'queued' })],
    })

    expect(viewModel.turns.find(item => item.turn.id === 'turn-queued')?.events).toEqual([
      expect.objectContaining({ kind: 'activity', status: 'running' }),
      expect.objectContaining({ kind: 'signal', signalKind: 'status', status: 'running' }),
    ])
  })
})

function classForSlot(html: string, slot: string): string {
  const match = classesForSlot(html, slot)[0]
  expect(match).toBeDefined()
  return match ?? ''
}

function classesForSlot(html: string, slot: string): string[] {
  const escapedSlot = escapeRegExp(slot)
  return Array.from(html.matchAll(new RegExp(`<[^>]*\\bdata-slot="${escapedSlot}"[^>]*>`, 'g')))
    .map(match => match[0].match(/\bclass="([^"]*)"/)?.[1] ?? '')
}

function expectClassToken(classes: string, token: string): void {
  expect(classTokens(classes)).toContain(token)
}

function classTokens(classes: string): string[] {
  return classes.split(/\s+/).filter(Boolean)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function workspaceFixture(): LocalWorkspace {
  return {
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
}

function sessionEvent(input: {
  id: number
  payloadJson: Record<string, unknown>
  seq: number
  type: LocalSessionEvent['type']
  turnId: string | null
}): LocalSessionEvent {
  return {
    createdAt: '2026-05-24T07:08:43.534Z',
    id: input.id,
    invocationId: 'invocation-1',
    payloadJson: input.payloadJson,
    seq: input.seq,
    sessionId: 'session-failed',
    turnId: input.turnId,
    type: input.type,
  }
}

function terminalTurn(input: {
  id: string
  status: LocalTurn['status']
}): LocalTurn {
  return {
    createdAt: '2026-05-24T07:03:42.526Z',
    error: null,
    id: input.id,
    input: 'Run a terminal turn.',
    metadataJson: {},
    response: null,
    seq: input.id === 'turn-stale' ? 1 : input.id === 'turn-failed' ? 2 : 3,
    sessionId: 'session-failed',
    status: input.status,
    updatedAt: '2026-05-24T07:08:43.533Z',
  }
}
