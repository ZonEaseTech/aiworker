import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'bun:test'

const sourceShim = path.resolve(import.meta.dir, 'aiworker-bin-shim.sh')

function makeFixture(): { root: string, shim: string } {
  const root = path.join(tmpdir(), `aiworker-bin-shim-${randomUUID()}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, 'aiworker-bun.js'), '# fake bun bundle\n')
  const shim = path.join(root, 'aiworker')
  copyFileSync(sourceShim, shim)
  chmodSync(shim, 0o755)
  return { root, shim }
}

function runShim(shim: string, args: string[], env: Record<string, string>): {
  exitCode: number
  stderr: string
  stdout: string
} {
  const proc = Bun.spawnSync([shim, ...args], {
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const decoder = new TextDecoder()
  return {
    exitCode: proc.exitCode,
    stderr: decoder.decode(proc.stderr),
    stdout: decoder.decode(proc.stdout),
  }
}

describe('aiworker npm bin shim', () => {
  it('prints an actionable message when Bun is unavailable', () => {
    const fixture = makeFixture()
    try {
      const result = runShim(fixture.shim, ['-h'], {
        BUN_INSTALL: path.join(fixture.root, 'missing-bun-install'),
        HOME: path.join(fixture.root, 'home'),
        PATH: '/usr/bin:/bin',
      })

      expect(result.exitCode).toBe(127)
      expect(result.stderr).toContain('Bun runtime was not found')
      expect(result.stderr).toContain('npx @zonease/aiworker-cli -h')
      expect(result.stderr).toContain('bunx @zonease/aiworker-cli -h')
      expect(result.stderr).toContain('AIWORKER_BUN_BIN=/path/to/bun')
    }
    finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('forwards argv to the Bun bundle and preserves the exit code', () => {
    const fixture = makeFixture()
    try {
      const fakeBun = path.join(fixture.root, 'fake-bun')
      const argvLog = path.join(fixture.root, 'argv.log')
      writeFileSync(fakeBun, `#!/bin/sh
printf '%s\\n' "$@" > "$AIWORKER_SHIM_ARGV_LOG"
printf 'fake bun invoked\\n'
exit 7
`)
      chmodSync(fakeBun, 0o755)

      const result = runShim(fixture.shim, ['--version', '--verbose'], {
        AIWORKER_BUN_BIN: fakeBun,
        AIWORKER_SHIM_ARGV_LOG: argvLog,
        HOME: path.join(fixture.root, 'home'),
        PATH: '/usr/bin:/bin',
      })

      expect(result.exitCode).toBe(7)
      expect(result.stdout).toContain('fake bun invoked')
      expect(readFileSync(argvLog, 'utf8').trim().split('\n')).toEqual([
        realpathSync(path.join(fixture.root, 'aiworker-bun.js')),
        '--version',
        '--verbose',
      ])
    }
    finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
