import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

import { useInvocationEvents } from './use-invocation-events'

export interface ChatTranscriptProps {
  ariaLabel: string
  invocationId: string | null
  intervalMs?: number
}

/**
 * View side of the worker-web chat surface (Model A): renders the live engine
 * transcript for the selected invocation. It owns no transport — `useInvocationEvents`
 * polls and maps engine-bridge events into packages/ui transcript turns, and
 * `ChatThread` renders them. With no invocation selected it renders an empty,
 * labelled log so the composer still has a stable surface to sit above.
 */
export function ChatTranscript({ ariaLabel, intervalMs, invocationId }: ChatTranscriptProps) {
  const { turns } = useInvocationEvents(invocationId, intervalMs === undefined ? {} : { intervalMs })
  return <ChatThread ariaLabel={ariaLabel} turns={turns} />
}
