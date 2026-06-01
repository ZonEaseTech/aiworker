import { Button } from '@zonease/aiworker-ui/components/button'
import { useCallback, useEffect, useState } from 'react'

import { invocationEventStreamPath, submitInvocation } from './broker-client'

interface StreamedEvent {
  id: string
  type: string
}

/**
 * Minimal chat surface for the mounted SDK common workbench (方案 C, thin vertical).
 *
 * Proves the live engine loop end-to-end inside the micro-app sandbox: the composer
 * submits a session-level follow-up invocation through the broker, then the
 * transcript consumes that invocation's events over the US-005 SSE endpoint via
 * EventSource and renders each streamed bridge event. The full chat UI (packages/ui
 * ChatThread + artifacts via buildInvocationTurns) layers onto this in later slices.
 */
export function WorkbenchChat({ sessionId }: { sessionId: null | string }) {
  const [input, setInput] = useState('')
  const [activeInvocationId, setActiveInvocationId] = useState<null | string>(null)
  const [streamedEvents, setStreamedEvents] = useState<StreamedEvent[]>([])
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
        const bridgeEvent = JSON.parse(event.data) as { type?: unknown }
        setStreamedEvents(previous => [...previous, {
          id: event.lastEventId,
          type: typeof bridgeEvent.type === 'string' ? bridgeEvent.type : 'event',
        }])
      }
      catch {
        // ignore a malformed frame rather than tearing down the stream.
      }
    }
    // close on the terminal `done` frame (and on any error) so EventSource does
    // not reconnect-loop after the server ends a finished invocation's stream.
    const handleDone = () => source.close()
    source.addEventListener('done', handleDone)
    source.onerror = () => source.close()
    return () => {
      source.removeEventListener('done', handleDone)
      source.close()
    }
  }, [activeInvocationId])

  return (
    <section data-aiworker-chat="true">
      <ul aria-label="Engine transcript" data-aiworker-transcript="true" role="log">
        {streamedEvents.map(event => (
          <li data-aiworker-stream-event={event.type} key={event.id}>
            {event.type}
          </li>
        ))}
      </ul>
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
