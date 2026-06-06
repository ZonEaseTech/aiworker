import type { SessionRow } from '@zonease/aiworker-storage-sqlite/worker'

export type SessionTitleSource = 'auto-default' | 'auto-truncated' | 'auto-engine' | 'user'

export interface SessionTitlePatch {
  metadataJson: Record<string, unknown>
  title: string
}

const TITLE_SOURCES = new Set<SessionTitleSource>([
  'auto-default',
  'auto-truncated',
  'auto-engine',
  'user',
])

export function readSessionTitleSource(session: Pick<SessionRow, 'metadataJson'>): SessionTitleSource {
  const source = readRecord(session.metadataJson).titleSource
  return typeof source === 'string' && TITLE_SOURCES.has(source as SessionTitleSource)
    ? source as SessionTitleSource
    : 'auto-default'
}

export function applyAutoTruncatedTitle(
  session: Pick<SessionRow, 'metadataJson' | 'title'>,
  title: string,
): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  if (readSessionTitleSource(session) !== 'auto-default')
    return null
  return titlePatch(session, title, 'auto-truncated')
}

export function applyAutoEngineTitle(
  session: Pick<SessionRow, 'metadataJson' | 'title'>,
  title: string,
): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  if (readSessionTitleSource(session) === 'user')
    return null
  return titlePatch(session, title, 'auto-engine')
}

export function applyUserTitle(
  session: Pick<SessionRow, 'metadataJson' | 'title'>,
  title: string,
): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  return titlePatch(session, title, 'user')
}

function titlePatch(
  session: Pick<SessionRow, 'metadataJson'>,
  title: string,
  source: SessionTitleSource,
): SessionTitlePatch {
  return {
    title,
    metadataJson: { ...readRecord(session.metadataJson), titleSource: source },
  }
}

function validTitleChange(currentTitle: string, nextTitle: string): boolean {
  return nextTitle.trim().length > 0 && nextTitle !== currentTitle
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
