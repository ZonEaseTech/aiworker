import { describe, expect, it } from 'bun:test'

import {
  localComposerMentionSchema,
  localEngineInvocationSchema,
  localWorkerOverlayAssetSchema,
  localWorkerOverlaySaveSchema,
  localWorkerOverlaySchema,
} from './index'

describe('local worker overlay schema', () => {
  it('accepts worker-owned skill, MCP, and entry overlays', () => {
    const parsed = localWorkerOverlaySchema.parse({
      assets: [
        {
          checksum: 'sha256:skill',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          source: 'overlay',
          sourceRef: 'descriptor://engine/skills/interview-brief',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          checksum: 'sha256:mcp',
          enabled: false,
          id: 'codex-ats',
          kind: 'mcp-client',
          source: 'overlay',
          sourceRef: 'descriptor://engine/mcp/codex-ats',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          checksum: 'sha256:entry',
          enabled: true,
          id: 'AGENTS.md',
          kind: 'entry-file',
          source: 'overlay',
          sourceRef: 'descriptor://engine/workspace/AGENTS.md',
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
      checksum: 'sha256:skill',
      enabled: true,
      id: 'interview-brief',
      kind: 'skill',
      source: 'overlay',
      sourceRef: 'descriptor://engine/skills/interview-brief',
      target: 'codex',
      updatedAt: '2026-05-21T00:00:00.000Z',
    })

    expect(parsed.metadataJson).toEqual({})
    expect(parsed).not.toHaveProperty('content')
  })

  it('defaults parsed overlay asset metadata inside a worker overlay', () => {
    const parsed = localWorkerOverlaySchema.parse({
      assets: [
        {
          checksum: 'sha256:entry',
          enabled: true,
          id: 'AGENTS.md',
          kind: 'entry-file',
          source: 'overlay',
          sourceRef: 'descriptor://engine/workspace/AGENTS.md',
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
          checksum: 'sha256:skill',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          metadataJson: {},
          sourceRef: 'descriptor://engine/skills/interview-brief',
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
          checksum: 'sha256:skill',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          metadataJson: {},
          source: 'baseline',
          sourceRef: 'descriptor://engine/skills/interview-brief',
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

  it('accepts session-level engine invocations without turn rows', () => {
    const parsed = localEngineInvocationSchema.parse({
      id: 'invocation-1',
      sessionId: 'session-1',
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex',
      status: 'succeeded',
      processState: 'exited',
      projectionReceiptId: null,
      externalSessionRef: 'codex://thread/thread-1',
      rawLogRef: 'aiworker://logs/invocation-1/raw.log',
      eventLogRef: 'aiworker://logs/invocation-1/events.ndjson',
      failureCode: null,
      inputRef: 'aiworker://sessions/session-1/invocations/invocation-1/input',
      summary: 'done',
      error: null,
      metadataJson: {},
      startedAt: '2026-05-21T00:00:00.000Z',
      finishedAt: '2026-05-21T00:00:01.000Z',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:01.000Z',
    })

    expect(parsed).not.toHaveProperty('turnId')
    expect(parsed).not.toHaveProperty('prompt')
  })
})
