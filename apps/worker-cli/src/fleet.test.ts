import type { LocalPaths } from './aiworker'
import type { FleetIndex } from './fleet'

import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  adoptLegacyHome,
  allocatePort,
  buildLocalPaths,
  FLEET_ADOPTED_HOME,
  FLEET_DEFAULT_BASE_PORT,
  fleetIndexPath,
  fleetWorkerPaths,
  readFleet,
  resolveDefault,
  resolveTargets,
  resolveWorkerHome,
  setDefault,
  upsertFleetWorker,
  workerHomeDir,
  writeFleet,
} from './fleet'

describe('fleet index', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-fleet-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function worker(overrides: Partial<FleetIndex['workers'][number]> = {}) {
    return {
      app: 'aiworker-freeform',
      createdAt: '2026-01-01T00:00:00.000Z',
      home: 'workers/hr',
      id: 'hr',
      port: FLEET_DEFAULT_BASE_PORT,
      ...overrides,
    }
  }

  describe('readFleet / writeFleet', () => {
    it('returns an empty index when no fleet.json exists', () => {
      const index = readFleet(root)
      expect(index).toEqual({ default: null, version: 1, workers: [] })
      expect(existsSync(fleetIndexPath(root))).toBe(false)
    })

    it('round-trips a written index', () => {
      const index: FleetIndex = {
        default: 'hr',
        version: 1,
        workers: [worker(), worker({ home: 'workers/ga', id: 'ga', port: 9218 })],
      }
      writeFleet(root, index)
      expect(existsSync(fleetIndexPath(root))).toBe(true)
      expect(readFleet(root)).toEqual(index)
    })

    it('returns an empty index when fleet.json is corrupt', () => {
      writeFileSync(fleetIndexPath(root), '{ not json')
      expect(readFleet(root)).toEqual({ default: null, version: 1, workers: [] })
    })

    it('drops a dangling default that no longer references a worker', () => {
      writeFileSync(fleetIndexPath(root), JSON.stringify({
        default: 'ghost',
        version: 1,
        workers: [worker()],
      }))
      expect(readFleet(root).default).toBeNull()
    })
  })

  describe('allocatePort', () => {
    it('returns the base port for an empty index', () => {
      expect(allocatePort({ default: null, version: 1, workers: [] })).toBe(9217)
    })

    it('skips already-registered ports and returns the smallest free one', () => {
      const index: FleetIndex = {
        default: 'a',
        version: 1,
        workers: [worker({ id: 'a', port: 9217 }), worker({ id: 'b', port: 9218 })],
      }
      expect(allocatePort(index)).toBe(9219)
    })

    it('fills a gap left by a non-contiguous registered port', () => {
      const index: FleetIndex = {
        default: 'a',
        version: 1,
        workers: [worker({ id: 'a', port: 9217 }), worker({ id: 'b', port: 9219 })],
      }
      expect(allocatePort(index)).toBe(9218)
    })

    it('honors a custom base', () => {
      expect(allocatePort({ default: null, version: 1, workers: [] }, 4000)).toBe(4000)
    })
  })

  describe('resolveDefault', () => {
    it('returns null for an empty index', () => {
      expect(resolveDefault({ default: null, version: 1, workers: [] })).toBeNull()
    })

    it('returns the named default when present', () => {
      const index: FleetIndex = {
        default: 'ga',
        version: 1,
        workers: [worker({ id: 'hr' }), worker({ home: 'workers/ga', id: 'ga', port: 9218 })],
      }
      expect(resolveDefault(index)?.id).toBe('ga')
    })

    it('falls back to the first worker when default is null', () => {
      const index: FleetIndex = {
        default: null,
        version: 1,
        workers: [worker({ id: 'hr' }), worker({ id: 'ga' })],
      }
      expect(resolveDefault(index)?.id).toBe('hr')
    })
  })

  describe('resolveTargets', () => {
    const index: FleetIndex = {
      default: 'ga',
      version: 1,
      workers: [worker({ id: 'hr' }), worker({ home: 'workers/ga', id: 'ga', port: 9218 })],
    }

    it('returns the default with no args', () => {
      expect(resolveTargets(index).map(w => w.id)).toEqual(['ga'])
    })

    it('returns the named worker for an id', () => {
      expect(resolveTargets(index, { id: 'hr' }).map(w => w.id)).toEqual(['hr'])
    })

    it('returns all workers for --all', () => {
      expect(resolveTargets(index, { all: true }).map(w => w.id)).toEqual(['hr', 'ga'])
    })

    it('throws for an unknown id', () => {
      expect(() => resolveTargets(index, { id: 'nope' })).toThrow('fleet worker not found: nope')
    })

    it('returns an empty array for an empty index with no args', () => {
      expect(resolveTargets({ default: null, version: 1, workers: [] })).toEqual([])
    })
  })

  describe('upsertFleetWorker / setDefault', () => {
    it('appends a new worker and makes the first one default', () => {
      const next = upsertFleetWorker({ default: null, version: 1, workers: [] }, worker())
      expect(next.workers.map(w => w.id)).toEqual(['hr'])
      expect(next.default).toBe('hr')
    })

    it('replaces an existing worker by id and keeps the default', () => {
      const base = upsertFleetWorker({ default: null, version: 1, workers: [] }, worker())
      const next = upsertFleetWorker(base, worker({ port: 9300 }))
      expect(next.workers).toEqual([worker({ port: 9300 })])
      expect(next.default).toBe('hr')
    })

    it('sets the default to a registered worker', () => {
      const index: FleetIndex = {
        default: 'hr',
        version: 1,
        workers: [worker({ id: 'hr' }), worker({ id: 'ga' })],
      }
      expect(setDefault(index, 'ga').default).toBe('ga')
    })

    it('throws when setting default to an unknown worker', () => {
      expect(() => setDefault({ default: null, version: 1, workers: [worker()] }, 'nope'))
        .toThrow('fleet worker not found: nope')
    })
  })

  describe('workerHomeDir / fleetWorkerPaths', () => {
    it('derives a per-worker home under workers/<id>', () => {
      expect(workerHomeDir(root, 'hr')).toBe(path.join(root, 'workers', 'hr'))
    })

    it('resolves an adopted (home ".") worker to the fleet root', () => {
      const adopted = worker({ home: FLEET_ADOPTED_HOME, id: 'freeform' })
      expect(resolveWorkerHome(root, adopted)).toBe(root)
    })

    it('derives standalone LocalPaths for a fleet worker (db pinned to its own home)', () => {
      const paths: LocalPaths = fleetWorkerPaths(root, worker({ home: 'workers/hr', id: 'hr' }))
      const home = path.join(root, 'workers', 'hr')
      expect(paths).toEqual({
        daemonMetaFile: path.join(home, 'aiworker-daemon.json'),
        dbPath: path.join(home, 'aiworker.db'),
        home,
        logFile: path.join(home, 'aiworker-daemon.log'),
        pidFile: path.join(home, 'aiworker-daemon.pid'),
        workersRoot: path.join(home, 'workers'),
      })
    })

    it('buildLocalPaths ignores WORKER_DB_PATH so fleet workers never collapse onto one DB', () => {
      const original = process.env.WORKER_DB_PATH
      process.env.WORKER_DB_PATH = '/tmp/pinned.db'
      try {
        const home = path.join(root, 'workers', 'hr')
        expect(buildLocalPaths(home).dbPath).toBe(path.join(home, 'aiworker.db'))
      }
      finally {
        if (original === undefined)
          delete process.env.WORKER_DB_PATH
        else
          process.env.WORKER_DB_PATH = original
      }
    })
  })

  describe('adoptLegacyHome', () => {
    it('registers a legacy default home in place (home ".") as the first worker', () => {
      // Simulate a legacy single-home install: an aiworker.db file at the root.
      writeFileSync(buildLocalPaths(root).dbPath, '')
      const index = adoptLegacyHome(root, {
        now: () => new Date('2026-02-02T00:00:00.000Z'),
        readLegacyPort: () => 9300,
        readLegacyWorker: () => ({ app: 'aiworker-freeform', id: 'legacy' }),
      })
      expect(index.workers).toEqual([
        {
          app: 'aiworker-freeform',
          createdAt: '2026-02-02T00:00:00.000Z',
          home: FLEET_ADOPTED_HOME,
          id: 'legacy',
          port: 9300,
        },
      ])
      expect(index.default).toBe('legacy')
      // Persisted to fleet.json.
      expect(readFleet(root).workers.map(w => w.id)).toEqual(['legacy'])
    })

    it('defaults the adopted port to the base when no daemon.json port is found', () => {
      writeFileSync(buildLocalPaths(root).dbPath, '')
      const index = adoptLegacyHome(root, {
        readLegacyPort: () => null,
        readLegacyWorker: () => ({ app: 'aiworker-freeform', id: 'legacy' }),
      })
      expect(index.workers.map(w => w.port)).toEqual([FLEET_DEFAULT_BASE_PORT])
    })

    it('is a no-op when a fleet.json already exists', () => {
      const existing: FleetIndex = { default: 'hr', version: 1, workers: [worker()] }
      writeFleet(root, existing)
      writeFileSync(buildLocalPaths(root).dbPath, '')
      const index = adoptLegacyHome(root, {
        readLegacyWorker: () => ({ app: 'other', id: 'should-not-adopt' }),
      })
      expect(index).toEqual(existing)
    })

    it('is a no-op when there is no legacy DB', () => {
      const index = adoptLegacyHome(root, {
        readLegacyWorker: () => ({ app: 'aiworker-freeform', id: 'legacy' }),
      })
      expect(index.workers).toEqual([])
      expect(existsSync(fleetIndexPath(root))).toBe(false)
    })

    it('is a no-op when the legacy DB has no registrable worker', () => {
      writeFileSync(buildLocalPaths(root).dbPath, '')
      const index = adoptLegacyHome(root, {
        readLegacyWorker: () => null,
      })
      expect(index.workers).toEqual([])
      expect(existsSync(fleetIndexPath(root))).toBe(false)
    })
  })
})
