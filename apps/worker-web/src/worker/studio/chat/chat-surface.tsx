import type { LocalEngineInvocation, LocalSession, LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type { ReactNode } from 'react'
import type { ChatComposerLabels } from './chat-composer'
import type { ChatTranscriptLabels, TranscriptTurnActionLabels } from './chat-transcript'

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@zonease/aiworker-ui/components/empty'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { cancelEngineInvocation, fetchSessionDetail, submitSessionInvocation } from '../../../features/local-workspace/api/session-invocations'
import { ChatComposer } from './chat-composer'
import { ChatTranscript } from './chat-transcript'

export interface ChatSurfaceProps {
  chatLabels?: ChatTranscriptLabels
  composerDisabled?: boolean
  composerDisabledReason?: ReactNode
  composerLabels: ChatComposerLabels
  initialActive?: { invocationId: string, text: string } | null
  onSessionUpdated?: (session: LocalSession) => void
  sessionId: string
  transcriptAriaLabel: string
  turnActionLabels?: TranscriptTurnActionLabels
}

interface SessionTranscriptSnapshot {
  events: LocalSessionEvent[]
  invocations: LocalEngineInvocation[]
  status: 'error' | 'loaded' | 'loading'
}

interface ActiveInvocationFollow {
  invocationId: string
  status: LocalEngineInvocation['status']
  text: string
}

interface ObservedInvocationStatus {
  id: string
  status: LocalEngineInvocation['status']
}

type ObservedInvocationStatusAction
  = | { type: 'reset' }
    | { invocation: ObservedInvocationStatus, type: 'set' }

const ERROR_TRANSCRIPT_SNAPSHOT: SessionTranscriptSnapshot = { events: [], invocations: [], status: 'error' }
const LOADING_TRANSCRIPT_SNAPSHOT: SessionTranscriptSnapshot = { events: [], invocations: [], status: 'loading' }
const TERMINAL_INVOCATION_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])

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
export function ChatSurface({ chatLabels, composerDisabled = false, composerDisabledReason, composerLabels, initialActive = null, onSessionUpdated, sessionId, transcriptAriaLabel, turnActionLabels }: ChatSurfaceProps) {
  const [active, setActive] = useState<ActiveInvocationFollow | null>(
    initialActive ? { ...initialActive, status: 'running' } : null,
  )
  const [observedInvocation, dispatchObservedInvocation] = useReducer(observedInvocationStatusReducer, null)
  const [composerFocusRequestToken, setComposerFocusRequestToken] = useState<number | undefined>(undefined)
  const [snapshot, dispatchSnapshot] = useReducer(sessionTranscriptSnapshotReducer, LOADING_TRANSCRIPT_SNAPSHOT)
  const composerFooterRef = useRef<HTMLDivElement | null>(null)
  const refreshedTerminalInvocationsRef = useRef<Set<string>>(new Set())
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const transcriptShouldStickToLatestRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    refreshedTerminalInvocationsRef.current = new Set()
    dispatchSnapshot({ type: 'reset' })
    dispatchObservedInvocation({ type: 'reset' })
    fetchSessionDetail(sessionId)
      .then((detail) => {
        if (cancelled)
          return
        onSessionUpdated?.(detail.session)
        dispatchSnapshot({ snapshot: sessionTranscriptSnapshotFromDetail(detail), type: 'loaded' })
      })
      .catch(() => {
        if (!cancelled)
          dispatchSnapshot({ snapshot: ERROR_TRANSCRIPT_SNAPSHOT, type: 'loaded' })
      })
    return () => {
      cancelled = true
    }
  }, [onSessionUpdated, sessionId])

  const latestInvocation = useMemo(
    () => latestInvocationForSession(snapshot.invocations),
    [snapshot.invocations],
  )
  const activeInvocationId = active?.invocationId ?? latestInvocation?.id ?? null
  const activeInitialInvocation = active?.invocationId === activeInvocationId
    ? { id: active.invocationId, status: active.status }
    : latestInvocation?.id === activeInvocationId
      ? latestInvocation
      : null
  const activeInvocationStatus = observedInvocation?.id === activeInvocationId
    ? observedInvocation.status
    : active?.status ?? latestInvocation?.status
  const composerStatus = composerStatusForInvocation(activeInvocationStatus)
  const hasConversation = activeInvocationId !== null || snapshot.events.length > 0 || snapshot.invocations.length > 0
  const handleInvocationStatusChange = useCallback((invocation: Pick<LocalEngineInvocation, 'id' | 'status'>) => {
    dispatchObservedInvocation({ invocation: { id: invocation.id, status: invocation.status }, type: 'set' })
    setActive(current => current?.invocationId === invocation.id
      ? activeInvocationWithStatus(current, invocation.status)
      : current)
    if (
      active?.invocationId !== invocation.id
      || !TERMINAL_INVOCATION_STATUSES.has(invocation.status)
      || refreshedTerminalInvocationsRef.current.has(invocation.id)
    ) {
      return
    }

    refreshedTerminalInvocationsRef.current.add(invocation.id)
    void fetchSessionDetail(sessionId)
      .then((detail) => {
        onSessionUpdated?.(detail.session)
        dispatchSnapshot({ snapshot: sessionTranscriptSnapshotFromDetail(detail), type: 'loaded' })
      })
      .catch(() => undefined)
  }, [active?.invocationId, onSessionUpdated, sessionId])

  const handleRetry = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length === 0)
      return
    const result = await submitSessionInvocation(sessionId, { input: trimmed, waitForCompletion: false })
    onSessionUpdated?.(result.session)
    setActive({ invocationId: result.invocation.id, status: result.invocation.status, text: trimmed })
    dispatchObservedInvocation({ invocation: { id: result.invocation.id, status: result.invocation.status }, type: 'set' })
    setComposerFocusRequestToken(token => (token ?? 0) + 1)
  }, [onSessionUpdated, sessionId])

  useLayoutEffect(() => {
    if (!hasConversation || snapshot.status === 'loading')
      return
    scrollTranscriptToLatest(transcriptScrollRef.current)
    transcriptShouldStickToLatestRef.current = true
  }, [active?.invocationId, active?.text, hasConversation, snapshot.events.length, snapshot.invocations.length, snapshot.status])

  useEffect(() => {
    const scrollContainer = transcriptScrollRef.current
    if (!hasConversation || !scrollContainer)
      return undefined

    const handleScroll = () => {
      transcriptShouldStickToLatestRef.current = isTranscriptNearLatest(scrollContainer)
    }
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [hasConversation])

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      routePlainKeyToComposer(event, surfaceRef.current)
    }

    document.addEventListener('keydown', handleDocumentKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, { capture: true })
  }, [])

  useEffect(() => {
    const scrollContainer = transcriptScrollRef.current
    if (!hasConversation || !scrollContainer || typeof MutationObserver === 'undefined')
      return undefined

    const observer = new MutationObserver(() => {
      if (transcriptShouldStickToLatestRef.current)
        scrollTranscriptToLatest(scrollContainer)
    })
    observer.observe(scrollContainer, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [hasConversation])

  useLayoutEffect(() => {
    const scrollContainer = transcriptScrollRef.current
    const composerFooter = composerFooterRef.current
    if (!hasConversation || !scrollContainer || !composerFooter)
      return undefined

    const updateComposerReserve = () => {
      const height = Math.ceil(composerFooter.getBoundingClientRect().height)
      scrollContainer.style.setProperty('--chat-scroll-padding-bottom', `${height + 16}px`)
    }

    updateComposerReserve()
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        scrollContainer.style.removeProperty('--chat-scroll-padding-bottom')
      }
    }

    const observer = new ResizeObserver(updateComposerReserve)
    observer.observe(composerFooter)
    return () => {
      observer.disconnect()
      scrollContainer.style.removeProperty('--chat-scroll-padding-bottom')
    }
  }, [hasConversation])

  const transcript = (
    <ChatTranscript
      ariaLabel={transcriptAriaLabel}
      chatLabels={chatLabels}
      emptyState={snapshot.status === 'error' ? <TranscriptRestoreErrorState /> : undefined}
      initialInvocation={activeInitialInvocation}
      invocationId={activeInvocationId}
      loading={snapshot.status === 'loading'}
      onInvocationStatusChange={handleInvocationStatusChange}
      onRetry={handleRetry}
      sessionEvents={snapshot.events}
      sessionInvocations={snapshot.invocations}
      sessionId={sessionId}
      turnActionLabels={turnActionLabels}
      userMessage={active}
    />
  )
  const composer = (
    <ChatComposer
      disabled={composerDisabled}
      disabledReason={composerDisabledReason}
      focusRequestToken={composerFocusRequestToken}
      labels={composerLabels}
      onCancel={async () => {
        if (!activeInvocationId)
          return
        const result = await cancelEngineInvocation(activeInvocationId)
        dispatchObservedInvocation({ invocation: { id: result.invocation.id, status: result.invocation.status }, type: 'set' })
        setActive(current => current?.invocationId === result.invocation.id
          ? activeInvocationWithStatus(current, result.invocation.status)
          : current)
        setComposerFocusRequestToken(token => (token ?? 0) + 1)
      }}
      onSubmitted={({ invocationId, session, status, text }) => {
        onSessionUpdated?.(session)
        setActive({ invocationId, status, text })
        dispatchObservedInvocation({ invocation: { id: invocationId, status }, type: 'set' })
        setComposerFocusRequestToken(token => (token ?? 0) + 1)
      }}
      sessionId={sessionId}
      status={composerStatus}
    />
  )

  return (
    <div ref={surfaceRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-chat-surface="true">
      {hasConversation
        ? (
            <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 overflow-hidden px-4 sm:px-0" data-chat-column="true">
              <div
                ref={transcriptScrollRef}
                className="no-scrollbar relative flex min-h-0 min-w-0 flex-1 flex-col-reverse overflow-y-auto [overflow-anchor:none] [scroll-padding-bottom:var(--chat-scroll-padding-bottom,0px)]"
                data-chat-transcript-scroll="true"
              >
                <div className="flex min-h-full shrink-0 flex-col justify-start" data-chat-scroll-content="true">
                  <div className="relative flex shrink-0 flex-col pb-8" data-chat-transcript-content="true">
                    {transcript}
                  </div>
                  <div
                    ref={composerFooterRef}
                    className="sticky bottom-0 z-10 mt-auto w-full bg-background pb-3 pt-3"
                    data-chat-composer-footer="true"
                  >
                    <div className="flex flex-col">
                      {composer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        : (
            <div className="no-scrollbar flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto" data-chat-empty-entry="true">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 sm:px-0" data-chat-column="true">
                {transcript}
                {composer}
              </div>
            </div>
          )}
    </div>
  )
}

function latestInvocationForSession(invocations: LocalEngineInvocation[]): LocalEngineInvocation | null {
  return invocations
    .filter(invocation => !isInternalInvocation(invocation))
    .sort((left, right) => left.seq - right.seq)
    .at(-1) ?? null
}

function isInternalInvocation(invocation: LocalEngineInvocation): boolean {
  const metadata = invocation.metadataJson
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.kind === 'internal')
}

function composerStatusForInvocation(status: LocalEngineInvocation['status'] | undefined) {
  if (status === 'queued' || status === 'starting' || status === 'running')
    return 'running'
  if (status === 'succeeded')
    return 'completed'
  if (status === 'failed' || status === 'lost')
    return 'failed'
  if (status === 'cancelled')
    return 'cancelled'
  return 'idle'
}

function scrollTranscriptToLatest(scrollContainer: HTMLElement | null) {
  if (!scrollContainer)
    return

  const top = 0
  if (typeof scrollContainer.scrollTo === 'function') {
    scrollContainer.scrollTo({ behavior: 'auto', top })
    return
  }

  scrollContainer.scrollTop = top
}

function isTranscriptNearLatest(scrollContainer: HTMLElement) {
  return Math.abs(scrollContainer.scrollTop) <= 48
}

function routePlainKeyToComposer(event: KeyboardEvent, surface: HTMLElement | null) {
  if (!shouldRoutePlainKeyToComposer(event))
    return

  const composer = surface?.querySelector<HTMLTextAreaElement>('[data-codex-composer="true"]')
  if (!composer || composer.disabled)
    return

  event.preventDefault()
  composer.focus()
  insertPlainTextAtComposerSelection(composer, event.key)
}

function shouldRoutePlainKeyToComposer(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey)
    return false
  if (event.key.length !== 1 || event.key === ' ' || event.key === '\u00A0')
    return false
  if (isElementInOpenInteractiveOverlay())
    return false

  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  return !path.some((target) => {
    if (!(target instanceof HTMLElement))
      return false
    return isEditableTarget(target) || target.closest('[data-codex-terminal], dil-renderer') !== null
  })
}

