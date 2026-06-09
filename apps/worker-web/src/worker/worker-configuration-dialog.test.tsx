import type { LocalWorker, LocalWorkerOverlayAsset } from '@zonease/aiworker-soul-descriptor'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const entryFileOverlay: LocalWorkerOverlayAsset = {
  checksum: null,
  enabled: true,
  id: 'README.md',
  kind: 'entry-file',
  metadataJson: {},
  optionsJson: {},
  source: 'overlay',
  sourceRef: 'worker-overlay://entry-files/README.md',
  target: 'codex',
  updatedAt: now,
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

function editorPanel() {
  return within(screen.getByTestId('worker-overlay-editor-panel'))
}

function expectNoDetachedAddButtons() {
  expect(screen.queryByRole('button', { name: `+ ${copy.workerConfig.addSkill}` })).toBeNull()
  expect(screen.queryByRole('button', { name: `+ ${copy.workerConfig.addEntryFile}` })).toBeNull()
}

function selectAssetRow(assetId: string) {
  const row = screen.getAllByRole('button').find(button =>
    button.getAttribute('data-slot') === 'sidebar-menu-button' && button.textContent?.includes(assetId),
  )
  if (!row)
    throw new Error(`asset row not found: ${assetId}`)
  fireEvent.click(row)
}

describe('worker configuration overlay content editor', () => {
  it('drops the noisy category count tag and keeps the add action as an integrated trigger slot', () => {
    renderDialog([skillBaseline, skillOverlay, entryFileOverlay])

    const skillsToggle = screen.getByRole('button', { name: 'Toggle Skills' })
    expect(within(skillsToggle).getByText('Skills').getAttribute('data-slot')).toBe('item-title')
    // The count badge is visual clutter, not signal — the trigger carries no count tag.
    expect(skillsToggle.querySelector('[data-slot="badge"]')).toBeNull()
    expect(skillsToggle.querySelector('[data-icon="inline-start"]')).toBeTruthy()
    // The "add skill" action is surfaced directly in the group header (integrated slot, not a detached "+").
    expect(screen.getByRole('button', { name: copy.workerConfig.addSkill })).toBeTruthy()
  })

  it('loads selected skill content inline without opening a nested editor dialog', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Abriefing-brief/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: '# baseline body', editable: true, source: 'baseline', sourceRef: skillBaseline.sourceRef },
    })
    renderDialog([skillBaseline])

    selectAssetRow('briefing-brief')

    const panel = screen.getByTestId('worker-overlay-editor-panel')
    const textarea = await within(panel).findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('# baseline body'))
    expect(screen.queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('opens add skill as an inline draft in the editor panel', async () => {
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Anew-skill/content'] = init => ({
      body: { checksum: 'sha256:z', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: 'worker-overlay://skills/new-skill/SKILL.md' },
    })
    renderDialog([skillBaseline])

    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.addSkill }))

    const panel = screen.getByTestId('worker-overlay-editor-panel')
    fireEvent.change(await within(panel).findByLabelText(copy.workerConfig.addNamePlaceholder), { target: { value: 'new-skill' } })
    fireEvent.change(within(panel).getByLabelText(copy.workerConfig.addContentPlaceholder), { target: { value: '# fresh skill' } })
    fireEvent.click(within(panel).getByRole('button', { name: copy.workerConfig.add }))

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('skill-overlay%3Anew-skill/content'))
      expect(put?.body).toMatchObject({ content: '# fresh skill' })
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('opens the editor and shows the baseline content with a source indicator', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Abriefing-brief/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: '# baseline body', editable: true, source: 'baseline', sourceRef: skillBaseline.sourceRef },
    })
    renderDialog([skillBaseline])

    selectAssetRow('briefing-brief')

    expect(editorPanel().queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('# baseline body'))
    expect(editorPanel().getByTestId('overlay-content-source').textContent).toBe(copy.workerConfig.sourceBaseline)
    expect(editorPanel().queryByRole('button', { name: copy.workerConfig.resetToBaseline })).toBeNull()
  })

  it('selects an entry-file row and loads editable content inline without a View/Edit action', async () => {
    routes['GET /api/workers/primary-worker/config/entry-file-overlay%3AREADME.md/content'] = () => ({
      body: { checksum: 'sha256:e', content: '# project notes', editable: true, source: 'overlay', sourceRef: entryFileOverlay.sourceRef },
    })
    renderDialog([skillBaseline, entryFileOverlay])

    selectAssetRow('README.md')

    expect(editorPanel().queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('# project notes'))
    expect(editorPanel().getByTestId('overlay-content-source').textContent).toBe(copy.workerConfig.sourceOverlay)
    expect(editorPanel().getByRole('button', { name: copy.workerConfig.resetToBaseline })).toBeTruthy()
  })

  it('edits selected skill content inline and saves through PUT only after explicit Save', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'old body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content'] = init => ({
      body: { checksum: 'sha256:y', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    const onReload = vi.fn()
    renderDialog([skillOverlay], onReload)

    selectAssetRow('custom-skill')
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('old body'))
    const saveButton = editorPanel().getByRole('button', { name: copy.workerConfig.save })
    expect(saveButton.hasAttribute('disabled')).toBe(true)
    fireEvent.change(textarea, { target: { value: 'new body' } })
    expect(saveButton.hasAttribute('disabled')).toBe(false)

    expect(calls.some(call => call.method === 'PUT')).toBe(false)
    fireEvent.click(saveButton)

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('skill-overlay%3Acustom-skill/content'))
      expect(put?.body).toMatchObject({ content: 'new body', target: 'codex' })
    })
    await waitFor(() => expect(saveButton.hasAttribute('disabled')).toBe(true))
    expect(onReload).toHaveBeenCalled()
  })

  it('asks before discarding dirty inline content when selecting another asset', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'old body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['GET /api/workers/primary-worker/config/entry-file-overlay%3AREADME.md/content'] = () => ({
      body: { checksum: 'sha256:e', content: '# project notes', editable: true, source: 'overlay', sourceRef: entryFileOverlay.sourceRef },
    })
    renderDialog([skillOverlay, entryFileOverlay])

    selectAssetRow('custom-skill')
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('old body'))
    fireEvent.change(textarea, { target: { value: 'unsaved body' } })

    selectAssetRow('README.md')

    expect(await screen.findByText(copy.workerConfig.unsavedChangesTitle)).toBeTruthy()
    expect((textarea as HTMLTextAreaElement).value).toBe('unsaved body')
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.cancel }))
    expect(screen.queryByText(copy.workerConfig.unsavedChangesTitle)).toBeNull()
    expect((textarea as HTMLTextAreaElement).value).toBe('unsaved body')

    selectAssetRow('README.md')
    fireEvent.click(await screen.findByRole('button', { name: copy.workerConfig.discardChanges }))

    const nextTextarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((nextTextarea as HTMLTextAreaElement).value).toBe('# project notes'))
  })

  it('resets selected overlay content to baseline from the inline editor', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'overlay body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['POST /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/archive'] = () => ({
      body: { config: { archived: true, configKey: 'skill-overlay:custom-skill', updatedAt: now, value: null, workerId: worker.id } },
    })
    const onReload = vi.fn()
    renderDialog([skillOverlay], onReload)

    selectAssetRow('custom-skill')
    await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    fireEvent.click(editorPanel().getByRole('button', { name: copy.workerConfig.resetToBaseline }))

    await waitFor(() => {
      expect(calls.some(call => call.method === 'POST' && call.url.includes('skill-overlay%3Acustom-skill/archive'))).toBe(true)
    })
    expect(onReload).toHaveBeenCalled()
  })

  it('creates a skill draft from the Skills category plus and saves it from the right panel', async () => {
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Anew-skill/content'] = init => ({
      body: { checksum: 'sha256:z', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: 'worker-overlay://skills/new-skill/SKILL.md' },
    })
    const onReload = vi.fn()
    renderDialog([skillBaseline], onReload)

    expectNoDetachedAddButtons()
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.addSkill }))
    fireEvent.change(editorPanel().getByLabelText(copy.workerConfig.addNamePlaceholder), { target: { value: 'new-skill' } })
    fireEvent.change(editorPanel().getByLabelText(copy.workerConfig.addContentPlaceholder), { target: { value: '# fresh skill' } })
    fireEvent.click(editorPanel().getByRole('button', { name: copy.workerConfig.add }))

    await waitFor(() => {
      const put = calls.find(call => call.method === 'PUT' && call.url.includes('skill-overlay%3Anew-skill/content'))
      expect(put?.body).toMatchObject({ content: '# fresh skill' })
    })
    expect(onReload).toHaveBeenCalled()
  })

  it('creates an entry-file draft from the Entry files category plus and saves through content PUT', async () => {
    routes['PUT /api/workers/primary-worker/config/entry-file-overlay%3AREADME.md/content'] = init => ({
      body: { checksum: 'sha256:z', content: JSON.parse(String(init?.body)).content, editable: true, source: 'overlay', sourceRef: 'worker-overlay://entry-files/README.md' },
    })
    const onReload = vi.fn()
    renderDialog([skillBaseline], onReload)

    expectNoDetachedAddButtons()
    fireEvent.click(screen.getByRole('button', { name: copy.workerConfig.addEntryFile }))
    fireEvent.change(editorPanel().getByLabelText(copy.workerConfig.addNamePlaceholder), { target: { value: 'README.md' } })
    fireEvent.change(editorPanel().getByLabelText(copy.workerConfig.addContentPlaceholder), { target: { value: '# Project notes' } })
    fireEvent.click(editorPanel().getByRole('button', { name: copy.workerConfig.add }))

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

  it('selects an mcp row and auto-previews redacted content inline as read-only with no Save or Reset', async () => {
    routes['GET /api/workers/primary-worker/config/mcp-overlay%3Acodex/content'] = () => ({
      body: { checksum: 'sha256:x', content: 'token = [redacted]', editable: false, source: 'baseline', sourceRef: mcpAsset.sourceRef },
    })
    renderDialog([mcpAsset])

    selectAssetRow('team-context')
    expect(screen.queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workerConfig.view })).toBeNull()

    expect(editorPanel().queryByRole('button', { name: copy.workerConfig.view })).toBeNull()
    expect(editorPanel().queryByRole('button', { name: copy.workerConfig.viewEdit })).toBeNull()
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('token = [redacted]'))
    expect((textarea as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: copy.workerConfig.save })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.workerConfig.resetToBaseline })).toBeNull()
    expect(screen.getAllByText(copy.workerConfig.readonlyHint).length).toBeGreaterThan(0)
  })

  it('surfaces the daemon literal-secret rejection (422) as an inline editor error', async () => {
    routes['GET /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content?target=codex'] = () => ({
      body: { checksum: 'sha256:x', content: 'body', editable: true, source: 'overlay', sourceRef: skillOverlay.sourceRef },
    })
    routes['PUT /api/workers/primary-worker/config/skill-overlay%3Acustom-skill/content'] = () => ({
      body: { error: { code: 'WORKER_CONFIG_CONTENT_SECRET', message: 'literal secrets are not allowed in worker overlay content' } },
      status: 422,
    })
    renderDialog([skillOverlay])

    selectAssetRow('custom-skill')
    const textarea = await editorPanel().findByLabelText(copy.workerConfig.contentLabel)
    fireEvent.change(textarea, { target: { value: 'literal secret candidate' } })
    fireEvent.click(editorPanel().getByRole('button', { name: copy.workerConfig.save }))

    const error = await editorPanel().findByTestId('overlay-content-error')
    expect(error.textContent).toBe('literal secrets are not allowed in worker overlay content')
  })
})
