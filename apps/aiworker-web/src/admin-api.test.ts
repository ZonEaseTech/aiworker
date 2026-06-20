import { existsSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, test } from 'bun:test'

import { ensureControlPlaneDirEnv } from '@/admin-api'

// ensureControlPlaneDirEnv mutates process.env; always scrub the key so the
// default-resolution branch never leaks into the other web tests that rely on
// controlPlaneDirFromEnv being unset (fixture mode).
afterEach(() => {
  delete process.env.AIWORKER_CONTROL_PLANE_DIR
})

describe('ensureControlPlaneDirEnv boot default', () => {
  test('resolves <AIWORKER_HOME>/control-plane, creates it, and sets the env on a caller env object', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-boot-home-'))
    try {
      const env: NodeJS.ProcessEnv = { AIWORKER_HOME: home }
      const resolved = ensureControlPlaneDirEnv(env)
      const expected = path.join(home, 'control-plane')
      expect(resolved).toBe(expected)
      expect(existsSync(expected)).toBe(true)
      expect(env.AIWORKER_CONTROL_PLANE_DIR).toBe(expected)
    }
    finally {
      rmSync(home, { force: true, recursive: true })
    }
  })

  test('returns an explicit AIWORKER_CONTROL_PLANE_DIR unchanged without overwriting it', () => {
    const env: NodeJS.ProcessEnv = {
      AIWORKER_CONTROL_PLANE_DIR: '/already/set/control-plane',
      AIWORKER_HOME: '/some/other/home',
    }
    const resolved = ensureControlPlaneDirEnv(env)
    expect(resolved).toBe('/already/set/control-plane')
    expect(env.AIWORKER_CONTROL_PLANE_DIR).toBe('/already/set/control-plane')
  })
})
