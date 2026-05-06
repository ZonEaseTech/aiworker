import { describe, expect, it } from 'bun:test'

import {
  createSoulPack,
  stripMarkdownFrontmatter,
} from './pack'
import {
  BUILTIN_SOUL_PACKS,
  developerSoulPack,
} from './packs'

describe('Soul Pack loader', () => {
  it('derives built-in Soul modules from Markdown packs', () => {
    expect(BUILTIN_SOUL_PACKS.length).toBeGreaterThan(0)
    for (const pack of BUILTIN_SOUL_PACKS) {
      expect(pack.soulMd).toContain('---')
      expect(pack.soulBody).toContain(`# ${pack.module.manifest.label} Soul`)
      expect(pack.agentMd).toContain(`# ${pack.module.manifest.label} Worker`)
      expect(pack.module.manifest.id.length).toBeGreaterThan(0)
      expect(pack.module.initProjection.responsibilities.length).toBeGreaterThan(0)
    }
  })

  it('keeps the developer pack as editable Markdown plus structured loader output', () => {
    expect(developerSoulPack.sourcePath).toContain('packs/developer/SOUL.md')
    expect(developerSoulPack.soulMd).toContain('manifest:')
    expect(developerSoulPack.soulBody).toContain('Brain admission governance')
    expect(developerSoulPack.module.schemaPack.proposalTypes).toContain('brain-skill-add')
  })

  it('strips YAML frontmatter before LLM-facing projection', () => {
    expect(stripMarkdownFrontmatter('---\na: b\n---\n# Body\n')).toBe('# Body')
    expect(stripMarkdownFrontmatter('# Body\n')).toBe('# Body')
  })

  it('rejects a pack whose declared id does not match its location', () => {
    expect(() => createSoulPack({
      agentMd: '# Agent',
      expectedId: 'other',
      soulMd: developerSoulPack.soulMd,
      sourcePath: 'test/SOUL.md',
    })).toThrow(/expected "other"/)
  })
})
