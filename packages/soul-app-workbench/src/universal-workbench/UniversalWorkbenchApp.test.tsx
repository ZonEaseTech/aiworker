import type { LocalWorkspace } from '@zonease/aiworker-shared'

import { describe, expect, it, mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

const vi = { fn: mock }

describe('UniversalWorkbenchApp', () => {
  it('renders the managed session composer for a selected workspace without raw new-session form markup', () => {
    const workspace: LocalWorkspace = {
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

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[]}
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

    expect(html).toContain('data-slot="session-composer"')
    expect(html).toContain('What do you want to work on?')
    expect(html).not.toContain('class="flex w-full max-w-xl gap-2"')
  })
})
