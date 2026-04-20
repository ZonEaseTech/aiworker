import type { Skill } from './types'

const mockSkills: Skill[] = [
  {
    id: 'skill-001',
    name: 'code-review',
    description: 'Automated code review using LLM analysis',
    version: '1.0.0',
    capabilities: ['review', 'suggest', 'explain'],
    source: 'hermes',
  },
  {
    id: 'skill-002',
    name: 'test-generator',
    description: 'Generate unit tests for source files',
    version: '0.9.0',
    capabilities: ['generate', 'validate'],
    source: 'openclaw',
  },
  {
    id: 'skill-003',
    name: 'doc-writer',
    description: 'Generate documentation from code',
    version: '1.1.0',
    capabilities: ['generate', 'format'],
    source: 'local',
  },
]

export function listSkills() {
  return { skills: mockSkills, total: mockSkills.length }
}

export function getSkill(name: string) {
  return mockSkills.find(s => s.name === name) ?? null
}

export function triggerSync() {
  return { status: 'completed' as const, synced: 3, conflicts: 0 }
}
