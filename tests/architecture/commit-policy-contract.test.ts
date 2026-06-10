import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'bun:test'

const repoRoot = resolve(import.meta.dirname, '../..')
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('commit policy tooling contract', () => {
  test('declares commitlint and husky as root development tooling', () => {
    expect(packageJson.scripts?.prepare).toBe('husky')
    expect(packageJson.scripts?.commitlint).toBe('commitlint')
    expect(packageJson.devDependencies).toHaveProperty('@commitlint/cli')
    expect(packageJson.devDependencies).toHaveProperty('@commitlint/config-conventional')
    expect(packageJson.devDependencies).toHaveProperty('husky')
  })

  test('uses the conventional commits commitlint preset', async () => {
    const configPath = resolve(repoRoot, 'commitlint.config.js')
    expect(existsSync(configPath)).toBe(true)

    const configModule = await import(`${pathToFileURL(configPath).href}?contract=${Date.now()}`)
    expect(configModule.default).toEqual({
      extends: ['@commitlint/config-conventional'],
    })
  })

  test('keeps the Husky commit-msg hook minimal and v9-compatible', () => {
    const hookPath = resolve(repoRoot, '.husky/commit-msg')
    expect(existsSync(hookPath)).toBe(true)

    const hook = readFileSync(hookPath, 'utf8')
    expect(hook).toContain('run commitlint --edit "$1"')
    expect(hook).toContain('BUN_INSTALL')
    expect(hook).toContain('$HOME/.bun/bin/bun')
    expect(hook).not.toContain('husky.sh')
    expect(hook).not.toMatch(/\bhusky\s+(install|add)\b/)
    expect(statSync(hookPath).mode & 0o111).not.toBe(0)
  })

  test('resolves Bun from BUN_INSTALL when Git hook PATH does not include Bun', () => {
    const hookPath = resolve(repoRoot, '.husky/commit-msg')
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'aiworker-commit-hook-'))

    try {
      const fakeBinDir = resolve(tempRoot, 'bin')
      const fakeBun = resolve(fakeBinDir, 'bun')
      const messagePath = resolve(tempRoot, 'COMMIT_EDITMSG')
      const capturePath = resolve(tempRoot, 'bun-args.txt')

      mkdirSync(fakeBinDir)
      writeFileSync(messagePath, 'feat: test hook\n')
      writeFileSync(
        fakeBun,
        [
          '#!/bin/sh',
          'printf "%s\\n" "$@" > "$BUN_HOOK_CAPTURE"',
          '',
        ].join('\n'),
      )
      chmodSync(fakeBun, 0o755)

      const result = spawnSync('/bin/sh', [hookPath, messagePath], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          BUN_HOOK_CAPTURE: capturePath,
          BUN_INSTALL: tempRoot,
          PATH: resolve(tempRoot, 'path-without-bun'),
        },
      })

      expect(result.status).toBe(0)
      expect(readFileSync(capturePath, 'utf8').trim().split('\n')).toEqual([
        'run',
        'commitlint',
        '--edit',
        messagePath,
      ])
    }
    finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  test('resolves Bun from the default HOME install when Git hook env omits Bun setup', () => {
    const hookPath = resolve(repoRoot, '.husky/commit-msg')
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'aiworker-commit-hook-'))

    try {
      const fakeBinDir = resolve(tempRoot, '.bun/bin')
      const fakeBun = resolve(fakeBinDir, 'bun')
      const messagePath = resolve(tempRoot, 'COMMIT_EDITMSG')
      const capturePath = resolve(tempRoot, 'bun-args.txt')

      mkdirSync(fakeBinDir, { recursive: true })
      writeFileSync(messagePath, 'feat: test hook\n')
      writeFileSync(
        fakeBun,
        [
          '#!/bin/sh',
          'printf "%s\\n" "$@" > "$BUN_HOOK_CAPTURE"',
          '',
        ].join('\n'),
      )
      chmodSync(fakeBun, 0o755)

      const result = spawnSync('/bin/sh', [hookPath, messagePath], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          BUN_HOOK_CAPTURE: capturePath,
          BUN_INSTALL: '',
          HOME: tempRoot,
          PATH: resolve(tempRoot, 'path-without-bun'),
        },
      })

      expect(result.status).toBe(0)
      expect(readFileSync(capturePath, 'utf8').trim().split('\n')).toEqual([
        'run',
        'commitlint',
        '--edit',
        messagePath,
      ])
    }
    finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  test('validates Conventional Commit messages through the repo script', () => {
    const valid = spawnSync('bun', ['run', 'commitlint'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: 'feat: add commit policy\n',
    })
    expect(valid.status).toBe(0)

    const invalid = spawnSync('bun', ['run', 'commitlint'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: 'add commit policy\n',
    })
    expect(invalid.status).toBe(1)
    expect(`${invalid.stdout}\n${invalid.stderr}`).toContain('subject may not be empty')
  })

  test('disables Husky installation in GitHub Actions jobs', () => {
    for (const workflowName of ['lint.yml', 'release.yml']) {
      const workflow = readFileSync(resolve(repoRoot, '.github/workflows', workflowName), 'utf8')
      expect(workflow).toContain('HUSKY: 0')
    }
  })
})
