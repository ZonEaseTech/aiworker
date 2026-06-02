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
 * Employee chat surface: composes the transcript view above the composer;
 * submitting a message points the live transcript at the new invocation.
 *
 * State here is the currently-followed invocation only. Switching sessions must
 * reset it — callers render this keyed by `sessionId`
 * (`<ChatSurface key={sessionId} ... />`) so a session change remounts with a
 * fresh follow state and no stale transcript leaks across sessions.
 *
 * STATUS: unwired reusable foundation — canonical architecture is mounted-owns-chat
 * (session → mounted soul workbench, not worker-web; guards 1786/1807 + browser
 * proof); home is the soul-sdk sdk-common workbench. NOT wired into
 * worker-studio. See memory worker-standalone-release-map-2026-06-01.
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
