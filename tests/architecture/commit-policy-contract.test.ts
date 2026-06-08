import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
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
    expect(hook).toContain('bun run commitlint --edit "$1"')
    expect(hook).not.toContain('husky.sh')
    expect(hook).not.toMatch(/\bhusky\s+(install|add)\b/)
    expect(statSync(hookPath).mode & 0o111).not.toBe(0)
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
