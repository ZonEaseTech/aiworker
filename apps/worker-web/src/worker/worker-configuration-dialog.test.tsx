import type { LocalWorker, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-descriptor'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { messagesFor } from '../features/i18n'
import { WorkerConfigurationDialog } from './worker-configuration-dialog'

const copy = messagesFor('en')
const now = '2026-06-02T00:00:00.000Z'

const worker = {
  createdAt: now,
  defaultEngineId: 'codex',
  id: 'primary-worker',
  metadataJson: {},
  name: 'Primary',
  appId: 'aiworker-demo-primary',
  status: 'active',
  updatedAt: now,
} as unknown as LocalWorker

const skillBaseline: LocalWorkerOverlayAsset = {
  checksum: null,
  enabled: true,
  id: 'briefing-brief',
  kind: 'skill',
  metadataJson: {},
  optionsJson: {},
  source: 'baseline',
  sourceRef: 'descriptor://engine/skills/briefing-brief',
  target: 'codex',
  updatedAt: now,
}

const skillOverlay: LocalWorkerOverlayAsset = {
  ...skillBaseline,
  id: 'custom-skill',
  source: 'overlay',
  sourceRef: 'worker-overlay://skills/custom-skill/SKILL.md',
}

const mcpAsset: LocalWorkerOverlayAsset = {
  checksum: null,
  enabled: true,
  id: 'team-context',
  kind: 'mcp-client',
  metadataJson: {},
  optionsJson: {},
  source: 'baseline',
  sourceRef: 'descriptor://engine/mcp/team-context',
  target: 'codex',
  updatedAt: now,
}

interface FetchResult { body: unknown, status?: number }
let routes: Record<string, (init?: RequestInit) => FetchResult>
let calls: { url: string, method: string, body: unknown }[]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })
}

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    const key = `${method} ${url}`
    const handler = routes[key]
    if (handler) {
      const result = handler(init)
      return json(result.body, result.status ?? 200)
    }
    return json({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog(assets: LocalWorkerOverlayAsset[], onReload = vi.fn()) {
  render(
    <WorkerConfigurationDialog
      assets={assets}
      copy={copy}
      open
      worker={worker}
      onOpenChange={vi.fn()}
      onReload={onReload}
      onSaveAssets={vi.fn()}
    />,
  )
}

function selectAssetRow(assetId: string) {
  const row = screen.getAllByRole('button').find(button =>
    button.getAttribute('data-slot') === 'sidebar-menu-button' && button.textContent?.includes(assetId),
  )
  if (!row)
    throw new Error(`asset row not found: ${assetId}`)
  fireEvent.click(row)
}

async function openEditor(assetId: string, actionLabel: string) {
  selectAssetRow(assetId)
  fireEvent.click(await screen.findByRole('button', { name: actionLabel }))
}

describe('worker configuration overlay content editor', () => {
  it('opens the editor and shows the baseline content with a source indicator', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Abriefing-brief/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: '# baseline body', editable: true, source: 'baseline', sourceRef: skillBaseline.sourceRef },
    })
    renderDialog([skillBaseline])

    await openEditor('briefing-brief', copy.workerConfig.viewEdit)

    const textarea = await screen.findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('# baseline body'))
    expect(screen.getByTestId('overlay-content-source').textContent).toBe(copy.workerConfig.sourceBaseline)
    expect(screen.queryByRole('button', { name: copy.workerConfig.resetToBaseline })).toBeNull()
  })

  it('edits then saves through PUT content and reloads the config list', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'old body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content'] = init => ({
      body: { checksum: 'sha256:y', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    const onReload = vi.fn()
    renderDialog([skillOverlay], onReload)

    await openEditor('custom-skill', copy.workerConfig.viewEdit)
    const textarea = await screen.findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('old body'))
    fireEvent.change(textarea, { target: { value: 'new body' } })
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.save }))

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('skill-overlay%3Acustom-skill/content'))
      expect(put?.body).toMatchObject({ content: 'new body', target: 'codex' })
    })
    expect(onReload).toHaveBeenCalled()
  })

  it('resets an overlay to baseline by archiving the overlay config', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'overlay body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['POST /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/archive'] = () => ({
      body: { config: { archived: true, configKey: 'skill-overlay:custom-skill', updatedAt: now, value: null, workerId: worker.id } },
    })
    const onReload = vi.fn()
    renderDialog([skillOverlay], onReload)

    await openEditor('custom-skill', copy.workerConfig.viewEdit)
    await screen.findByLabelText(copy.workerConfig.contentLabel)
    fireEvent.click(await screen.findByRole('button', { name: copy.workerConfig.resetToBaseline }))

    await waitFor(() => {
      expect(calls.some(call => call.method === 'POST' && call.url.includes('skill-overlay%3Acustom-skill/archive'))).toBe(true)
    })
    expect(onReload).toHaveBeenCalled()
  })

  it('adds a new skill overlay by PUTting a new configKey', async () => {
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Anew-skill/content'] = init => ({
      body: { checksum: 'sha256:z', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: 'worker-overlay://skills/new-skill/SKILL.md' },
    })
    const onReload = vi.fn()
    renderDialog([skillBaseline], onReload)

    fireEvent.click(screen.getByRole('button', { name: `+ ${copy.workerConfig.addSkill}` }))
    fireEvent.change(await screen.findByLabelText(copy.workerConfig.addNamePlaceholder), { target: { value: 'new-skill' } })
    fireEvent.change(screen.getByLabelText(copy.workerConfig.addContentPlaceholder), { target: { value: '# fresh skill' } })
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.add }))

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('skill-overlay%3Anew-skill/content'))
      expect(put?.body).toMatchObject({ content: '# fresh skill' })
    })
    expect(onReload).toHaveBeenCalled()
  })

  it('adds a new entry file overlay through content PUT instead of a descriptor envelope', async () => {
    routes['PUT /api/workers/primary-worker/config/entry-file-overlay%3AREADME.md/content'] = init => ({
      body: { checksum: 'sha256:z', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: 'worker-overlay://entry-files/README.md' },
    })
    const onReload = vi.fn()
    renderDialog([skillBaseline], onReload)

    fireEvent.click(screen.getByRole('button', { name: `+ ${copy.workerConfig.addEntryFile}` }))
    fireEvent.change(await screen.findByLabelText(copy.workerConfig.addNamePlaceholder), { target: { value: 'README.md' } })
    fireEvent.change(screen.getByLabelText(copy.workerConfig.addContentPlaceholder), { target: { value: '# Project notes' } })
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.add }))

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('entry-file-overlay%3AREADME.md/content'))
      expect(put?.body).toMatchObject({ content: '# Project notes' })
    })
    expect(calls.some(call => call.url.includes('entry-file-overlay%3AREADME.md') && !call.url.endsWith('/content'))).toBe(false)
    expect(onReload).toHaveBeenCalled()
  })

  it('does not expose the low-level descriptor source reference asset form', () => {
    renderDialog([skillBaseline, mcpAsset])

    expect(screen.queryByRole('button', { name: 'New entry file' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New skill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New mcp client' })).toBeNull()
    expect(screen.queryByLabelText('Overlay asset source reference')).toBeNull()
    expect(screen.queryByText(skillBaseline.sourceRef)).toBeNull()
    expect(screen.queryByText(mcpAsset.sourceRef)).toBeNull()
  })

  it('shows an mcp row as a read-only redacted view with no Save or Reset', async () => {
    routes['GET /api/workers/primary-worker/config/mcp-overlay%3Acodex/content'] = () => ({
      body: { checksum: 'sha256:x', content: 'token = [redacted]', editable: false, source: 'baseline', sourceRef: mcpAsset.sourceRef },
    })
    renderDialog([mcpAsset])

    selectAssetRow('team-context')
    expect(screen.queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: copy.workerConfig.view }))

    const textarea = await screen.findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('token = [redacted]'))
    expect((textarea as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: copy.workerConfig.save })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workerConfig.resetToBaseline })).toBeNull()
    expect(screen.getByText(copy.workerConfig.readonlyHint)).toBeTruthy()
  })

  it('surfaces the daemon literal-secret rejection (422) as an inline error', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content'] = () => ({
      body: { error: { code: 'WORKER_CONFIG_CONTENT_SECRET', message: 'literal secrets are not allowed in worker overlay content' } },
      status: 422,
    })
    renderDialog([skillOverlay])

    await openEditor('custom-skill', copy.workerConfig.viewEdit)
    await screen.findByLabelText(copy.workerConfig.contentLabel)
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.save }))

    const error = await screen.findByTestId('overlay-content-error')
    expect(error.textContent).toBe('literal secrets are not allowed in worker overlay content')
  })
})
