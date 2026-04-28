import type { SessionEntryStatus } from '@zonease/aiworker-core'
import {
  getSessionStatus,
  listSessionStatuses,
  runClosedTranscriptMaintenance,
} from '@zonease/aiworker-core'
import consola from 'consola'
import { loadWorkerContext } from '../context'

export interface SessionsListOptions {
  limit?: number
  offset?: number
  status?: string
}

export interface SessionsMaintenanceOptions {
  olderThanDays?: number
  limit?: number
  apply?: boolean
}

export async function runSessionsList(options: SessionsListOptions = {}): Promise<number> {
  try {
    const status = parseStatus(options.status)
    const ctx = await loadWorkerContext({ silent: true })
    const result = listSessionStatuses({
      config: ctx.hydrated,
      limit: options.limit,
      offset: options.offset,
      ...(status === undefined ? {} : { status }),
    })
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker sessions list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return err instanceof InvalidSessionStatusError ? 2 : 1
  }
}

export async function runSessionsShow(sessionKey: string): Promise<number> {
  try {
    const ctx = await loadWorkerContext({ silent: true })
    const session = getSessionStatus(sessionKey, ctx.hydrated)
    if (session === null) {
      consola.error(`[aiworker sessions show] session not found: ${sessionKey}`)
      return 1
    }
    console.log(JSON.stringify({ session }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker sessions show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runSessionsMaintenance(options: SessionsMaintenanceOptions = {}): Promise<number> {
  try {
    await loadWorkerContext({ silent: true })
    const result = runClosedTranscriptMaintenance({
      olderThanDays: options.olderThanDays,
      limit: options.limit,
      apply: options.apply === true,
    })
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker sessions maintenance] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

class InvalidSessionStatusError extends Error {}

function parseStatus(status: string | undefined): SessionEntryStatus | undefined {
  if (status === undefined)
    return undefined
  if (status === 'active' || status === 'closed')
    return status
  throw new InvalidSessionStatusError('status must be "active" or "closed"')
}
