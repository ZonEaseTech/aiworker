import type { ProjectionReceiptRow, WorkbenchSession } from './lifecycle-mapper'

import { Button } from '@zonease/aiworker-ui/components/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useCallback, useEffect, useState } from 'react'

import { archiveSession, fetchProjectionReceipt, fetchSession } from './broker-client'
import { summarizeProjectionReceipt } from './lifecycle-mapper'

/**
 * Lifecycle modules for the mounted SDK common workbench (方案 C, US-008):
 * - projection-receipt-status ← `GET /api/projections/receipts/:workspaceId`;
 * - session-lifecycle / archive-controls: the session's lifecycle state plus an
 *   archive control (`POST /api/sessions/:id/archive`), the first mutation module.
 *
 * Each section renders packages/ui rows and hides itself when its data is absent.
 */
export function WorkbenchLifecycle({ sessionId, workspaceId }: { sessionId: null | string, workspaceId: null | string }) {
  const [receipt, setReceipt] = useState<ProjectionReceiptRow | null>(null)
  const [session, setSession] = useState<WorkbenchSession | null>(null)

  useEffect(() => {
    if (!workspaceId)
      return undefined
    let cancelled = false
    fetchProjectionReceipt(workspaceId)
      .then((result) => {
        if (!cancelled)
          setReceipt(summarizeProjectionReceipt(result))
      })
      .catch(() => {
        // Best-effort read-only surface; a failed fetch leaves it empty.
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    if (!sessionId)
      return undefined
    let cancelled = false
    fetchSession(sessionId)
      .then((result) => {
        if (!cancelled)
          setSession(result)
      })
      .catch(() => {
        // Best-effort read-only surface; a failed fetch leaves it empty.
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const onArchive = useCallback(async () => {
    if (!sessionId)
      return
    try {
      setSession(await archiveSession(sessionId))
    }
    catch {
      // Leave the session state unchanged if the archive mutation fails.
    }
  }, [sessionId])

  return (
    <>
      {receipt
        ? (
            <ItemGroup data-aiworker-lifecycle="projection-receipt-status">
              <Item data-aiworker-projection-receipt={receipt.status}>
                <ItemContent>
                  <ItemTitle>Projection receipt</ItemTitle>
                  <ItemDescription>{`${receipt.status}${receipt.receiptId ? ` · ${receipt.receiptId}` : ''}`}</ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          )
        : null}
      {session?.status
        ? (
            <ItemGroup data-aiworker-lifecycle="session-lifecycle">
              <Item data-aiworker-session-status={session.status}>
                <ItemContent>
                  <ItemTitle>Session</ItemTitle>
                  <ItemDescription>{session.status}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button data-aiworker-session-archive="true" disabled={session.status !== 'active'} onClick={onArchive}>
                    Archive
                  </Button>
                </ItemActions>
              </Item>
            </ItemGroup>
          )
        : null}
    </>
  )
}
