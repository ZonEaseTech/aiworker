import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'bun:test'

import { FilesystemBrainProvider } from './index'
import { scanSkills } from './scanner'

describe('filesystem brain skill scanner', () => {
  it('loads only SKILL.md entrypoints and ignores sidecar Markdown', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-skill-scan-'))
    await mkdir(path.join(root, 'skills', 'developer.codebase-orientation', 'references'), { recursive: true })
    await writeFile(
      path.join(root, 'skills', 'developer.codebase-orientation', 'SKILL.md'),
      [
        '---',
        'id: developer.codebase-orientation',
        'name: Codebase Orientation',
        'description: Build repo context before editing.',
        'version: 0.1.0',
        'capabilities:',
        '  - codebase',
        '---',
        '# Codebase Orientation',
        '',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      path.join(root, 'skills', 'developer.codebase-orientation', 'references', 'notes.md'),
      [
        '---',
        'name: Sidecar',
        'description: Must not become a skill.',
        '---',
        '# Sidecar',
        '',
      ].join('\n'),
      'utf8',
    )

    const skills = await scanSkills(root)

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      body: '# Codebase Orientation',
      capabilities: ['codebase'],
      id: 'developer.codebase-orientation',
      name: 'Codebase Orientation',
      version: '0.1.0',
    })
  })

  it('derives stable ids from package directories when frontmatter omits id', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-skill-scan-'))
    await mkdir(path.join(root, 'skills', 'smoke'), { recursive: true })
    await writeFile(
      path.join(root, 'skills', 'smoke', 'SKILL.md'),
      [
        '---',
        'name: Smoke Skill',
        'description: Runtime smoke skill.',
        '---',
        '# Smoke',
        '',
      ].join('\n'),
      'utf8',
    )

    const skills = await scanSkills(root)

    expect(skills).toHaveLength(1)
    expect(skills[0]?.id).toBe('smoke')
  })

  it('loads a skill body by stable id with frontmatter stripped', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-skill-load-'))
    await mkdir(path.join(root, 'skills', 'kernel.brain-admission'), { recursive: true })
    await writeFile(
      path.join(root, 'skills', 'kernel.brain-admission', 'SKILL.md'),
      [
        '---',
        'id: kernel.brain-admission',
        'name: Brain Admission',
        'description: Propose durable Brain changes through admission.',
        'version: 0.1.0',
        '---',
        '# Brain Admission',
        '',
        '- Create pending proposals before durable writes.',
        '',
      ].join('\n'),
      'utf8',
    )

    const provider = new FilesystemBrainProvider({ home: root })
    const skill = await provider.loadSkill('kernel.brain-admission')

    expect(skill).toMatchObject({
      body: '# Brain Admission\n\n- Create pending proposals before durable writes.',
      description: 'Propose durable Brain changes through admission.',
      id: 'kernel.brain-admission',
      name: 'Brain Admission',
      version: '0.1.0',
    })
  })
})
