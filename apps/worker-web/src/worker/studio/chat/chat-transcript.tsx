import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

import { useInvocationEvents } from './use-invocation-events'

export interface ChatTranscriptProps {
  ariaLabel: string
  invocationId: string | null
  intervalMs?: number
}

/**
 * View side of a chat surface: renders the live engine transcript for the
 * selected invocation. It owns no transport — `useInvocationEvents` polls and
 * maps engine-bridge events into packages/ui transcript turns, and `ChatThread`
 * renders them. With no invocation selected it renders an empty, labelled log.
 *
 * The Worker renders the session chat directly: this transcript is mounted by
 * worker-studio on the session route. The Soul provides no UI.
 */
export function ChatTranscript({ ariaLabel, intervalMs, invocationId }: ChatTranscriptProps) {
  const { turns } = useInvocationEvents(invocationId, intervalMs === undefined ? {} : { intervalMs })
  return <ChatThread ariaLabel={ariaLabel} turns={turns} />
}
