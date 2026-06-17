import { describe, expect, test } from 'bun:test'
import { parseSoulDescriptorV1, SOUL_DESCRIPTOR_V1_PROTOCOL } from './index'

describe('Soul descriptor as Paseo workspace template', () => {
  test('accepts only workspace-template assets', () => {
    const descriptor = parseSoulDescriptorV1({
      protocol: SOUL_DESCRIPTOR_V1_PROTOCOL,
      identity: { id: 'hr-manager', name: 'HR Manager', version: '1.0.0' },
      workspaceTemplate: {
        entryFiles: ['AGENTS.md', 'CLAUDE.md'],
        mcpFiles: ['.mcp.json'],
        root: 'dist/workspace-template',
        skillDirs: ['skills/hr'],
      },
    })
    expect(descriptor.workspaceTemplate.root).toBe('dist/workspace-template')
  })

  test('rejects runtime/workbench descriptor concepts by strict schema', () => {
    expect(() => parseSoulDescriptorV1({
      protocol: SOUL_DESCRIPTOR_V1_PROTOCOL,
      identity: { id: 'bad', name: 'Bad' },
      workspaceTemplate: { root: 'dist/workspace-template' },
      workbench: { route: '/chat' },
    })).toThrow()
  })
})
