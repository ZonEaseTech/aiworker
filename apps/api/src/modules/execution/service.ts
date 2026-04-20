import type { ExecutionListQuery, ExecutionLog } from './types'

import { desc, eq, sql } from 'drizzle-orm'

import { getDb } from '../../db'
import { executionLogs } from '../../db/schema'

type Row = typeof executionLogs.$inferSelect

function toExecutionLog(row: Row): ExecutionLog {
  return {
    id: row.id,
    issueId: row.issueId,
    toolName: row.toolName,
    params: row.params ?? null,
    result: row.result ?? null,
    duration: row.duration ?? null,
    conversationId: row.conversationId ?? null,
    createdAt: row.createdAt,
  }
}

export async function listExecutionLogs(query: ExecutionListQuery): Promise<{ logs: ExecutionLog[], total: number }> {
  const db = getDb()
  const where = query.conversationId ? eq(executionLogs.conversationId, query.conversationId) : undefined

  const baseQuery = db.select().from(executionLogs)
  const filtered = where ? baseQuery.where(where) : baseQuery
  const rows = await filtered.orderBy(desc(executionLogs.createdAt)).limit(query.limit).offset(query.offset)

  const baseCount = db.select({ count: sql<number>`count(*)`.as('count') }).from(executionLogs)
  const countResult = where ? await baseCount.where(where) : await baseCount
  const total = Number(countResult[0]?.count ?? 0)

  return { logs: rows.map(toExecutionLog), total }
}

export async function getExecutionLog(id: number): Promise<ExecutionLog | null> {
  const db = getDb()
  const rows = await db.select().from(executionLogs).where(eq(executionLogs.id, id)).limit(1)
  return rows[0] ? toExecutionLog(rows[0]) : null
}

export async function getExecutionStats(): Promise<{ total: number, byTool: Record<string, number>, averageDurationMs: number | null }> {
  const db = getDb()
  const rows = await db.select().from(executionLogs)
  const total = rows.length

  const byTool: Record<string, number> = {}
  let durationSum = 0
  let durationCount = 0
  for (const row of rows) {
    byTool[row.toolName] = (byTool[row.toolName] ?? 0) + 1
    if (typeof row.duration === 'number') {
      durationSum += row.duration
      durationCount++
    }
  }

  const averageDurationMs = durationCount > 0 ? Math.round(durationSum / durationCount) : null
  return { total, byTool, averageDurationMs }
}
