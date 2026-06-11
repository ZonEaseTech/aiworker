import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  clearPersistedWorkerAccess,
  persistedWorkerAccessPath,
  persistWorkerAccess,
  readPersistedWorkerAccess,
  redactWorkerAccessToken,
} from './access-token-store'

describe('worker access token store', () => {
  let home = ''

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'aiworker-access-token-'))
  })

  afterEach(async () => {
    await rm(home, { force: true, recursive: true })
  })

  const reconnect = {
    access: { mode: 'worker_access' as const, token: 'awt_persisted_secret' },
    assignment: { assignmentId: 'asn_99', workerId: 'wkr_42' },
  }

  it('persists the reconnect triple to <home>/access-token with 0600 mode', async () => {
    await persistWorkerAccess(home, reconnect)
    const file = persistedWorkerAccessPath(home)
    expect(file).toBe(path.join(home, 'access-token'))

    const info = await stat(file)
    // 0o777 masks out the type bits, leaving the permission bits. 0o600 = owner rw only.
    expect(info.mode & 0o777).toBe(0o600)

    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as typeof reconnect
    expect(parsed.access.token).toBe('awt_persisted_secret')
    expect(parsed.assignment.assignmentId).toBe('asn_99')
    expect(parsed.assignment.workerId).toBe('wkr_42')
  })

  it('reads back the persisted reconnect triple', async () => {
    await persistWorkerAccess(home, reconnect)
    const loaded = await readPersistedWorkerAccess(home)
    expect(loaded).toEqual(reconnect)
  })

  it('returns null when no token file exists', async () => {
    expect(await readPersistedWorkerAccess(home)).toBeNull()
  })

  it('returns null when the persisted file is malformed', async () => {
    const file = persistedWorkerAccessPath(home)
    await Bun.write(file, 'not-json')
    expect(await readPersistedWorkerAccess(home)).toBeNull()
  })

  it('clears the persisted token file', async () => {
    await persistWorkerAccess(home, reconnect)
    await clearPersistedWorkerAccess(home)
    expect(await readPersistedWorkerAccess(home)).toBeNull()
  })

  it('clearing a missing file is a no-op (no throw)', async () => {
    await expect(clearPersistedWorkerAccess(home)).resolves.toBeUndefined()
  })

  it('redacts the access token value out of arbitrary log text', () => {
    const line = `tunnel hello token=awt_persisted_secret assignment=asn_99`
    const redacted = redactWorkerAccessToken(line, 'awt_persisted_secret')
    expect(redacted).not.toContain('awt_persisted_secret')
    expect(redacted).toContain('[REDACTED_ACCESS_TOKEN]')
    // non-secret context is preserved
    expect(redacted).toContain('assignment=asn_99')
  })

  it('redaction is a no-op when the token is empty or absent', () => {
    expect(redactWorkerAccessToken('nothing to hide', '')).toBe('nothing to hide')
    expect(redactWorkerAccessToken('plain text', 'awt_other')).toBe('plain text')
  })
})
