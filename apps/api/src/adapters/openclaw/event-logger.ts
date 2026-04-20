import type { ToolCallEndEvent } from './types'

import { desc, eq } from 'drizzle-orm'

import { getDb } from '../../db'
import { executionLogs } from '../../db/schema'

export class OpenClawEventLogger {
  async logToolCall(event: ToolCallEndEvent): Promise<void> {
    const db = getDb()
    await db.insert(executionLogs).values({
      issueId: event.payload.issueId,
      toolName: event.payload.toolName,
      params: event.payload.result, // result contains final state
      result: event.payload.result,
      duration: event.payload.duration,
      createdAt: event.payload.timestamp,
    })
  }

  async getRecentEvents(limit = 50): Promise<(typeof executionLogs.$inferSelect)[]> {
    const db = getDb()
    return db
      .select()
      .from(executionLogs)
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit)
  }

  async getEventsByIssue(issueId: string): Promise<(typeof executionLogs.$inferSelect)[]> {
    const db = getDb()
    return db
      .select()
      .from(executionLogs)
      .where(eq(executionLogs.issueId, issueId))
      .orderBy(desc(executionLogs.createdAt))
  }
}
