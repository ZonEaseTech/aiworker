import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { closeFleetDb, initFleetDb } from './index'

async function makeTmp(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

describe('initFleetDb path handling', () => {
  test('wraps open failures with resolved path and remediation', async () => {
    const root = await makeTmp('aiworker-fleet-db-error-')
    const parentFile = path.join(root, 'not-a-directory')
    const dbPath = path.join(parentFile, 'fleet.db')
    try {
      await writeFile(parentFile, 'not a directory')

      expect(() => initFleetDb(dbPath)).toThrow(`Unable to open fleet database at ${dbPath}`)
      expect(() => initFleetDb(dbPath)).toThrow('set AIWORKER_FLEET_DB_PATH to a writable location')
    }
    finally {
      closeFleetDb()
      await rm(root, { recursive: true, force: true })
    }
  })
})
