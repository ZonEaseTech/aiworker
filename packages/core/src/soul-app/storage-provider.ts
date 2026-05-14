import type { SoulAppStorageRecordRow, UpsertSoulAppStorageRecordInput } from '@zonease/aiworker-storage-sqlite/worker'

import {
  getSoulAppStorageRecord,
  listSoulAppStorageRecords,
  upsertSoulAppStorageRecord,
} from '@zonease/aiworker-storage-sqlite/worker'

export type SoulAppStoragePutInput = UpsertSoulAppStorageRecordInput

export interface SoulAppStorageProvider {
  get: (appId: string, key: string) => SoulAppStorageRecordRow | null
  list: (appId: string) => SoulAppStorageRecordRow[]
  put: (input: SoulAppStoragePutInput) => SoulAppStorageRecordRow
}

export function createSqliteSoulAppStorageProvider(): SoulAppStorageProvider {
  return {
    get(appId, key) {
      return getSoulAppStorageRecord(appId, key)
    },
    list(appId) {
      return listSoulAppStorageRecords(appId)
    },
    put(input) {
      return upsertSoulAppStorageRecord(input)
    },
  }
}
