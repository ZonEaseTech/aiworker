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
 * STATUS: unwired reusable foundation — canonical architecture is mounted-owns-chat
 * (session → mounted soul workbench, not worker-web); home is the soul-sdk
 * sdk-common workbench. See memory worker-standalone-release-map-2026-06-01.
 */
export function ChatTranscript({ ariaLabel, intervalMs, invocationId }: ChatTranscriptProps) {
  const { turns } = useInvocationEvents(invocationId, intervalMs === undefined ? {} : { intervalMs })
  return <ChatThread ariaLabel={ariaLabel} turns={turns} />
}
