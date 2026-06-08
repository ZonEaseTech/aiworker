import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'
import type { ReactNode } from 'react'

import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

export interface SessionTimelineProps {
  ariaLabel: string
  emptyState?: ReactNode
  loading?: boolean
  turns: TranscriptTurnModel[]
}

/**
 * Worker-owned session timeline UI layer. This keeps Worker Web session
 * rendering separate from transport/lifecycle code while still delegating the
 * reusable transcript primitives to `packages/ui`.
 */
export function SessionTimeline({
  ariaLabel,
  emptyState,
  loading = false,
  turns,
}: SessionTimelineProps) {
  return (
    <div data-session-timeline="true" className="min-w-0">
      <ChatThread ariaLabel={ariaLabel} emptyState={emptyState} loading={loading} turns={turns} />
    </div>
  )
}
