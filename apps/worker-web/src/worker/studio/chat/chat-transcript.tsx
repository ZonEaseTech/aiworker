import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'

import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

import { useInvocationEvents } from './use-invocation-events'

export interface ChatTranscriptProps {
  ariaLabel: string
  invocationId: string | null
  intervalMs?: number
  userMessage?: { invocationId: string, text: string } | null
}

/**
 * View side of a chat surface: renders the live engine transcript for the
 * selected invocation. It owns no transport — `useInvocationEvents` polls and
 * maps engine-bridge events into packages/ui transcript turns, and `ChatThread`
 * renders them. With no invocation selected it renders an empty, labelled log.
 *
 * The engine bridge stream carries no user turn, so the submitted message is
 * passed in via `userMessage` and prepended as a leading `user-message` turn
 * ahead of the engine-derived turns (see `bridge-event-mapper`).
 *
 * The Worker renders the session chat directly: this transcript is mounted by
 * worker-studio on the session route. The Soul provides no UI.
 */
export function ChatTranscript({ ariaLabel, intervalMs, invocationId, userMessage }: ChatTranscriptProps) {
  const { turns } = useInvocationEvents(invocationId, intervalMs === undefined ? {} : { intervalMs })
  const leadingTurns: TranscriptTurnModel[] = userMessage
    ? [{
        id: `${userMessage.invocationId}:user`,
        items: [{ body: userMessage.text, id: `${userMessage.invocationId}:user-message`, kind: 'user-message' }],
      }]
    : []
  return <ChatThread ariaLabel={ariaLabel} turns={[...leadingTurns, ...turns]} />
}
