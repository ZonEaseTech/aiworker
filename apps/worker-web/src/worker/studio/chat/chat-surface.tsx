import type { ChatComposerLabels } from './chat-composer'

import { useState } from 'react'
import { ChatComposer } from './chat-composer'
import { ChatTranscript } from './chat-transcript'

export interface ChatSurfaceProps {
  composerLabels: ChatComposerLabels
  sessionId: string
  transcriptAriaLabel: string
}

/**
 * worker-web employee chat surface (Model A): the platform-generic session
 * experience rendered by worker-web itself. Composes the transcript view above
 * the composer; submitting a message points the live transcript at the new
 * invocation.
 *
 * State here is the currently-followed invocation only. Switching sessions must
 * reset it — callers render this keyed by `sessionId`
 * (`<ChatSurface key={sessionId} ... />`) so a session change remounts with a
 * fresh follow state and no stale transcript leaks across sessions.
 */
export function ChatSurface({ composerLabels, sessionId, transcriptAriaLabel }: ChatSurfaceProps) {
  const [activeInvocationId, setActiveInvocationId] = useState<string | null>(null)

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-chat-surface="true">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <ChatTranscript ariaLabel={transcriptAriaLabel} invocationId={activeInvocationId} />
      </div>
      <ChatComposer
        labels={composerLabels}
        onSubmitted={setActiveInvocationId}
        sessionId={sessionId}
      />
    </div>
  )
}
