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
export function ChatSurface({ composerLabels, sessionId, transcriptAriaLabel }: ChatSurfaceProps) {
  const [active, setActive] = useState<{ invocationId: string, text: string } | null>(null)

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-chat-surface="true">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <ChatTranscript
          ariaLabel={transcriptAriaLabel}
          invocationId={active?.invocationId ?? null}
          userMessage={active}
        />
      </div>
      <ChatComposer
        labels={composerLabels}
        onSubmitted={setActive}
        sessionId={sessionId}
      />
    </div>
  )
}