function isElementInOpenInteractiveOverlay() {
  return document.querySelector([
    '[role="dialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
  ].join(', ')) !== null
}

function isEditableTarget(target: HTMLElement) {
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null || target.isContentEditable
}

function insertPlainTextAtComposerSelection(composer: HTMLTextAreaElement, text: string) {
  const value = composer.value
  const start = composer.selectionStart ?? value.length
  const end = composer.selectionEnd ?? start
  const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`
  const cursor = start + text.length
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

  if (valueSetter)
    valueSetter.call(composer, nextValue)
  else
    composer.value = nextValue

  composer.setSelectionRange(cursor, cursor)
  const inputEvent = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
    : new Event('input', { bubbles: true })
  composer.dispatchEvent(inputEvent)
}

function sessionTranscriptSnapshotReducer(
  _state: SessionTranscriptSnapshot,
  action: SessionTranscriptSnapshotAction,
): SessionTranscriptSnapshot {
  if (action.type === 'loaded')
    return action.snapshot
  return LOADING_TRANSCRIPT_SNAPSHOT
}

function sessionTranscriptSnapshotFromDetail(detail: Awaited<ReturnType<typeof fetchSessionDetail>>): SessionTranscriptSnapshot {
  return {
    events: Array.isArray(detail.events) ? detail.events : [],
    invocations: Array.isArray(detail.invocations) ? detail.invocations : [],
    status: 'loaded',
  }
}

function observedInvocationStatusReducer(
  state: ObservedInvocationStatus | null,
  action: ObservedInvocationStatusAction,
): ObservedInvocationStatus | null {
  if (action.type === 'set') {
    if (state?.id === action.invocation.id && state.status === action.invocation.status)
      return state
    return action.invocation
  }
  return null
}

function activeInvocationWithStatus(
  current: ActiveInvocationFollow,
  status: LocalEngineInvocation['status'],
): ActiveInvocationFollow {
  return current.status === status ? current : { ...current, status }
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
