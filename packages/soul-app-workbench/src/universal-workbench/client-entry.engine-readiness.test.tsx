import type { LocalWorkspace } from '@zonease/aiworker-shared'

import { describe, expect, it, mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { loadMountedEngineReadiness } from './client-entry'
import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

const vi = { fn: mock }

describe('universal workbench mounted engine readiness', () => {
  it('loads readiness from Host local settings and rejects an uninstalled selected engine', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return Response.json({
        engineId: 'codex',
        engines: [{
          command: 'codex',
          id: 'codex',
          installed: false,
          name: 'Codex CLI',
          path: null,
          version: null,
        }],
        executionMode: 'local-cli',
      })
    }) as unknown as typeof fetch

    try {
      await expect(loadMountedEngineReadiness()).resolves.toEqual({
        detail: 'Codex CLI is selected but not installed on PATH.',
        label: 'Codex CLI · Not installed',
        ready: false,
      })
      expect(requestedUrls).toEqual(['/api/local/settings/engines'])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('surfaces the real selected engine details when Host settings are ready', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({
      engineId: 'codex',
      engines: [{
        command: 'codex',
        id: 'codex',
        installed: true,
        name: 'Codex CLI',
        path: '/usr/local/bin/codex',
        version: 'codex 1.0.0',
      }],
      executionMode: 'local-cli',
    })) as unknown as typeof fetch

    try {
      await expect(loadMountedEngineReadiness()).resolves.toEqual({
        detail: 'Codex CLI is ready for session turns.',
        label: 'Codex CLI',
        ready: true,
      })
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('keeps readiness false when BYOK execution is not configured', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({
      byok: {
        apiKeyRefPresent: false,
        model: 'gpt-4o',
        provider: 'openai-compatible',
      },
      engineId: 'codex',
      engines: [],
      executionMode: 'byok',
    })) as unknown as typeof fetch

    try {
      await expect(loadMountedEngineReadiness()).resolves.toEqual({
        detail: 'Configure a BYOK provider, model, and API key reference in Settings before starting a session turn.',
        label: 'openai-compatible · gpt-4o',
        ready: false,
      })
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('disables the workspace composer when engine readiness is false', () => {
    const workspace = workspaceFixture()

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Codex CLI is selected but not installed on PATH.', label: 'Codex CLI · Not installed', ready: false }}
        events={[]}
        selectedSessionId={null}
        sessions={[]}
        templates={[{ id: 'aiworker-qa.release-gate', name: 'Release Gate' }]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn(async () => {})}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('Codex CLI is selected but not installed on PATH.')
    expect(html).toContain('aria-label="New session input"')
    expect(html).toContain('disabled=""')
  })
})

function workspaceFixture(): LocalWorkspace {
  return {
    createdAt: '2026-05-23T00:00:00.000Z',
    id: 'workspace-1',
    metadataJson: {},
    name: 'Universal Workspace',
    rootPath: '/tmp/aiworker/workspace-1',
    sourcePointersJson: [],
    status: 'active',
    type: 'workspace',
    updatedAt: '2026-05-23T00:00:00.000Z',
    workerId: 'worker-1',
  }
}
