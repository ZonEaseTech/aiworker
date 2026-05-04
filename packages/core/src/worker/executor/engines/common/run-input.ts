import type { ChatMessage } from '@zonease/aiworker-shared'

/** Separator between distinct system role segments when joining for a single text channel. */
const SYSTEM_SEGMENT_SEPARATOR = '\n\n---\n\n'

/** Cap on rendered history preamble per role label, keeping prompts bounded for engines without native history. */
const HISTORY_ENTRY_MAX_CHARS = 2_000

/** Cap on number of history entries rolled into a preamble — newest entries win. */
const HISTORY_ENTRY_MAX_COUNT = 20

export interface ExtractedRunMessages {
  /** Joined text of every `role: 'system'` message, in original order. Empty string when none. */
  systemText: string
  /** Non-system messages excluding the most recent user turn. Original order preserved. */
  history: ChatMessage[]
  /** Most recent user-role content. `null` when no user turn is present. */
  latestUser: string | null
}

/**
 * Pull persona / project-brain `system` content out of an `AgentRunInput.messages`
 * array, then split the remaining transcript into prior history and the new user
 * turn. Engine adapters use this to translate the orchestrator's canonical
 * `[system, ...history, latestUser]` shape into whatever protocol the underlying
 * runtime expects.
 */
export function extractRunMessages(messages: ChatMessage[]): ExtractedRunMessages {
  const systemSegments: string[] = []
  const nonSystem: ChatMessage[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      const trimmed = msg.content.trim()
      if (trimmed.length > 0)
        systemSegments.push(trimmed)
      continue
    }
    nonSystem.push(msg)
  }

  let latestUser: string | null = null
  let latestUserIndex = -1
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i]
    if (msg && msg.role === 'user' && msg.content.trim().length > 0) {
      latestUser = msg.content
      latestUserIndex = i
      break
    }
  }

  const history = latestUserIndex >= 0
    ? nonSystem.slice(0, latestUserIndex)
    : nonSystem.slice()

  return {
    systemText: systemSegments.join(SYSTEM_SEGMENT_SEPARATOR),
    history,
    latestUser,
  }
}

/**
 * Compose the joined system-prompt text used by engines that accept a single
 * system channel (e.g. claude-code `--append-system-prompt`).
 */
export function composeSystemPromptText(messages: ChatMessage[]): string {
  return extractRunMessages(messages).systemText
}

/**
 * Render prior conversation history as a labelled preamble for engines that
 * don't accept assistant/tool envelopes through their wire protocol (claude-
 * code, cursor). Returns an empty string when there is no history.
 *
 * Output shape:
 *   Recent conversation:
 *   - user: ...
 *   - assistant: ...
 */
export function renderHistoryAsUserPreamble(history: ChatMessage[]): string {
  if (history.length === 0)
    return ''
  const trimmed = history.slice(-HISTORY_ENTRY_MAX_COUNT)
  const lines = ['Recent conversation:']
  for (const msg of trimmed) {
    const content = msg.content.trim()
    if (content.length === 0)
      continue
    const truncated = content.length <= HISTORY_ENTRY_MAX_CHARS
      ? content
      : `${content.slice(0, HISTORY_ENTRY_MAX_CHARS)}… (truncated)`
    const label = roleLabel(msg.role)
    lines.push(`- ${label}: ${truncated}`)
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

function roleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'assistant':
      return 'assistant'
    case 'tool':
      return 'tool'
    case 'user':
      return 'user'
    case 'system':
      // Caller is supposed to have stripped system already; keep a label for
      // defensive rendering rather than swallowing content silently.
      return 'system'
  }
}
