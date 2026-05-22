import { describe, expect, it } from 'bun:test'

import {
  localComposerMentionSchema,
  localWorkerOverlayAssetSchema,
  localWorkerOverlaySaveSchema,
  localWorkerOverlaySchema,
} from './index'

describe('local worker overlay schema', () => {
  it('accepts worker-owned skill, MCP, and entry overlays', () => {
    const parsed = localWorkerOverlaySchema.parse({
      assets: [
        {
          content: '# Interview brief\n',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          source: 'overlay',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          content: '[mcp_servers.ats]\ncommand = "uvx"\n',
          enabled: false,
          id: 'codex-ats',
          kind: 'mcp-client',
          source: 'overlay',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          content: '# Worker Instructions\n',
          enabled: true,
          id: 'AGENTS.md',
          kind: 'entry-file',
          source: 'overlay',
          target: 'workspace',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
      ],
      workerId: 'worker-1',
    })

    expect(parsed.assets.map(asset => asset.kind)).toEqual(['skill', 'mcp-client', 'entry-file'])
  })

  it('defaults worker overlay asset metadata to an empty object', () => {
    const parsed = localWorkerOverlayAssetSchema.parse({
      content: '# Interview brief\n',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      source: 'overlay',
      target: 'codex',
      updatedAt: '2026-05-21T00:00:00.000Z',
    })

    expect(parsed.metadataJson).toEqual({})
  })

  it('defaults parsed overlay asset metadata inside a worker overlay', () => {
    const parsed = localWorkerOverlaySchema.parse({
      assets: [
        {
          content: '# Worker Instructions\n',
          enabled: true,
          id: 'AGENTS.md',
          kind: 'entry-file',
          source: 'overlay',
          target: 'workspace',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
      ],
      workerId: 'worker-1',
    })

    expect(parsed.assets[0]?.metadataJson).toEqual({})
  })

  it('defaults saved overlay assets to overlay source', () => {
    const parsed = localWorkerOverlaySaveSchema.parse({
      assets: [
        {
          content: '# Interview brief\n',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          metadataJson: {},
          target: 'codex',
        },
      ],
    })

    expect(parsed.assets[0]?.source).toBe('overlay')
  })

  it('rejects baseline source for saved overlay assets', () => {
    expect(() => localWorkerOverlaySaveSchema.parse({
      assets: [
        {
          content: '# Interview brief\n',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          metadataJson: {},
          source: 'baseline',
          target: 'codex',
        },
      ],
    })).toThrow()
  })

  it('parses composer skill mentions with ranges', () => {
    const parsed = localComposerMentionSchema.parse({
      id: 'interview-brief',
      kind: 'skill',
      label: '$interview-brief',
      range: {
        end: 16,
        start: 0,
      },
    })

    expect(parsed.range).toEqual({ end: 16, start: 0 })
  })
})
