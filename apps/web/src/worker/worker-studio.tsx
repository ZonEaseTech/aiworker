import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalEngineStatus,
  LocalProject,
  LocalReview,
  LocalRun,
  LocalSettingsConfig,
  VerticalSoul,
} from '@zonease/aiworker-shared'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { LocalWorkspaceData } from './api'

import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  FileText,
  Grid3X3,
  Languages,
  Link,
  List,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createProject, loadLocalWorkspaceData, readFile, rescanEngines, saveSettings, startRun, testEngine } from './api'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'
interface ArtifactPreviewState {
  artifactId: string | null
  content: string
  error: string | null
  loading: boolean
}

const topTabs = ['Projects', 'Examples', 'Domain systems', 'Connectors', 'Templates', 'Artifacts'] as const
const createTabs = ['Project', 'Template'] as const
const projectTabs = ['Recent', 'This Soul'] as const

const settingsSections: Array<{
  detail: string
  icon: typeof SlidersHorizontal
  id: SettingsSection
  title: string
}> = [
  { id: 'execution', title: 'Execution', detail: 'Local CLI / BYOK', icon: SlidersHorizontal },
  { id: 'soul-packs', title: 'Soul packs', detail: 'HR / PM / QA / DevOps', icon: Sparkles },
  { id: 'connectors', title: 'Connectors', detail: 'Team system access', icon: Link },
  { id: 'mcp', title: 'Local MCP', detail: 'Workspace context server', icon: ShieldCheck },
  { id: 'external-mcp', title: 'External MCP', detail: 'Additional evidence tools', icon: Terminal },
  { id: 'language', title: 'Language', detail: 'Interface language', icon: Languages },
  { id: 'appearance', title: 'Appearance', detail: 'System / light / dark', icon: Sun },
  { id: 'about', title: 'About', detail: 'Runtime details', icon: Settings },
]

