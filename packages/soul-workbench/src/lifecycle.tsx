import type { ProjectionReceiptRow } from './lifecycle-mapper'

import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useEffect, useState } from 'react'

import { fetchProjectionReceipt } from './broker-client'
import { summarizeProjectionReceipt } from './lifecycle-mapper'

/**
 * Lifecycle modules for the mounted SDK common workbench (方案 C, US-008).
 *
 * Read-only projection-receipt status from the broker
 * (`GET /api/projections/receipts/:workspaceId`) via the locator-injected
 * workspace id. Archive controls and session lifecycle layer on here in later slices.
 */
export function WorkbenchLifecycle({ workspaceId }: { workspaceId: null | string }) {
  const [receipt, setReceipt] = useState<ProjectionReceiptRow | null>(null)

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

  if (!receipt)
    return null

  return (
    <ItemGroup data-aiworker-lifecycle="projection-receipt-status">
      <Item data-aiworker-projection-receipt={receipt.status}>
        <ItemContent>
          <ItemTitle>Projection receipt</ItemTitle>
          <ItemDescription>{`${receipt.status}${receipt.receiptId ? ` · ${receipt.receiptId}` : ''}`}</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
}
