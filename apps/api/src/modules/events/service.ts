import type { SyncEventDto } from './types'

import { desc } from 'drizzle-orm'

import { getDb } from '../../db'
import { syncEvents } from '../../db/schema'

export async function listRecentSyncEvents(limit: number): Promise<{ events: SyncEventDto[], total: number }> {
  const db = getDb()
  const rows = await db
    .select()
    .from(syncEvents)
    .orderBy(desc(syncEvents.createdAt))
    .limit(limit)

  const events: SyncEventDto[] = rows.map(row => ({
    id: row.id,
    type: row.type,
    source: row.source,
    target: row.target,
    status: row.status,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  }))

  return { events, total: events.length }
}