export function WorkerStudio() {
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedSoulId, setSelectedSoulId] = useState('hr')
  const [selectedTemplateId, setSelectedTemplateId] = useState('candidate-screen')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [activeTopTab, setActiveTopTab] = useState<(typeof topTabs)[number]>('Projects')
  const [activeCreateTab, setActiveCreateTab] = useState<(typeof createTabs)[number]>('Project')
  const [activeProjectTab, setActiveProjectTab] = useState<(typeof projectTabs)[number]>('Recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreviewState>({
    artifactId: null,
    content: '',
    error: null,
    loading: false,
  })

  const refresh = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, error: null, loading: false })
    }
    catch (error) {
      setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const data = state.data
  const selectedSoul = data?.souls.find(soul => soul.id === selectedSoulId && soul.status === 'available') ?? data?.souls.find(soul => soul.status === 'available') ?? null
  const templates = useMemo(
    () => data?.templates.filter(template => template.soulId === selectedSoul?.id) ?? [],
    [data?.templates, selectedSoul?.id],
  )
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null
  const soulProjects = useMemo(
    () => data?.projects.filter(item => item.selectedSoulId === selectedSoul?.id) ?? [],
    [data?.projects, selectedSoul?.id],
  )
  const soulRuns = useMemo(() => {
    const projectIds = new Set(soulProjects.map(item => item.id))
    return data?.runs.filter(run => run.projectId !== null && projectIds.has(run.projectId)) ?? []
  }, [data?.runs, soulProjects])
  const soulRunIds = useMemo(() => new Set(soulRuns.map(run => run.id)), [soulRuns])
  const soulArtifacts = useMemo(
    () => data?.artifacts.filter(artifact => artifact.runId !== null && soulRunIds.has(artifact.runId)) ?? [],
    [data?.artifacts, soulRunIds],
  )
  const soulReviews = useMemo(
    () => data?.reviews.filter(review => review.runId !== null && soulRunIds.has(review.runId)) ?? [],
    [data?.reviews, soulRunIds],
  )
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return soulProjects.filter((item) => {
      const template = data?.templates.find(candidate => candidate.id === item.selectedSkillId)
      return !needle
        || item.title.toLowerCase().includes(needle)
        || item.body.toLowerCase().includes(needle)
        || template?.name.toLowerCase().includes(needle)
    })
  }, [data?.templates, query, soulProjects])

  useEffect(() => {
    if (!data)
      return
    const firstAvailableSoul = data.souls.find(soul => soul.status === 'available')
    if (!data.souls.some(soul => soul.id === selectedSoulId && soul.status === 'available') && firstAvailableSoul)
      setSelectedSoulId(firstAvailableSoul.id)
  }, [data, selectedSoulId])

  useEffect(() => {
    if (templates.length > 0 && !templates.some(template => template.id === selectedTemplateId))
      setSelectedTemplateId(templates[0]!.id)
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (selectedProjectId && soulProjects.some(item => item.id === selectedProjectId))
      return
    setSelectedProjectId(latest(soulProjects)?.id ?? null)
  }, [selectedProjectId, soulProjects])

  const selectedProject = selectedProjectId ? soulProjects.find(item => item.id === selectedProjectId) ?? null : null
  const selectedRun = selectedProject ? runForProject(selectedProject, data?.runs ?? []) : latest(soulRuns)
  const selectedArtifact = selectedRun ? artifactForRun(selectedRun, data?.artifacts ?? []) : latest(soulArtifacts)
  const selectedReview = selectedRun ? reviewForRun(selectedRun, data?.reviews ?? []) : null
  const latestRun = latest(soulRuns)

  useEffect(() => {
    if (!selectedArtifact) {
      setArtifactPreview({ artifactId: null, content: '', error: null, loading: false })
      return
    }
    let cancelled = false
    setArtifactPreview({ artifactId: selectedArtifact.id, content: '', error: null, loading: true })
    readFile(selectedArtifact.path)
      .then((content) => {
        if (!cancelled)
          setArtifactPreview({ artifactId: selectedArtifact.id, content, error: null, loading: false })
      })
      .catch((error) => {
        if (!cancelled) {
          setArtifactPreview({
            artifactId: selectedArtifact.id,
            content: '',
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedArtifact])

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data || !selectedSoul || !selectedTemplate || !projectTitle.trim() || !projectContext.trim())
      return
    setSubmitting(true)
    try {
      const body = buildProjectPrompt(selectedSoul, selectedTemplate, projectContext)
      const result = await createProject({
        body,
        metadata: {
          inputHints: selectedTemplate.inputHints,
          outputKind: selectedTemplate.outputKind,
          reviewRubric: selectedTemplate.reviewRubric,
        },
        selectedSkillId: selectedTemplate.id,
        selectedSoulId: selectedSoul.id,
        title: projectTitle.trim(),
      })
      await startRun({
        projectId: result.project.id,
        executor: data.settings.executionMode === 'local-cli' ? data.settings.engineId : data.settings.byok.provider,
        metadata: {
          requestedFrom: 'worker-web',
        },
        prompt: body,
      })
      setSelectedProjectId(result.project.id)
      setProjectTitle('')
      setProjectContext('')
      await refresh()
    }
    finally {
      setSubmitting(false)
    }
  }

  if (state.loading && !data) {
    return (
      <main className="od-loading-shell">
        <span>Loading Soul workspace...</span>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="od-loading-shell">
        <span role="alert">{state.error}</span>
      </main>
    )
  }

  if (!data || !selectedSoul || !selectedTemplate)
    return null

  return (
    <main className="entry-shell">
      <div className="entry has-artifact-rail" style={{ gridTemplateColumns: '380px 1fr auto' }}>
        <aside className="entry-side" style={{ width: 380 }} aria-label="Soul project creator">
          <div className="entry-brand">
            <span className="entry-brand-mark" aria-hidden="true">AI</span>
            <div className="entry-brand-text">
              <div className="entry-brand-title-row">
                <span className="entry-brand-title">AIWorker</span>
                <span className="entry-brand-pill">Soul Workspace</span>
              </div>
              <div className="entry-brand-subtitle">Soul, capability template, project, artifact</div>
            </div>
          </div>

          <section className="newproj" data-testid="new-project-panel">
            <div className="newproj-tabs-shell can-right">
              <div className="newproj-tabs" role="tablist">
                {createTabs.map(tab => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeCreateTab === tab}
                    className={`newproj-tab ${activeCreateTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveCreateTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button type="button" className="newproj-tabs-arrow right" aria-label="More project creation options">
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </div>

            <form className="newproj-body" onSubmit={submitProject}>
              <h3 className="newproj-title">
                <span className="newproj-title-text">New Soul project</span>
              </h3>

              <input
                className="newproj-name"
                aria-label="Project name"
                data-testid="new-project-name"
                placeholder={projectNamePlaceholder(selectedSoul.id)}
                value={projectTitle}
                onChange={event => setProjectTitle(event.target.value)}
              />

              <section className="newproj-section">
                <label className="newproj-label">Soul</label>
                <button className="ds-select" type="button" aria-label="Selected Soul">
                  <span className="ds-icon-empty" aria-hidden="true">
                    <span />
                  </span>
                  <span className="ds-select-copy">
                    <strong>
                      {selectedSoul.name}
                      {' '}
                      Soul
                    </strong>
                    <small>{selectedSoul.domain}</small>
                  </span>
                  <ChevronDown aria-hidden="true" size={16} />
                </button>
                <div className="soul-picker-list" role="listbox" aria-label="Soul catalog">
                  {data.souls.map(soul => (
                    <button
                      key={soul.id}
                      type="button"
                      className={`soul-option ${selectedSoul.id === soul.id ? 'active' : ''}`}
                      disabled={soul.status !== 'available'}
                      aria-selected={selectedSoul.id === soul.id}
                      role="option"
                      onClick={() => {
                        setSelectedSoulId(soul.id)
                        const next = data.templates.find(template => template.soulId === soul.id)
                        if (next)
                          setSelectedTemplateId(next.id)
                      }}
                    >
                      <strong>{soul.name}</strong>
                      <small>{soul.status === 'available' ? soul.domain : 'coming soon'}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="newproj-section">
                <label className="newproj-label">Capability template</label>
                <div className="template-picker-list" role="listbox" aria-label="Capability templates">
                  {templates.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      className={`template-option ${selectedTemplate.id === template.id ? 'active' : ''}`}
                      aria-selected={selectedTemplate.id === template.id}
                      role="option"
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <strong>{template.name}</strong>
                      <small>{template.outputKind}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="newproj-section">
                <label className="newproj-label" htmlFor="project-context">Business context</label>
                <textarea
                  id="project-context"
                  className="newproj-context"
                  aria-label="Business context"
                  placeholder={selectedTemplate.inputHints.join(' · ')}
                  value={projectContext}
                  onChange={event => setProjectContext(event.target.value)}
                />
              </section>

              <button className="primary newproj-create" data-testid="create-project" type="submit" disabled={!projectTitle.trim() || !projectContext.trim() || submitting}>
                <Plus aria-hidden="true" size={13} />
                <span>{submitting ? 'Creating run...' : 'Create project and run'}</span>
              </button>
            </form>
            <div className="newproj-footer">Runs stay in this Soul workspace by default.</div>
          </section>

          <div className="entry-side-foot">
            <button type="button" className="foot-pill" onClick={() => setSettingsOpen(true)}>
              <Settings aria-hidden="true" size={12} />
              <span>{data.settings.executionMode === 'local-cli' ? 'Local CLI' : 'BYOK'}</span>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span>{selectedEngineLabel(data.settings)}</span>
            </button>
            <button type="button" className="foot-pill">
              <Languages aria-hidden="true" size={12} />
              <span>{data.settings.language}</span>
              <ChevronDown aria-hidden="true" size={12} />
            </button>
          </div>
        </aside>

        <section className="entry-main" aria-label="Soul projects and artifacts">
          <header className="entry-header">
            <div className="entry-tabs" role="tablist">
              {topTabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTopTab === tab}
                  className={`entry-tab ${activeTopTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTopTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="entry-header-right">
              <button className="settings-trigger" type="button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
                <Settings aria-hidden="true" size={16} />
              </button>
              <button className="avatar-btn" type="button" aria-label="Workspace">
                <span aria-hidden="true" className="avatar-btn-initials">{selectedSoul.name}</span>
              </button>
            </div>
          </header>

          <div className="entry-tab-content">
            <div className="tab-panel">
              <div className="tab-panel-toolbar">
                <div className="toolbar-left">
                  <div className="subtab-pill" role="group" aria-label="Project filters">
                    {projectTabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        className={activeProjectTab === tab ? 'active' : ''}
                        aria-pressed={activeProjectTab === tab}
                        onClick={() => setActiveProjectTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="toolbar-right">
                  <label className="toolbar-search">
                    <span className="search-icon" aria-hidden="true">
                      <Search size={13} />
                    </span>
                    <input
                      aria-label="Search projects"
                      placeholder="Search projects..."
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                    />
                  </label>
                  <div className="subtab-pill" role="group" aria-label="View mode">
                    <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}>
                      <Grid3X3 size={14} />
                    </button>
                    <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}>
                      <List size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className={view === 'grid' ? 'design-grid' : 'design-grid design-grid-list'}>
                {filteredProjects.length > 0
                  ? filteredProjects.map(item => (
                      <ProjectCard
                        key={item.id}
                        active={selectedProjectId === item.id}
                        artifact={artifactForProject(item, data.artifacts, data.runs)}
                        item={item}
                        run={runForProject(item, data.runs)}
                        template={data.templates.find(template => template.id === item.selectedSkillId)}
                        onSelect={() => setSelectedProjectId(item.id)}
                      />
                    ))
                  : (
                      <div className="empty-design-state">
                        <FileText aria-hidden="true" size={20} />
                        <strong>No projects yet</strong>
                        <span>
                          Create a
                          {' '}
                          {selectedSoul.name}
                          {' '}
                          project to generate the first business artifact.
                        </span>
                      </div>
                    )}
              </div>
            </div>
          </div>
        </section>

        <aside className="artifact-rail artifact-rail" aria-label="Business artifact preview">
          <header className="artifact-rail-head">
            <div className="artifact-rail-title">
              <Eye aria-hidden="true" size={14} />
              <strong>Artifact</strong>
            </div>
            <div className="artifact-rail-head-actions">
              <button type="button" className="artifact-rail-collapse" aria-label="Refresh workspace" onClick={() => void refresh()}>
                <RefreshCw size={14} />
              </button>
              <button type="button" className="artifact-rail-collapse" aria-label="Open artifact settings" onClick={() => setSettingsOpen(true)}>
                <Settings size={14} />
              </button>
            </div>
          </header>
          <p className="artifact-rail-hint">
            {selectedProject ? selectedProject.title : 'Select or create a project to inspect its artifact.'}
          </p>
          <div className="artifact-rail-status">
            <span className="artifact-rail-status-pill">
              <Circle aria-hidden="true" size={10} />
              <span>{latestRun ? titleCase(latestRun.status) : 'No run'}</span>
            </span>
          </div>
          <section className="artifact-panel">
            {selectedArtifact
              ? (
                  <>
                    <div className="rail-metadata">
                      <strong>{selectedArtifact.title}</strong>
                      <small>{selectedArtifact.kind}</small>
                      <small>{selectedArtifact.path}</small>
                    </div>
                    {artifactPreview.loading ? <div className="artifact-preview-state">Loading artifact...</div> : null}
                    {artifactPreview.error ? <div className="artifact-preview-state" role="alert">{artifactPreview.error}</div> : null}
                    {!artifactPreview.loading && !artifactPreview.error
                      ? <pre className="artifact-preview">{artifactPreview.content}</pre>
                      : null}
                  </>
                )
              : (
                  <div className="artifact-preview-state">Artifacts appear here after a project run.</div>
                )}
          </section>
          <section className="rail-metadata">
            <strong>Review</strong>
            <small>{selectedReview ? titleCase(selectedReview.verdict) : `${soulReviews.length} reviews in this Soul`}</small>
            <small>
              {data.lessons.length}
              {' '}
              memory candidates
            </small>
          </section>
        </aside>

        {settingsOpen
          ? (
              <SettingsDialog
                initial={data.settings}
                runtimeVersion={data.info.runtimeVersion}
                souls={data.souls}
                templates={data.templates}
                onClose={() => setSettingsOpen(false)}
                onSaved={(settings) => {
                  setState(current => current.data
                    ? { ...current, data: { ...current.data, settings }, loading: false }
                    : current)
                }}
              />
            )
          : null}
      </div>
    </main>
  )
}

function SettingsDialog({
  initial,
  onClose,
  onSaved,
  runtimeVersion,
  souls,
  templates,
}: {
  initial: LocalSettingsConfig
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
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
      <div className="modal modal-settings" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onClick={event => event.stopPropagation()}>
        <div className="settings-chrome" aria-hidden={false}>
          <div className={`settings-autosave ${autosaveClass(autosave)}`} role="status" aria-live="polite">
            {autosave === 'saving' ? <RefreshCw size={12} className="spin" /> : <Check size={12} />}
            <span>{autosaveCopy(autosave)}</span>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings" title="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <header className="modal-head">
          <span className="kicker">AIWORKER SETTINGS</span>
          <h2 id="settings-dialog-title">Configure Soul workspace</h2>
          <p className="subtitle">
            Choose how project runs execute, which team systems are available, and how the workspace presents language and appearance.
          </p>
        </header>

        <div className="modal-body">
          <aside className="settings-sidebar" aria-label="Settings sections">
            {settingsSections.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${section === item.id ? ' active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="settings-content">
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
            {section === 'soul-packs' ? <SoulPackSettings souls={souls} templates={templates} /> : null}
            {section === 'connectors' ? <ConnectorsSettings settings={settings} update={persist} /> : null}
            {section === 'mcp' ? <LocalMcpSettings settings={settings} update={persist} /> : null}
            {section === 'external-mcp' ? <ExternalMcpSettings settings={settings} update={persist} /> : null}
            {section === 'language' ? <LanguageSettings settings={settings} update={persist} /> : null}
            {section === 'appearance' ? <AppearanceSettings settings={settings} update={persist} /> : null}
            {section === 'about'
              ? (
                  <div className="settings-section">
                    <div className="section-head">
                      <div>
                        <h3>Local workspace runtime</h3>
                        <p className="hint">Runtime details are read from the workspace daemon.</p>
                      </div>
                    </div>
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
          </div>
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
  const installedCount = settings.engines.filter(engine => engine.installed).length
  return (
    <>
      <div className="seg-control" role="tablist" aria-label="Execution mode" style={{ '--seg-cols': 2 } as CSSProperties}>
        <button type="button" role="tab" aria-selected={settings.executionMode === 'local-cli'} className={`seg-btn ${settings.executionMode === 'local-cli' ? 'active' : ''}`} onClick={() => void update({ executionMode: 'local-cli' })}>
          <span className="seg-title">Local CLI</span>
          <span className="seg-meta">
            {installedCount}
            {' '}
            available
          </span>
        </button>
        <button type="button" role="tab" aria-selected={settings.executionMode === 'byok'} className={`seg-btn ${settings.executionMode === 'byok' ? 'active' : ''}`} onClick={() => void update({ executionMode: 'byok' })}>
          <span className="seg-title">BYOK</span>
          <span className="seg-meta">{settings.byok.provider}</span>
        </button>
      </div>

      {settings.executionMode === 'local-cli'
        ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>Local CLI engines</h3>
                  <p className="hint">Installed state comes from the workspace daemon PATH scan. The built-in template runner keeps the workspace usable before an external engine is configured.</p>
                </div>
                <div className="section-head-actions">
                  <button type="button" className="ghost icon-btn settings-test-btn" onClick={() => onTest(settings.engineId)}>
                    <span>Test</span>
                  </button>
                  <button type="button" className="ghost icon-btn settings-rescan-btn" onClick={onRescan}>
                    <RefreshCw size={13} />
                    <span>Rescan</span>
                  </button>
                </div>
              </div>

              <div className="agent-grid">
                {settings.engines.map(engine => (
                  <EngineCard
                    key={engine.id}
                    active={settings.engineId === engine.id}
                    engine={engine}
                    onSelect={() => void update({ engineId: engine.id })}
                  />
                ))}
              </div>
              {engineTest ? <p className="settings-note" role="status">{engineTest}</p> : null}
            </section>
          )
        : (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>BYOK provider</h3>
                  <p className="hint">The API key field stores a reference. Use env:NAME to resolve a key from the daemon environment.</p>
                </div>
              </div>
              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Provider</span>
                  <input value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>Base URL</span>
                  <input value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>Model</span>
                  <input value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>API key ref</span>
                  <input value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="env:OPENAI_API_KEY" />
                </label>
              </div>
            </section>
          )}
    </>
  )
}

function EngineCard({ active, engine, onSelect }: { active: boolean, engine: LocalEngineStatus, onSelect: () => void }) {
  return (
    <button type="button" className={`agent-card${active ? ' active' : ''}${engine.installed ? '' : ' disabled'}`} disabled={!engine.installed} aria-pressed={active} onClick={onSelect}>
      <span className={`agent-icon ${engine.installed ? 'agent-icon-dark' : 'agent-icon-gray'}`} aria-hidden="true">
        {engine.installed ? <Sparkles size={24} /> : <span />}
      </span>
      <span className="agent-card-body">
        <span className="agent-card-name">{engine.name}</span>
        <span className="agent-card-meta">
          {engine.installed
            ? <span>{engine.version ?? engine.path ?? engine.command}</span>
            : <span className="muted">not installed</span>}
        </span>
      </span>
      {engine.installed ? <span className={`status-dot${active ? ' active' : ''}`} aria-hidden="true" /> : null}
    </button>
  )
}

function SoulPackSettings({ souls, templates }: { souls: VerticalSoul[], templates: CapabilityTemplate[] }) {
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>Soul packs</h3>
          <p className="hint">Built-in Souls define the available domain systems and capability templates for this workspace.</p>
        </div>
      </div>
      <div className="settings-card-list">
        {souls.map(soul => (
          <article key={soul.id} className={`settings-card-row ${soul.status === 'available' ? '' : 'disabled'}`}>
            <strong>
              {soul.name}
              {' '}
              Soul
            </strong>
            <span>{soul.description}</span>
            <small>
              {templates.filter(template => template.soulId === soul.id).length}
              {' '}
              templates ·
              {' '}
              {soul.status === 'available' ? 'available' : 'coming soon'}
            </small>
          </article>
        ))}
      </div>
    </div>
  )
}

function ConnectorsSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>Connectors</h3>
          <p className="hint">Enable connector entries when the team system is ready to provide evidence for Soul projects.</p>
        </div>
      </div>
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

function LocalMcpSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>AIWorker workspace MCP server</h3>
          <p className="hint">Expose workspace context to an external engine that supports MCP.</p>
        </div>
      </div>
      <label className="switch-row">
        <span>
          <strong>Local workspace MCP</strong>
          <small>{settings.localMcpServer.url}</small>
        </span>
        <input checked={settings.localMcpServer.enabled} type="checkbox" onChange={event => void update({ localMcpServer: { ...settings.localMcpServer, enabled: event.target.checked } })} />
      </label>
    </div>
  )
}

function ExternalMcpSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>External MCP servers</h3>
          <p className="hint">Register command lines for external evidence tools. Secrets must stay in the external tool or environment.</p>
        </div>
      </div>
      <div className="connector-list">
        {settings.externalMcpServers.map(server => (
          <label key={server.id} className="settings-field">
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
      <div className="section-head">
        <div>
          <h3>Language</h3>
          <p className="hint">Saved to the workspace daemon settings record.</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label="Language" style={{ '--seg-cols': 4 } as CSSProperties}>
        {['en', 'zh-CN', 'ja', 'de'].map(language => (
          <button key={language} type="button" className={`seg-btn ${settings.language === language ? 'active' : ''}`} onClick={() => void update({ language })}>
            <span className="seg-title">{language}</span>
            <span className="seg-meta">Interface</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings({ settings, update }: { settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>Appearance</h3>
          <p className="hint">Choose the presentation mode for this workspace UI.</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label="Appearance" style={{ '--seg-cols': 3 } as CSSProperties}>
        <AppearanceButton active={settings.appearance === 'system'} icon={<Settings size={14} />} label="System" onClick={() => void update({ appearance: 'system' })} />
        <AppearanceButton active={settings.appearance === 'light'} icon={<Sun size={14} />} label="Light" onClick={() => void update({ appearance: 'light' })} />
        <AppearanceButton active={settings.appearance === 'dark'} icon={<Moon size={14} />} label="Dark" onClick={() => void update({ appearance: 'dark' })} />
      </div>
    </div>
  )
}

function AppearanceButton({ active, icon, label, onClick }: { active: boolean, icon: ReactNode, label: string, onClick: () => void }) {
  return (
    <button type="button" className={`seg-btn ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="seg-title seg-title-inline">
        {icon}
        {label}
      </span>
      <span className="seg-meta">Workspace</span>
    </button>
  )
}

function ProjectCard({
  active,
  artifact,
  item,
  onSelect,
  run,
  template,
}: {
  active: boolean
  artifact: LocalArtifact | null
  item: LocalProject
  onSelect: () => void
  run: LocalRun | null
  template?: CapabilityTemplate
}) {
  return (
    <button type="button" className={`design-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="design-card-thumb" aria-hidden="true">
        <FileText size={22} />
      </div>
      <div className="design-card-meta-block">
        <div className="design-card-name" title={item.title}>{item.title}</div>
        <div className="design-card-meta">
          <span className="ds">{template?.name ?? item.selectedSkillId}</span>
          {` · ${artifact?.kind ?? 'artifact pending'} · `}
          <span className="design-card-status design-card-status-succeeded">{titleCase(run?.status ?? item.status)}</span>
          {` · ${relativeTime(item.updatedAt)}`}
        </div>
      </div>
    </button>
  )
}

function buildProjectPrompt(soul: VerticalSoul, template: CapabilityTemplate, context: string): string {
  return [
    `Soul: ${soul.name}`,
    `Domain system: ${soul.domain}`,
    `Capability template: ${template.name}`,
    `Output kind: ${template.outputKind}`,
    '',
    'Business context:',
    context.trim(),
    '',
    'Input hints:',
    ...template.inputHints.map(item => `- ${item}`),
    '',
    'Review rubric:',
    ...template.reviewRubric.map(item => `- ${item}`),
  ].join('\n')
}

function artifactForProject(item: LocalProject, artifacts: LocalArtifact[], runs: LocalRun[]): LocalArtifact | null {
  const run = runForProject(item, runs)
  return run ? artifactForRun(run, artifacts) : null
}

function artifactForRun(run: LocalRun, artifacts: LocalArtifact[]): LocalArtifact | null {
  return artifacts.find(artifact => artifact.runId === run.id) ?? null
}

function reviewForRun(run: LocalRun, reviews: LocalReview[]): LocalReview | null {
  return reviews.find(review => review.runId === run.id) ?? null
}

function runForProject(item: LocalProject, runs: LocalRun[]): LocalRun | null {
  return runs.filter(run => run.projectId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
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

function autosaveClass(state: AutosaveState): string {
  if (state === 'saving')
    return 'is-saving'
  if (state === 'failed')
    return 'is-failed'
  return 'is-saved'
}

function projectNamePlaceholder(soulId: string): string {
  if (soulId === 'hr')
    return 'Senior backend candidate screen'
  if (soulId === 'pm')
    return 'Payments onboarding PRD'
  if (soulId === 'qa')
    return 'Release 1.2 regression gate'
  return 'Checkout deploy checklist'
}

function selectedEngineLabel(settings: LocalSettingsConfig): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ' · not installed'}` : settings.engineId
}
