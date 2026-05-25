import type { LocalSession, LocalSessionEvent } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'

import {
  applySessionTurnStreamFrame,
  applyMountedDocumentTheme,
  consumeSessionTurnStream,
  isTerminalSessionStatus,
  loadSessionEvents,
  mergeSessionEvents,
  mountedSessionContextKey,
  recoverSessionTurnStreamFailure,
  resolveStreamRecoverySessionId,
  shouldApplyMountedSessionDetail,
  shouldRefreshRecoveredSession,
} from './client-entry'

describe('universal workbench mounted session events', () => {
  it('syncs the mounted document theme when host data changes after mount', () => {
    const classes = new Set<string>(['dark'])
    const target = {
      documentElement: {
        classList: {
          toggle: (name: string, force?: boolean) => {
            if (force)
              classes.add(name)
            else
              classes.delete(name)
          },
        },
        style: {
          colorScheme: 'dark',
        },
      },
    }

    expect(applyMountedDocumentTheme('system', target)).toBe('light')
    expect(classes.has('dark')).toBe(false)
    expect(target.documentElement.style.colorScheme).toBe('light')

    expect(applyMountedDocumentTheme('dark', target)).toBe('dark')
    expect(classes.has('dark')).toBe(true)
    expect(target.documentElement.style.colorScheme).toBe('dark')
  })

  it('loads incremental session events through the mounted API and merges them without duplicate replay', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls: string[] = []
    globalThis.fetch = (async (input) => {
      requestedUrls.push(String(input))
      return Response.json({
        events: [
          sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
          sessionEvent({ id: 3, seq: 3, type: 'tool' }),
        ],
      })
    }) as typeof fetch

    try {
      const nextEvents = await loadSessionEvents('/mounted', 'worker-1', 'session-1', 1)

      expect(requestedUrls).toEqual(['/mounted/api/sessions/session-1/events?workerId=worker-1&after=1'])
      expect(mergeSessionEvents([
        sessionEvent({ id: 1, seq: 1, type: 'status' }),
        sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
      ], nextEvents)).toEqual([
        sessionEvent({ id: 1, seq: 1, type: 'status' }),
        sessionEvent({ id: 2, seq: 2, type: 'assistant_delta' }),
        sessionEvent({ id: 3, seq: 3, type: 'tool' }),
      ])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('detects terminal session statuses used to stop mounted polling', () => {
    expect(isTerminalSessionStatus('failed')).toBe(true)
    expect(isTerminalSessionStatus('succeeded')).toBe(true)
    expect(isTerminalSessionStatus('cancelled')).toBe(true)
    expect(isTerminalSessionStatus('completed')).toBe(true)
    expect(isTerminalSessionStatus('active')).toBe(false)
    expect(isTerminalSessionStatus('running')).toBe(false)
    expect(isTerminalSessionStatus(null)).toBe(false)
  })

  it('keeps the streamed session id available when the session stream fails after a session frame', async () => {
    const streamedSessionIds: string[] = []
    const session = sessionFixture({ id: 'session-created' })
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (streamedSessionIds.length === 0) {
          controller.enqueue(new TextEncoder().encode(`event: session\ndata: ${JSON.stringify(session)}\n\n`))
          return
        }
        controller.error(new Error('stream failed'))
      },
    })
    const response = new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    })

    await expect(consumeSessionTurnStream(response, (frame) => {
      applySessionTurnStreamFrame(frame, {
        onEvents: () => {},
        onSession: (nextSession) => {
          streamedSessionIds.push(nextSession.id)
        },
        onTurn: () => {},
      })
    })).rejects.toThrow('stream failed')

    expect(streamedSessionIds.at(-1)).toBe('session-created')
    expect(resolveStreamRecoverySessionId(streamedSessionIds.at(-1) ?? null, null)).toBe('session-created')
  })

  it('falls back to the selected session id when no session frame was streamed', () => {
    expect(resolveStreamRecoverySessionId(null, 'session-selected')).toBe('session-selected')
    expect(resolveStreamRecoverySessionId(null, null)).toBeNull()
  })

  it('refreshes recovered sessions only when they still match the latest selected session', () => {
    expect(shouldRefreshRecoveredSession(null, null)).toBe(false)
    expect(shouldRefreshRecoveredSession('session-recovered', null)).toBe(true)
    expect(shouldRefreshRecoveredSession('session-recovered', 'session-recovered')).toBe(true)
    expect(shouldRefreshRecoveredSession('session-recovered', 'session-other')).toBe(false)
  })

  it('rejects stale mounted session detail when locator context changes', () => {
    const firstContext = mountedSessionContextKey({
      routePrefix: '/mounted',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })
    const nextWorkspaceContext = mountedSessionContextKey({
      routePrefix: '/mounted',
      sessionId: 'session-1',
      workerId: 'worker-1',
      workspaceId: 'workspace-2',
    })

    expect(firstContext).not.toBe(nextWorkspaceContext)
    expect(shouldApplyMountedSessionDetail(firstContext, firstContext)).toBe(true)
    expect(shouldApplyMountedSessionDetail(firstContext, nextWorkspaceContext)).toBe(false)
    expect(shouldApplyMountedSessionDetail(null, nextWorkspaceContext)).toBe(false)
  })

  it('records stream errors and refreshes the fallback session when session creation fails before a response exists', async () => {
    const appendedEvents: LocalSessionEvent[][] = []
    const refreshedSessionIds: Array<string | null> = []

    await recoverSessionTurnStreamFailure(
      new Error('proxy unavailable'),
      null,
      'session-selected',
      events => appendedEvents.push(events),
      async (sessionId) => {
        refreshedSessionIds.push(sessionId ?? null)
      },
    )

    expect(refreshedSessionIds).toEqual(['session-selected'])
    expect(appendedEvents).toHaveLength(1)
    expect(appendedEvents[0]?.[0]?.type).toBe('error')
    expect(appendedEvents[0]?.[0]?.sessionId).toBe('universal-workbench-stream')
    expect(appendedEvents[0]?.[0]?.payloadJson).toMatchObject({
      message: 'proxy unavailable',
      source: 'universal-workbench-stream',
    })
  })
})

function sessionFixture(input: Partial<LocalSession> = {}): LocalSession {
  return {
    capabilityTemplateId: 'template-1',
    context: '',
    createdAt: '2026-05-23T00:00:00.000Z',
    endedAt: null,
    id: 'session-1',
    metadataJson: {},
    startedAt: '2026-05-23T00:00:00.000Z',
    status: 'active',
    title: 'Session',
    updatedAt: '2026-05-23T00:00:00.000Z',
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
    ...input,
  }
}

function sessionEvent(input: {
  id: number
  seq: number
  type: LocalSessionEvent['type']
}): LocalSessionEvent {
  return {
    createdAt: '2026-05-23T00:00:00.000Z',
    id: input.id,
    invocationId: null,
    payloadJson: {},
    seq: input.seq,
    sessionId: 'session-1',
    turnId: null,
    type: input.type,
  }
}
