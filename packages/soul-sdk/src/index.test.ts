import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { buildSoul, validateSoul } from './index'

describe('Soul SDK builds Paseo workspace templates', () => {
  test('builds descriptor and copies workspace files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'soul-'))
    await writeFile(path.join(root, 'soul.config.ts'), `import { defineSoul } from '${path.resolve(import.meta.dirname, 'index.ts').replaceAll('\\', '/')}'\nexport default defineSoul({ id: 'hr-manager', name: 'HR Manager', version: '1.2.0' })\n`)
    await mkdir(path.join(root, 'engine/workspace'), { recursive: true })
    await writeFile(path.join(root, 'engine/workspace/AGENTS.md'), '# HR\n')
    await mkdir(path.join(root, 'engine/skills/review'), { recursive: true })
    await writeFile(path.join(root, 'engine/skills/review/SKILL.md'), '# Review\n')
    await mkdir(path.join(root, 'engine/mcp/codex'), { recursive: true })
    await writeFile(path.join(root, 'engine/mcp/codex/config.toml'), '[mcp_servers]\n')

    const result = await buildSoul(root)
    expect(result.descriptor.workspaceTemplate.root).toBe('dist/workspace-template')
    expect(result.descriptor.workspaceTemplate.entryFiles).toEqual(['AGENTS.md'])
    expect(await readFile(path.join(root, 'dist/workspace-template/AGENTS.md'), 'utf8')).toContain('HR')
  })

  test('validates missing config honestly', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'soul-'))
    const result = await validateSoul(root)
    expect(result.status).toBe('invalid')
    expect(result.issues[0]?.code).toBe('missing_config')
  })

  test('rejects literal provider secrets before writing distributable template artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'soul-'))
    await writeFile(path.join(root, 'soul.config.ts'), `import { defineSoul } from '${path.resolve(import.meta.dirname, 'index.ts').replaceAll('\\', '/')}'\nexport default defineSoul({ id: 'bad-secret', name: 'Bad Secret' })\n`)
    await mkdir(path.join(root, 'engine/workspace'), { recursive: true })
    await writeFile(path.join(root, 'engine/workspace/AGENTS.md'), 'OPENAI_API_KEY=sk-abc123456789\n')

    await expect(buildSoul(root)).rejects.toThrow('must not contain literal provider secrets')
    expect(existsSync(path.join(root, 'dist'))).toBe(false)
  })
})
