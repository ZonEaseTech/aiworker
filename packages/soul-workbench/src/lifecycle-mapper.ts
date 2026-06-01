/**
 * Pure mappers for the mounted workbench lifecycle modules (方案 C, US-008).
 *
 * Read-only summaries over the broker's lifecycle responses (projection receipts,
 * session/workspace archive state). Transport-independent so they can be unit
 * tested without a daemon.
 */

export interface ProjectionReceiptStatus {
  receiptId?: string
  status?: string
  workspaceId?: string
}

export interface ProjectionReceiptRow {
  receiptId: string
  status: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Summarise a workspace projection receipt response into a status row. */
export function summarizeProjectionReceipt(receipt: ProjectionReceiptStatus): ProjectionReceiptRow {
  return {
    receiptId: readString(receipt.receiptId),
    status: readString(receipt.status) || 'unknown',
  }
}
