import type { BrainSkill } from '@zonease/aiworker-shared'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'bun:test'
import { CapabilityRegistry, planCapabilities } from './capabilities'

describe('CapabilityRegistry', () => {
  const originalCwd = process.cwd()
  const originalHome = process.env.AIWORKER_HOME

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = originalHome
  })

  it('reads project mcp and toolset descriptors without enabling tools', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-capabilities-'))
    const aiworkerRoot = path.join(projectRoot, '.aiworker')
    await fs.mkdir(aiworkerRoot, { recursive: true })
    await fs.writeFile(path.join(aiworkerRoot, 'toolsets.json'), `${JSON.stringify({
      defaultToolsets: ['memory', 'web'],
    })}\n`)
    await fs.writeFile(path.join(aiworkerRoot, 'mcp.json'), `${JSON.stringify({
      servers: {
        docs: {
          description: 'Documentation MCP',
          tools: [
            { name: 'docs.search', description: 'Search docs' },
          ],
        },
      },
    })}\n`)
    delete process.env.AIWORKER_HOME
    process.chdir(projectRoot)

    const skills: BrainSkill[] = [
      { id: 'skill-dev', name: 'developer', description: 'Code work helper', version: '1.0.0', tags: ['code'] },
    ]
    const registry = await new CapabilityRegistry({ workerId: 'w_capability_test' }).snapshot({ skills })
    expect(registry.toolsets).toEqual(['memory', 'web'])
    expect(registry.mcpTools).toEqual([
      { server: 'docs', name: 'docs.search', description: 'Search docs' },
    ])

    const plan = planCapabilities({
      intent: 'code_work',
      promptSkillLimit: 10,
      registry,
      requiredContext: ['memory_search', 'mcp_tools', 'skill_load'],
    })
    expect(plan.selectedBuiltins).toEqual(['load_skill', 'memory_search'])
    expect(plan.selectedMcpTools).toEqual(['docs.search'])
    expect(plan.selectedSkills).toEqual([
      { id: 'skill-dev', name: 'developer', description: 'Code work helper', version: '1.0.0', tags: ['code'] },
    ])
  })
})
