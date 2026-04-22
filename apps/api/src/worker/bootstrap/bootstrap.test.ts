import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWorkerApiToken, WORKER_ID_PATTERN } from '@aiworker/shared'
import { beforeEach, describe, expect, it } from 'bun:test'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '../../db/worker'
import { SecretsVault } from '../secrets/vault'
import { loadOrSeedConfig } from './config'
import { DEFAULT_EMPTY_CONFIG } from './default-config'
import { loadOrMintIdentity, mintApiToken, mintWorkerId } from './identity'
import { printBootstrapIfJustMinted } from './print'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

describe('bootstrap', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-bootstrap-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations('./drizzle/worker')
  })

  describe('mintWorkerId', () => {
    it('produces a string matching WORKER_ID_PATTERN', () => {
      const id = mintWorkerId()
      expect(WORKER_ID_PATTERN.test(id)).toBe(true)
    })
  })

  describe('mintApiToken', () => {
    it('produces a token that passes isWorkerApiToken', () => {
      const token = mintApiToken()
      expect(isWorkerApiToken(token)).toBe(true)
    })

    it('produces unique tokens across calls', () => {
      const a = mintApiToken()
      const b = mintApiToken()
      expect(a).not.toBe(b)
    })
  })

  describe('loadOrMintIdentity', () => {
    it('mints on first call and reuses the persisted identity on subsequent calls', async () => {
      const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
      const first = await loadOrMintIdentity(getWorkerDb(), vault)
      expect(first.justMinted).toBe(true)
      expect(WORKER_ID_PATTERN.test(first.workerId)).toBe(true)
      expect(isWorkerApiToken(first.token)).toBe(true)

      const second = await loadOrMintIdentity(getWorkerDb(), vault)
      expect(second.justMinted).toBe(false)
      expect(second.workerId).toBe(first.workerId)
      expect(second.token).toBe(first.token)
    })

    it('honours forceId / forceToken overrides on first boot', async () => {
      const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
      const forceId = 'w_abcdefghjkmn'
      const forceToken = `wtk_${'a'.repeat(43)}`
      const result = await loadOrMintIdentity(getWorkerDb(), vault, { forceId, forceToken })
      expect(result.workerId).toBe(forceId)
      expect(String(result.token)).toBe(forceToken)
      expect(result.justMinted).toBe(true)

      // Persistence check — overrides stick.
      const reloaded = await loadOrMintIdentity(getWorkerDb(), vault)
      expect(reloaded.workerId).toBe(forceId)
      expect(String(reloaded.token)).toBe(forceToken)
      expect(reloaded.justMinted).toBe(false)
    })
  })

  describe('printBootstrapIfJustMinted', () => {
    it('writes exactly three stdout lines when justMinted=true, nothing otherwise', async () => {
      const vault = new SecretsVault(MASTER_KEY, getWorkerDb())
      const identity = await loadOrMintIdentity(getWorkerDb(), vault)
      const lines: string[] = []
      const sink = { write: (chunk: string) => void lines.push(chunk) }

      printBootstrapIfJustMinted(identity.workerId, identity.token, getWorkerDb(), true, sink)
      expect(lines.length).toBe(3)
      expect(lines[0]).toBe(`[worker] id=${identity.workerId}\n`)
      expect(lines[1]).toBe(`[worker] AIWORKER_BOOTSTRAP_TOKEN=${identity.token}\n`)
      expect(lines[2]).toBe(`[worker] save this token; it will not be printed again.\n`)

      const silentLines: string[] = []
      const silentSink = { write: (chunk: string) => void silentLines.push(chunk) }
      printBootstrapIfJustMinted(identity.workerId, identity.token, getWorkerDb(), false, silentSink)
      expect(silentLines.length).toBe(0)
    })
  })

  describe('loadOrSeedConfig', () => {
    it('seeds DEFAULT_EMPTY_CONFIG on first call and reuses it on subsequent calls', async () => {
      const first = await loadOrSeedConfig(getWorkerDb())
      expect(first.version).toBe(1)
      expect(first.config).toEqual(DEFAULT_EMPTY_CONFIG)

      const second = await loadOrSeedConfig(getWorkerDb())
      expect(second.version).toBe(1)
      expect(second.config).toEqual(DEFAULT_EMPTY_CONFIG)
    })

    it('returns the shape required by WorkerConfig for DEFAULT_EMPTY_CONFIG', () => {
      expect(DEFAULT_EMPTY_CONFIG.brains).toEqual([])
      expect(DEFAULT_EMPTY_CONFIG.executor.engine).toBe('http')
      expect(DEFAULT_EMPTY_CONFIG.executor.variant).toBe('default')
      expect(DEFAULT_EMPTY_CONFIG.channels).toEqual([])
      expect(DEFAULT_EMPTY_CONFIG.evolution.enabled).toBe(false)
    })
  })
})
