import type { WorkbenchBridgeEvent } from './transcript-mapper'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

import { useCallback, useEffect, useState } from 'react'
import { invocationEventStreamPath, submitInvocation } from './broker-client'
import { bridgeEventsToTranscriptTurns } from './transcript-mapper'

/**
 * Chat surface for the mounted SDK common workbench (方案 C).
 *
 * Runs the live engine loop end-to-end inside the micro-app sandbox: the composer
 * submits a session-level follow-up invocation through the broker, then the
 * transcript consumes that invocation's events over the US-005 SSE endpoint via
 * EventSource. Each streamed normalized bridge event is mapped
 * (bridgeEventsToTranscriptTurns) into packages/ui transcript turns and rendered
 * with the shared ChatThread. Session artifacts layer on in a later slice.
 */
export function WorkbenchChat({ sessionId }: { sessionId: null | string }) {
  const [input, setInput] = useState('')
  const [activeInvocationId, setActiveInvocationId] = useState<null | string>(null)
  const [streamedEvents, setStreamedEvents] = useState<WorkbenchBridgeEvent[]>([])
  const [error, setError] = useState<null | string>(null)

  const onSubmit = useCallback(async () => {
    if (!sessionId || input.trim().length === 0)
      return
    try {
      setError(null)
      setStreamedEvents([])
      const { invocationId } = await submitInvocation(sessionId, input.trim())
      setInput('')
      setActiveInvocationId(invocationId)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'submit failed')
    }
  }, [input, sessionId])

  useEffect(() => {
    if (!activeInvocationId)
      return undefined
    const source = new EventSource(invocationEventStreamPath(activeInvocationId))
    source.onmessage = (event: MessageEvent) => {
      try {
        const bridgeEvent = JSON.parse(event.data) as WorkbenchBridgeEvent
        setStreamedEvents(previous => [...previous, bridgeEvent])
      }
      catch {
        // ignore a malformed frame rather than tearing down the stream.
      }
    }
    // No client-side close on the `done` frame: when the server finishes a stream
    // it ends the response, EventSource reconnects once, and the daemon answers 204
    // No Content so the client stops cleanly (closing here would abort the in-flight
    // connection and surface as a spurious request failure). Cleanup on unmount /
    // invocation change still closes the source.
    return () => source.close()
  }, [activeInvocationId])

  return (
    <section data-aiworker-chat="true">
      <ChatThread ariaLabel="Engine transcript" turns={bridgeEventsToTranscriptTurns(streamedEvents)} />
      {error ? <p data-aiworker-chat-error="true">{error}</p> : null}
      <textarea
        aria-label="Engine input"
        data-aiworker-composer-input="true"
        onChange={event => setInput(event.target.value)}
        value={input}
      />
      <Button
        data-aiworker-composer-submit="true"
        data-aiworker-ui-probe="true"
        disabled={!sessionId}
        onClick={onSubmit}
      >
        Send
      </Button>
    </section>
  )
}
