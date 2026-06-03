import type { LocalEngineInvocation, LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type { ChatComposerLabels } from './chat-composer'

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@zonease/aiworker-ui/components/empty'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { fetchSessionDetail } from '../../../features/local-workspace/api/session-invocations'
import { ChatComposer } from './chat-composer'
import { ChatTranscript } from './chat-transcript'

export interface ChatSurfaceProps {
  composerLabels: ChatComposerLabels
  initialActive?: { invocationId: string, text: string } | null
  sessionId: string
  transcriptAriaLabel: string
}

interface SessionTranscriptSnapshot {
  events: LocalSessionEvent[]
  invocations: LocalEngineInvocation[]
  status: 'error' | 'loaded' | 'loading'
}

const ERROR_TRANSCRIPT_SNAPSHOT: SessionTranscriptSnapshot = { events: [], invocations: [], status: 'error' }
const LOADING_TRANSCRIPT_SNAPSHOT: SessionTranscriptSnapshot = { events: [], invocations: [], status: 'loading' }

type SessionTranscriptSnapshotAction
  = | { type: 'reset' }
    | { snapshot: SessionTranscriptSnapshot, type: 'loaded' }

/**
 * Employee chat surface: composes the transcript view above the composer;
 * submitting a message points the live transcript at the new invocation and
 * echoes the submitted text as a leading `user-message` turn (the engine
 * transcript stream carries no user turn — see `bridge-event-mapper`).
 *
 * State here is the currently-followed invocation plus its submitted text.
 * Switching sessions must reset it — callers render this keyed by `sessionId`
 * (`<ChatSurface key={sessionId} ... />`) so a session change remounts with a
 * fresh follow state and no stale transcript leaks across sessions.
 *
 * The Worker owns and renders the session chat directly: worker-studio mounts
 * this surface on the session route (the Soul provides no UI; there is no
 * mounted workbench). This is the live employee chat, not a reusable stub.
 */
export function ChatSurface({ composerLabels, initialActive = null, sessionId, transcriptAriaLabel }: ChatSurfaceProps) {
  const [active, setActive] = useState<{ invocationId: string, text: string } | null>(initialActive)
  const [snapshot, dispatchSnapshot] = useReducer(sessionTranscriptSnapshotReducer, LOADING_TRANSCRIPT_SNAPSHOT)

  useEffect(() => {
    let cancelled = false
    dispatchSnapshot({ type: 'reset' })
    fetchSessionDetail(sessionId)
      .then((detail) => {
        if (cancelled)
          return
        dispatchSnapshot({
          snapshot: {
            events: Array.isArray(detail.events) ? detail.events : [],
            invocations: Array.isArray(detail.invocations) ? detail.invocations : [],
            status: 'loaded',
          },
          type: 'loaded',
        })
      })
      .catch(() => {
        if (!cancelled)
          dispatchSnapshot({ snapshot: ERROR_TRANSCRIPT_SNAPSHOT, type: 'loaded' })
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const latestInvocation = useMemo(
    () => latestInvocationForSession(snapshot.invocations),
    [snapshot.invocations],
  )
  const activeInvocationId = active?.invocationId ?? latestInvocation?.id ?? null
  const activeInitialInvocation = latestInvocation?.id === activeInvocationId ? latestInvocation : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden" data-chat-surface="true">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <ChatTranscript
          ariaLabel={transcriptAriaLabel}
          emptyState={snapshot.status === 'error' ? <TranscriptRestoreErrorState /> : undefined}
          initialInvocation={activeInitialInvocation}
          invocationId={activeInvocationId}
          loading={snapshot.status === 'loading'}
          sessionEvents={snapshot.events}
          sessionInvocations={snapshot.invocations}
          sessionId={sessionId}
          userMessage={active}
        />
      </div>
      <ChatComposer
        labels={composerLabels}
        onSubmitted={setActive}
        sessionId={sessionId}
      />
    </div>
  )
}

function latestInvocationForSession(invocations: LocalEngineInvocation[]): LocalEngineInvocation | null {
  return invocations.slice().sort((left, right) => left.seq - right.seq).at(-1) ?? null
}

function sessionTranscriptSnapshotReducer(
  _state: SessionTranscriptSnapshot,
  action: SessionTranscriptSnapshotAction,
): SessionTranscriptSnapshot {
  if (action.type === 'loaded')
    return action.snapshot
  return LOADING_TRANSCRIPT_SNAPSHOT
}

function TranscriptRestoreErrorState() {
  return (
    <Empty
      aria-label="Transcript history unavailable"
      className="min-h-48 border-0 bg-transparent"
      data-transcript-slot="chat-thread-error"
      role="status"
    >
      <EmptyHeader>
        <EmptyTitle>Transcript history unavailable</EmptyTitle>
        <EmptyDescription>Local history could not be restored.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
