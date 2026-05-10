import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalCase,
  LocalEngineStatus,
  LocalRun,
  LocalSettingsConfig,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { FormEvent, ReactNode } from 'react'
import type { LocalWorkspaceData } from './api'

import {
  Check,
  Circle,
  FileText,
  Languages,
  Link,
  Moon,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Terminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createCase, loadLocalWorkspaceData, rescanEngines, saveSettings, startRun, testEngine } from './api'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type SettingsSection = 'execution' | 'connectors' | 'mcp' | 'language' | 'appearance' | 'about'

export function WorkerStudio() {
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedSoulId, setSelectedSoulId] = useState('hr')
  const [selectedTemplateId, setSelectedTemplateId] = useState('candidate-screen')
  const [caseTitle, setCaseTitle] = useState('')
  const [caseContext, setCaseContext] = useState('')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, error: null, loading: false })
      const firstAvailableSoul = data.souls.find(soul => soul.status === 'available')
      const selectedSoul = data.souls.find(soul => soul.id === selectedSoulId && soul.status === 'available') ?? firstAvailableSoul
      if (selectedSoul && selectedSoul.id !== selectedSoulId)
        setSelectedSoulId(selectedSoul.id)
      const soulTemplates = data.templates.filter(template => template.soulId === (selectedSoul?.id ?? selectedSoulId))
      if (soulTemplates.length > 0 && !soulTemplates.some(template => template.id === selectedTemplateId))
        setSelectedTemplateId(soulTemplates[0]!.id)
    }
    catch (error) {
      setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false })
    }
  }, [selectedSoulId, selectedTemplateId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const data = state.data
  const selectedSoul = data?.souls.find(soul => soul.id === selectedSoulId) ?? null
  const templates = useMemo(
    () => data?.templates.filter(template => template.soulId === selectedSoulId) ?? [],
    [data?.templates, selectedSoulId],
  )
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null
  const soulCases = useMemo(
    () => data?.cases.filter(item => item.selectedSoulId === selectedSoulId) ?? [],
    [data?.cases, selectedSoulId],
  )
  const soulRuns = useMemo(() => {
    const caseIds = new Set(soulCases.map(item => item.id))
    return data?.runs.filter(run => run.caseId !== null && caseIds.has(run.caseId)) ?? []
  }, [data?.runs, soulCases])
  const soulRunIds = useMemo(() => new Set(soulRuns.map(run => run.id)), [soulRuns])
  const soulArtifacts = useMemo(() => {
    return data?.artifacts.filter(artifact => artifact.runId !== null && soulRunIds.has(artifact.runId)) ?? []
  }, [data?.artifacts, soulRunIds])
  const soulReviews = useMemo(() => {
    return data?.reviews.filter(review => review.runId !== null && soulRunIds.has(review.runId)) ?? []
  }, [data?.reviews, soulRunIds])
  const filteredCases = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return soulCases.filter(item => !needle || item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle))
  }, [query, soulCases])
  const latestRun = latest(soulRuns)
  const latestArtifact = latest(soulArtifacts)

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSoul || !selectedTemplate || !caseTitle.trim() || !caseContext.trim())
      return
    setSubmitting(true)
    try {
      const body = buildCasePrompt(selectedSoul, selectedTemplate, caseContext)
      const result = await createCase({
        body,
        metadata: {
          inputHints: selectedTemplate.inputHints,
          outputKind: selectedTemplate.outputKind,
          reviewRubric: selectedTemplate.reviewRubric,
        },
        selectedSkillId: selectedTemplate.id,
        selectedSoulId: selectedSoul.id,
        title: caseTitle.trim(),
      })
      await startRun({
        caseId: result.case.id,
        prompt: body,
      })
      setCaseTitle('')
      setCaseContext('')
      await refresh()
    }
    finally {
      setSubmitting(false)
    }
  }

  if (state.loading && !data) {
    return (
      <main className="loading-shell">
        <span>Loading Soul workspace...</span>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="loading-shell">
        <span role="alert">{state.error}</span>
      </main>
    )
  }

  if (!data || !selectedSoul || !selectedTemplate)
    return null

  return (
    <main className="soul-shell">
      <aside className="soul-sidebar" aria-label="Soul catalog">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">AI</div>
          <div>
            <strong>AIWorker</strong>
            <span>Vertical Soul workspace</span>
          </div>
        </div>

        <section className="sidebar-section">
          <div className="section-eyebrow">Soul catalog</div>
          <div className="soul-list">
            {data.souls.map(soul => (
              <button
                key={soul.id}
                type="button"
                className={`soul-card ${selectedSoulId === soul.id ? 'active' : ''}`}
                disabled={soul.status !== 'available'}
                aria-pressed={selectedSoulId === soul.id}
                onClick={() => {
                  setSelectedSoulId(soul.id)
                  const next = data.templates.find(template => template.soulId === soul.id)
                  if (next)
                    setSelectedTemplateId(next.id)
                }}
              >
                <span className="soul-card-name">{soul.name}</span>
                <span className="soul-card-domain">{soul.domain}</span>
                <span className={`soul-status ${soul.status}`}>{soul.status === 'available' ? 'Ready' : 'Later'}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace-main" aria-label="Case workspace">
        <header className="workspace-header">
          <div>
            <div className="section-eyebrow">Selected Soul</div>
            <h1>
              {selectedSoul.name}
              {' '}
              Soul
            </h1>
            <p>{selectedSoul.description}</p>
          </div>
          <button type="button" className="icon-action" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={17} />
          </button>
        </header>

        <div className="workspace-grid">
          <section className="template-panel" aria-label="Capability templates">
            <div className="panel-head">
              <div>
                <h2>Skills and capability templates</h2>
                <p>
                  {templates.length}
                  {' '}
                  templates ready for this Soul
                </p>
              </div>
            </div>
            <div className="template-list">
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className={`template-card ${selectedTemplateId === template.id ? 'active' : ''}`}
                  aria-pressed={selectedTemplateId === template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <span className="template-card-title">{template.name}</span>
                  <span>{template.description}</span>
                  <small>{template.outputKind}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="case-panel" aria-label="Create case">
            <div className="panel-head">
              <div>
                <h2>Create case and run</h2>
                <p>
                  {selectedTemplate.name}
                  {' '}
                  will produce a
                  {' '}
                  {selectedTemplate.outputKind}
                  {' '}
                  artifact.
                </p>
              </div>
            </div>
            <form className="case-form" onSubmit={submitCase}>
              <label>
                <span>Case name</span>
                <input
                  aria-label="Case name"
                  value={caseTitle}
                  onChange={event => setCaseTitle(event.target.value)}
                  placeholder={caseNamePlaceholder(selectedSoul.id)}
                />
              </label>
              <label>
                <span>Business context</span>
                <textarea
                  aria-label="Business context"
                  value={caseContext}
                  onChange={event => setCaseContext(event.target.value)}
                  placeholder={selectedTemplate.inputHints.join(' · ')}
                />
              </label>
              <div className="rubric-strip">
                {selectedTemplate.reviewRubric.map(item => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <button className="primary run-button" type="submit" disabled={submitting || !caseTitle.trim() || !caseContext.trim()}>
                <Play size={14} />
                <span>{submitting ? 'Running...' : 'Create case and run'}</span>
              </button>
            </form>
          </section>
        </div>

        <section className="case-history" aria-label="Cases and artifacts">
          <div className="history-head">
            <div>
              <h2>Cases and artifacts</h2>
              <p>
                {filteredCases.length}
                {' '}
                cases for
                {' '}
                {selectedSoul.name}
              </p>
            </div>
            <label className="search-box">
              <Search size={14} />
              <input aria-label="Search cases" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search cases" />
            </label>
          </div>
          <div className="case-grid">
            {filteredCases.length > 0
              ? filteredCases.map(item => (
                  <CaseCard
                    key={item.id}
                    item={item}
                    artifact={artifactForCase(item, data.artifacts, data.runs)}
                    run={runForCase(item, data.runs)}
                    template={data.templates.find(template => template.id === item.selectedSkillId)}
                  />
                ))
              : (
                  <div className="empty-state">
                    <FileText size={22} />
                    <span>
                      Create the first
                      {' '}
                      {selectedSoul.name}
                      {' '}
                      case to generate a business artifact.
                    </span>
                  </div>
                )}
          </div>
        </section>
      </section>

      <aside className="artifact-rail" aria-label="Artifact review">
        <section className="rail-card">
          <div className="section-eyebrow">Latest run</div>
          {latestRun
            ? (
                <>
                  <strong>{titleCase(latestRun.status)}</strong>
                  <span>{latestRun.summary ?? latestRun.executor}</span>
                  <small>{relativeTime(latestRun.updatedAt)}</small>
                </>
              )
            : <span>No run yet.</span>}
        </section>
        <section className="rail-card">
          <div className="section-eyebrow">Business artifact</div>
          {latestArtifact
            ? (
                <>
                  <strong>{latestArtifact.title}</strong>
                  <span>{latestArtifact.kind}</span>
                  <small>{latestArtifact.path}</small>
                </>
              )
            : <span>Artifacts appear here after a case run.</span>}
        </section>
        <section className="rail-card">
          <div className="section-eyebrow">Review and memory</div>
          <strong>
            {soulReviews.length}
            {' '}
            reviews
          </strong>
          <span>
            {data.lessons.length}
            {' '}
            memory candidates
          </span>
          <small>Human review decides what becomes durable org memory.</small>
        </section>
      </aside>

      {settingsOpen
        ? (
            <SettingsDialog
              initial={data.settings}
              runtimeVersion={data.info.runtimeVersion}
              onClose={() => setSettingsOpen(false)}
              onSaved={(settings) => {
                setState(current => current.data
                  ? { ...current, data: { ...current.data, settings }, loading: false }
                  : current)
              }}
            />
          )
        : null}
    </main>
  )
}

function SettingsDialog({
  initial,
  onClose,
  onSaved,
  runtimeVersion,
}: {
  initial: LocalSettingsConfig
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
}) {
  const [settings, setSettings] = useState(initial)
  const [section, setSection] = useState<SettingsSection>('execution')
  const [autosave, setAutosave] = useState<AutosaveState>('saved')
  const [engineTest, setEngineTest] = useState<string | null>(null)

  async function persist(patch: Partial<LocalSettingsConfig>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    setAutosave('saving')
    try {
      const result = await saveSettings(patch)
      setSettings(result.settings)
      onSaved(result.settings)
      setAutosave('saved')
    }
    catch {
      setAutosave('failed')
    }
  }

  async function handleRescan() {
    setAutosave('saving')
    try {
      const result = await rescanEngines()
      setSettings(result.settings)
      onSaved(result.settings)
      setAutosave('saved')
    }
    catch {
      setAutosave('failed')
    }
  }

  async function handleTest(engineId: string) {
    setEngineTest('Testing engine...')
    try {
      const result = await testEngine(engineId)
      setEngineTest(result.result.message)
    }
    catch (error) {
      setEngineTest(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
        <header className="settings-top">
          <div>
            <div className="section-eyebrow">Settings</div>
            <h2 id="settings-title">AIWorker configuration</h2>
            <p>Execution, connectors, external MCP, language, and appearance are saved to the local daemon.</p>
          </div>
          <div className={`autosave ${autosave}`}>
            {autosave === 'saving' ? <RefreshCw size={13} className="spin" /> : <Check size={13} />}
            <span>{autosaveCopy(autosave)}</span>
          </div>
          <button type="button" className="icon-action" aria-label="Close settings" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <SettingsNavButton active={section === 'execution'} icon={<Terminal size={17} />} label="Local CLI / BYOK" onClick={() => setSection('execution')} />
            <SettingsNavButton active={section === 'connectors'} icon={<Link size={17} />} label="Connectors" onClick={() => setSection('connectors')} />
            <SettingsNavButton active={section === 'mcp'} icon={<ShieldCheck size={17} />} label="MCP" onClick={() => setSection('mcp')} />
            <SettingsNavButton active={section === 'language'} icon={<Languages size={17} />} label="Language" onClick={() => setSection('language')} />
            <SettingsNavButton active={section === 'appearance'} icon={<Sun size={17} />} label="Appearance" onClick={() => setSection('appearance')} />
            <SettingsNavButton active={section === 'about'} icon={<Settings size={17} />} label="About" onClick={() => setSection('about')} />
          </nav>

          <section className="settings-content">
            {section === 'execution'
              ? (
                  <ExecutionSettings
                    engineTest={engineTest}
                    onRescan={() => void handleRescan()}
                    onTest={engineId => void handleTest(engineId)}
                    settings={settings}
                    update={persist}
                  />
                )
              : null}
            {section === 'connectors' ? <ConnectorsSettings settings={settings} update={persist} /> : null}
            {section === 'mcp' ? <McpSettings settings={settings} update={persist} /> : null}
            {section === 'language' ? <LanguageSettings settings={settings} update={persist} /> : null}
            {section === 'appearance' ? <AppearanceSettings settings={settings} update={persist} /> : null}
            {section === 'about'
              ? (
                  <div className="settings-section">
                    <h3>Local workspace runtime</h3>
                    <dl className="about-grid">
                      <div>
                        <dt>Version</dt>
                        <dd>{runtimeVersion}</dd>
                      </div>
                      <div>
                        <dt>Execution mode</dt>
                        <dd>{settings.executionMode}</dd>
                      </div>
                      <div>
                        <dt>Selected engine</dt>
                        <dd>{settings.engineId}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{relativeTime(settings.updatedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                )
              : null}
          </section>
        </div>
      </div>
    </div>
  )
}

function ExecutionSettings({
  engineTest,
  onRescan,
  onTest,
  settings,
  update,
}: {
  engineTest: string | null
  onRescan: () => void
  onTest: (engineId: string) => void
  settings: LocalSettingsConfig
  update: (patch: Partial<LocalSettingsConfig>) => Promise<void>
}) {
  return (
    <div className="settings-section">
      <div className="segmented" role="tablist" aria-label="Execution mode">
        <button type="button" className={settings.executionMode === 'local-cli' ? 'active' : ''} onClick={() => void update({ executionMode: 'local-cli' })}>Local CLI</button>
        <button type="button" className={settings.executionMode === 'byok' ? 'active' : ''} onClick={() => void update({ executionMode: 'byok' })}>BYOK</button>
      </div>
      {settings.executionMode === 'local-cli'
        ? (
            <>
              <div className="settings-row-head">
                <div>
                  <h3>Engine provider</h3>
                  <p>Installed state comes from a real PATH scan on the local daemon.</p>
                </div>
                <button type="button" className="ghost action-button" onClick={onRescan}>
                  <RefreshCw size={13} />
                  {' '}
                  Rescan
                </button>
              </div>
              <div className="engine-grid">
                {settings.engines.map(engine => (
                  <EngineCard
                    key={engine.id}
                    active={settings.engineId === engine.id}
                    engine={engine}
                    onSelect={() => void update({ engineId: engine.id })}
                    onTest={() => onTest(engine.id)}
                  />
                ))}
              </div>
              {engineTest ? <p className="settings-note" role="status">{engineTest}</p> : null}
            </>
          )
        : (
            <div className="byok-grid">
              <label>
                <span>Provider</span>
                <input value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
              </label>
              <label>
                <span>Base URL</span>
                <input value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
              </label>
              <label>
                <span>Model</span>
                <input value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
              </label>
              <label>
                <span>API key ref</span>
                <input value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="secret://aiworker/byok/openai" />
              </label>
            </div>
          )}
    </div>
  )
}

function EngineCard({
  active,
  engine,
  onSelect,
  onTest,
}: {
  active: boolean
  engine: LocalEngineStatus
  onSelect: () => void
  onTest: () => void
}) {
  return (
    <div className={`engine-card ${active ? 'active' : ''} ${engine.installed ? '' : 'disabled'}`}>
      <button type="button" disabled={!engine.installed} aria-pressed={active} onClick={onSelect}>
        <Terminal size={19} />
        <span>
          <strong>{engine.name}</strong>
          <small>{engine.installed ? engine.version ?? engine.path : 'Not installed'}</small>
        </span>
        <Circle size={10} className={engine.installed ? 'ok-dot' : 'muted-dot'} />
      </button>
      <button type="button" className="ghost action-button" disabled={!engine.installed} onClick={onTest}>Test</button>
    </div>
  )
}

function ConnectorsSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <h3>Connectors</h3>
      <div className="connector-list">
        {settings.connectors.map(connector => (
          <label key={connector.id} className="switch-row">
            <span>
              <strong>{connector.name}</strong>
              <small>{connector.status === 'configured' ? 'Configured' : 'Not configured'}</small>
            </span>
            <input
              checked={connector.enabled}
              type="checkbox"
              onChange={event => void update({
                connectors: settings.connectors.map(item => item.id === connector.id
                  ? { ...item, enabled: event.target.checked, status: event.target.checked ? 'configured' : 'not_configured' }
                  : item),
              })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function McpSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <h3>MCP server and external MCP</h3>
      <label className="switch-row">
        <span>
          <strong>AIWorker local MCP server</strong>
          <small>{settings.localMcpServer.url}</small>
        </span>
        <input checked={settings.localMcpServer.enabled} type="checkbox" onChange={event => void update({ localMcpServer: { ...settings.localMcpServer, enabled: event.target.checked } })} />
      </label>
      <div className="connector-list">
        {settings.externalMcpServers.map(server => (
          <label key={server.id} className="field-stack">
            <span>{server.name}</span>
            <input
              value={server.command}
              onChange={event => void update({
                externalMcpServers: settings.externalMcpServers.map(item => item.id === server.id ? { ...item, command: event.target.value } : item),
              })}
              placeholder="command --arg value"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function LanguageSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <h3>Language</h3>
      <div className="segmented compact" role="group" aria-label="Language">
        {['en', 'zh-CN', 'ja', 'de'].map(language => (
          <button key={language} type="button" className={settings.language === language ? 'active' : ''} onClick={() => void update({ language })}>{language}</button>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <h3>Appearance</h3>
      <div className="segmented compact" role="group" aria-label="Appearance">
        <button type="button" className={settings.appearance === 'system' ? 'active' : ''} onClick={() => void update({ appearance: 'system' })}>
          <Settings size={13} />
          {' '}
          System
        </button>
        <button type="button" className={settings.appearance === 'light' ? 'active' : ''} onClick={() => void update({ appearance: 'light' })}>
          <Sun size={13} />
          {' '}
          Light
        </button>
        <button type="button" className={settings.appearance === 'dark' ? 'active' : ''} onClick={() => void update({ appearance: 'dark' })}>
          <Moon size={13} />
          {' '}
          Dark
        </button>
      </div>
    </div>
  )
}

function SettingsNavButton({ active, icon, label, onClick }: { active: boolean, icon: ReactNode, label: string, onClick: () => void }) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CaseCard({
  artifact,
  item,
  run,
  template,
}: {
  artifact: LocalArtifact | null
  item: LocalCase
  run: LocalRun | null
  template?: CapabilityTemplate
}) {
  return (
    <article className="case-card">
      <div>
        <strong>{item.title}</strong>
        <span>{template?.name ?? item.selectedSkillId}</span>
      </div>
      <p>{item.body.slice(0, 150)}</p>
      <footer>
        <span>{titleCase(run?.status ?? item.status)}</span>
        <span>{artifact?.title ?? 'Artifact pending'}</span>
      </footer>
    </article>
  )
}

function buildCasePrompt(soul: VerticalSoul, template: CapabilityTemplate, context: string): string {
  return [
    `Soul: ${soul.name}`,
    `Capability template: ${template.name}`,
    `Output kind: ${template.outputKind}`,
    '',
    'Business context:',
    context.trim(),
    '',
    'Review rubric:',
    ...template.reviewRubric.map(item => `- ${item}`),
  ].join('\n')
}

function artifactForCase(item: LocalCase, artifacts: LocalArtifact[], runs: LocalRun[]): LocalArtifact | null {
  const run = runForCase(item, runs)
  return artifacts.find(artifact => artifact.runId === run?.id) ?? null
}

function runForCase(item: LocalCase, runs: LocalRun[]): LocalRun | null {
  return runs.filter(run => run.caseId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function latest<T extends { updatedAt: string }>(items: T[]): T | null {
  return items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function titleCase(value: string): string {
  return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function relativeTime(value: string): string {
  const ms = Date.now() - Date.parse(value)
  if (!Number.isFinite(ms) || ms < 0)
    return 'now'
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes < 60)
    return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48)
    return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function autosaveCopy(state: AutosaveState): string {
  if (state === 'saving')
    return 'Saving'
  if (state === 'failed')
    return 'Save failed'
  return 'All changes saved'
}

function caseNamePlaceholder(soulId: string): string {
  if (soulId === 'hr')
    return 'Senior backend candidate screen'
  if (soulId === 'pm')
    return 'Payments onboarding PRD'
  if (soulId === 'qa')
    return 'Release 1.2 regression gate'
  return 'Checkout deploy checklist'
}
