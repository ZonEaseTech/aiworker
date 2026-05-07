import { describe, expect, it } from 'bun:test'

import { brainSkillPackSeedFiles, createBrainSkillPack } from './skill-pack'

describe('Brain Skill Pack loader', () => {
  it('loads SKILL.md metadata and materialization path', () => {
    const pack = createBrainSkillPack({
      expectedId: 'developer.codebase-orientation',
      skillMd: [
        '---',
        'id: developer.codebase-orientation',
        'name: Codebase Orientation',
        'description: Build repo context before editing.',
        'version: 0.1.0',
        'capabilities:',
        '  - codebase',
        'permissions:',
        '  - filesystem-read',
        '---',
        '# Codebase Orientation',
        '',
      ].join('\n'),
      sourcePath: 'packs/developer/skills/codebase-orientation/SKILL.md',
    })

    expect(pack.id).toBe('developer.codebase-orientation')
    expect(pack.installPath).toBe('developer.codebase-orientation/SKILL.md')
    expect(pack.metadata.name).toBe('Codebase Orientation')
    expect(pack.metadata.capabilities).toEqual(['codebase'])
    expect(brainSkillPackSeedFiles([pack])).toEqual({
      'developer.codebase-orientation/SKILL.md': expect.stringContaining('# Codebase Orientation'),
    })
  })

  it('rejects id mismatches', () => {
    expect(() => createBrainSkillPack({
      expectedId: 'developer.expected',
      skillMd: [
        '---',
        'id: developer.actual',
        'name: Actual',
        'description: Actual skill.',
        '---',
        'body',
      ].join('\n'),
      sourcePath: 'test/SKILL.md',
    })).toThrow('declares id "developer.actual" but expected "developer.expected"')
  })
})
