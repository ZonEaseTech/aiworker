export interface SoulAppSearchIndexReference {
  id: string
  type: string
  url?: string
}

export interface SoulAppSearchIndexUpsertInput {
  artifactId?: string | null
  kind: string
  reference?: SoulAppSearchIndexReference
  reviewId?: string | null
  sessionId?: string | null
  summary?: string | null
  title: string
  workspaceId?: string | null
}

export interface SoulAppSearchIndexRecord {
  appId: string
  artifactId: string | null
  authority: 'soul-app'
  cache: {
    freshness: 'non-authoritative'
  }
  id: string
  kind: string
  reference: SoulAppSearchIndexReference | null
  reviewId: string | null
  sessionId: string | null
  summary: string | null
  title: string
  updatedAt: string
  workspaceId: string | null
}

export interface SoulAppSearchIndexQueryResult {
  appId: string
  authority: 'soul-app'
  items: SoulAppSearchIndexRecord[]
  query: string
}

const searchIndexRecords = new Map<string, SoulAppSearchIndexRecord>()

export function upsertSoulAppSearchIndexRecord(
  appId: string,
  id: string,
  input: SoulAppSearchIndexUpsertInput,
  at = new Date().toISOString(),
): SoulAppSearchIndexRecord {
  const record: SoulAppSearchIndexRecord = {
    appId,
    artifactId: input.artifactId ?? null,
    authority: 'soul-app',
    cache: { freshness: 'non-authoritative' },
    id,
    kind: input.kind,
    reference: input.reference ? sanitizeReference(input.reference) : null,
    reviewId: input.reviewId ?? null,
    sessionId: input.sessionId ?? null,
    summary: input.summary ?? null,
    title: input.title,
    updatedAt: at,
    workspaceId: input.workspaceId ?? null,
  }
  searchIndexRecords.set(indexKey(appId, id), record)
  return record
}

export function querySoulAppSearchIndex(appId: string, query: string): SoulAppSearchIndexQueryResult {
  const normalized = normalize(query)
  const items = [...searchIndexRecords.values()]
    .filter(record => record.appId === appId)
    .filter(record => !normalized || normalize(searchText(record)).includes(normalized))
  return {
    appId,
    authority: 'soul-app',
    items,
    query,
  }
}

function indexKey(appId: string, id: string): string {
  return `${appId}:${id}`
}

function sanitizeReference(reference: SoulAppSearchIndexReference): SoulAppSearchIndexReference {
  return {
    id: reference.id,
    type: reference.type,
    ...(reference.url ? { url: reference.url } : {}),
  }
}

function searchText(record: SoulAppSearchIndexRecord): string {
  return [
    record.id,
    record.kind,
    record.title,
    record.summary,
    record.reference?.id,
    record.reference?.type,
  ].filter(Boolean).join('\n')
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}
