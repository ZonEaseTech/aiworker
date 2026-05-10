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
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createProject, loadLocalWorkspaceData, readFile, rescanEngines, saveSettings, startRun, testEngine } from './api'
import {
  displaySoul,
  displayTemplate,
  formatRelativeTime,
  formatReviewVerdict,
  formatStatus,
  languageLabel,
  messagesFor,
  normalizeLocale,
  supportedLocales,
} from './i18n'

interface StudioState {
  data: LocalWorkspaceData | null
  error: string | null
  loading: boolean
}

type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'
type ResolvedTheme = 'light' | 'dark'
type WorkerMessages = ReturnType<typeof messagesFor>
interface ArtifactPreviewState {
  artifactId: string | null
  content: string
  error: string | null
  loading: boolean
}

const topTabs = ['projects', 'examples', 'domainSystems', 'connectors', 'templates', 'artifacts'] as const
const createTabs = ['project', 'template'] as const
const projectTabs = ['recent', 'thisSoul'] as const
const themeMediaQuery = '(prefers-color-scheme: dark)'

const settingsSections: Array<{
  icon: typeof SlidersHorizontal
  id: SettingsSection
}> = [
  { id: 'execution', icon: SlidersHorizontal },
  { id: 'soul-packs', icon: Sparkles },
  { id: 'connectors', icon: Link },
  { id: 'mcp', icon: ShieldCheck },
  { id: 'external-mcp', icon: Terminal },
  { id: 'language', icon: Languages },
  { id: 'appearance', icon: Sun },
  { id: 'about', icon: Settings },
]

export function WorkerStudio() {
  const [state, setState] = useState<StudioState>({ data: null, error: null, loading: true })
  const [selectedSoulId, setSelectedSoulId] = useState('hr')
  const [selectedTemplateId, setSelectedTemplateId] = useState('candidate-screen')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [activeTopTab, setActiveTopTab] = useState<(typeof topTabs)[number]>('projects')
  const [activeCreateTab, setActiveCreateTab] = useState<(typeof createTabs)[number]>('project')
  const [activeProjectTab, setActiveProjectTab] = useState<(typeof projectTabs)[number]>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution')
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
  const activeLocale = normalizeLocale(data?.settings.language)
  const copy = messagesFor(activeLocale)
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
      const templateCopy = template ? displayTemplate(template, activeLocale) : null
      return !needle
        || item.title.toLowerCase().includes(needle)
        || item.body.toLowerCase().includes(needle)
        || template?.name.toLowerCase().includes(needle)
        || templateCopy?.name.toLowerCase().includes(needle)
    })
  }, [activeLocale, data?.templates, query, soulProjects])

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
  const selectedSoulCopy = selectedSoul ? displaySoul(selectedSoul, activeLocale) : null
  const selectedTemplateCopy = selectedTemplate ? displayTemplate(selectedTemplate, activeLocale) : null
  const selectedProjectTemplate = selectedProject ? data?.templates.find(template => template.id === selectedProject.selectedSkillId) ?? null : null
  const selectedArtifactCopy = selectedProjectTemplate ? displayTemplate(selectedProjectTemplate, activeLocale) : null
  const systemTheme = useSystemTheme()
  const appearance = data?.settings.appearance ?? 'system'
  const resolvedTheme = resolveTheme(appearance, systemTheme)

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  function openSettings(section: SettingsSection = 'execution') {
    setSettingsInitialSection(section)
    setSettingsOpen(true)
  }

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
      <main className="od-loading-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <span>{copy.app.loading}</span>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="od-loading-shell" data-appearance={appearance} data-theme={resolvedTheme}>
        <span role="alert">{state.error}</span>
      </main>
    )
  }

  if (!data || !selectedSoul || !selectedTemplate || !selectedSoulCopy || !selectedTemplateCopy)
    return null

  return (
    <main className="entry-shell" data-appearance={appearance} data-theme={resolvedTheme} data-testid="worker-studio-shell">
      <div className="entry has-artifact-rail" style={{ gridTemplateColumns: '380px 1fr auto' }}>
        <aside className="entry-side" style={{ width: 380 }} aria-label={copy.accessibility.soulProjectCreator}>
          <div className="entry-brand">
            <span className="entry-brand-mark" aria-hidden="true">AI</span>
            <div className="entry-brand-text">
              <div className="entry-brand-title-row">
                <span className="entry-brand-title">{copy.app.brand}</span>
                <span className="entry-brand-pill">{copy.app.workspacePill}</span>
              </div>
              <div className="entry-brand-subtitle">{copy.app.subtitle}</div>
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
                    {copy.navigation.createTabs[tab]}
                  </button>
                ))}
              </div>
              <button type="button" className="newproj-tabs-arrow right" aria-label={copy.accessibility.moreCreationOptions}>
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </div>

            <form className="newproj-body" onSubmit={submitProject}>
              <h3 className="newproj-title">
                <span className="newproj-title-text">{copy.create.newProject}</span>
              </h3>

              <input
                className="newproj-name"
                aria-label={copy.create.projectName}
                data-testid="new-project-name"
                placeholder={projectNamePlaceholder(selectedSoul.id, copy)}
                value={projectTitle}
                onChange={event => setProjectTitle(event.target.value)}
              />

              <section className="newproj-section">
                <label className="newproj-label">{copy.create.soul}</label>
                <button className="ds-select" type="button" aria-label={copy.accessibility.selectedSoul}>
                  <span className="ds-icon-empty" aria-hidden="true">
                    <span />
                  </span>
                  <span className="ds-select-copy">
                    <strong>
                      {selectedSoulCopy.name}
                      {' '}
                      {copy.create.soul}
                    </strong>
                    <small>{selectedSoulCopy.domain}</small>
                  </span>
                  <ChevronDown aria-hidden="true" size={16} />
                </button>
                <div className="soul-picker-list" role="listbox" aria-label={copy.accessibility.soulCatalog}>
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
                      <strong>{displaySoul(soul, activeLocale).name}</strong>
                      <small>{soul.status === 'available' ? displaySoul(soul, activeLocale).domain : copy.common.comingSoon}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="newproj-section">
                <label className="newproj-label">{copy.create.capabilityTemplate}</label>
                <div className="template-picker-list" role="listbox" aria-label={copy.create.capabilityTemplate}>
                  {templates.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      className={`template-option ${selectedTemplate.id === template.id ? 'active' : ''}`}
                      aria-selected={selectedTemplate.id === template.id}
                      role="option"
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <strong>{displayTemplate(template, activeLocale).name}</strong>
                      <small>{displayTemplate(template, activeLocale).outputKind}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="newproj-section">
                <label className="newproj-label" htmlFor="project-context">{copy.create.businessContext}</label>
                <textarea
                  id="project-context"
                  className="newproj-context"
                  aria-label={copy.create.businessContext}
                  placeholder={selectedTemplateCopy.inputHints.join(' · ')}
                  value={projectContext}
                  onChange={event => setProjectContext(event.target.value)}
                />
              </section>

              <button className="primary newproj-create" data-testid="create-project" type="submit" disabled={!projectTitle.trim() || !projectContext.trim() || submitting}>
                <Plus aria-hidden="true" size={13} />
                <span>{submitting ? copy.create.creatingRun : copy.create.submit}</span>
              </button>
            </form>
            <div className="newproj-footer">{copy.create.footer}</div>
          </section>

          <div className="entry-side-foot">
            <button type="button" className="foot-pill" onClick={() => openSettings('execution')}>
              <Settings aria-hidden="true" size={12} />
              <span>{data.settings.executionMode === 'local-cli' ? 'Local CLI' : 'BYOK'}</span>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span>{selectedEngineLabel(data.settings, copy)}</span>
            </button>
            <button type="button" className="foot-pill" aria-label={copy.accessibility.languageSwitcher} onClick={() => openSettings('language')}>
              <Languages aria-hidden="true" size={12} />
              <span>{languageLabel(activeLocale, activeLocale)}</span>
              <ChevronDown aria-hidden="true" size={12} />
            </button>
          </div>
        </aside>

        <section className="entry-main" aria-label={copy.accessibility.soulProjectsAndArtifacts}>
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
                  {copy.navigation.topTabs[tab]}
                </button>
              ))}
            </div>
            <div className="entry-header-right">
              <button className="settings-trigger" type="button" aria-label={copy.accessibility.openSettings} onClick={() => openSettings()}>
                <Settings aria-hidden="true" size={16} />
              </button>
              <button className="avatar-btn" type="button" aria-label={copy.accessibility.workspace}>
                <span aria-hidden="true" className="avatar-btn-initials">{selectedSoulCopy.name}</span>
              </button>
            </div>
          </header>

          <div className="entry-tab-content">
            <div className="tab-panel">
              <div className="tab-panel-toolbar">
                <div className="toolbar-left">
                  <div className="subtab-pill" role="group" aria-label={copy.accessibility.projectFilters}>
                    {projectTabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        className={activeProjectTab === tab ? 'active' : ''}
                        aria-pressed={activeProjectTab === tab}
                        onClick={() => setActiveProjectTab(tab)}
                      >
                        {copy.navigation.projectTabs[tab]}
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
                      aria-label={copy.accessibility.searchProjects}
                      placeholder={copy.projects.searchPlaceholder}
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                    />
                  </label>
                  <div className="subtab-pill" role="group" aria-label={copy.accessibility.viewMode}>
                    <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label={copy.accessibility.gridView} onClick={() => setView('grid')}>
                      <Grid3X3 size={14} />
                    </button>
                    <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label={copy.accessibility.listView} onClick={() => setView('list')}>
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
                        locale={activeLocale}
                        run={runForProject(item, data.runs)}
                        template={data.templates.find(template => template.id === item.selectedSkillId)}
                        onSelect={() => setSelectedProjectId(item.id)}
                      />
                    ))
                  : (
                      <div className="empty-design-state">
                        <FileText aria-hidden="true" size={20} />
                        <strong>{copy.projects.empty.title}</strong>
                        <span>{copy.projects.empty.detail(selectedSoulCopy.name)}</span>
                      </div>
                    )}
              </div>
            </div>
          </div>
        </section>

        <aside className="artifact-rail artifact-rail" aria-label={copy.accessibility.businessArtifactPreview}>
          <header className="artifact-rail-head">
            <div className="artifact-rail-title">
              <Eye aria-hidden="true" size={14} />
              <strong>{copy.artifact.label}</strong>
            </div>
            <div className="artifact-rail-head-actions">
              <button type="button" className="artifact-rail-collapse" aria-label={copy.accessibility.refreshWorkspace} onClick={() => void refresh()}>
                <RefreshCw size={14} />
              </button>
              <button type="button" className="artifact-rail-collapse" aria-label={copy.accessibility.artifactSettings} onClick={() => openSettings('appearance')}>
                <Settings size={14} />
              </button>
            </div>
          </header>
          <p className="artifact-rail-hint">
            {selectedProject ? selectedProject.title : copy.artifact.defaultHint}
          </p>
          <div className="artifact-rail-status">
            <span className="artifact-rail-status-pill">
              <Circle aria-hidden="true" size={10} />
              <span>{latestRun ? formatStatus(latestRun.status, activeLocale) : copy.artifact.noRun}</span>
            </span>
          </div>
          <section className="artifact-panel">
            {selectedArtifact
              ? (
                  <>
                    <div className="rail-metadata">
                      <strong>{selectedArtifactCopy?.name ?? selectedArtifact.title}</strong>
                      <small>{selectedArtifactCopy?.outputKind ?? selectedArtifact.kind}</small>
                      <small>{selectedArtifact.path}</small>
                    </div>
                    {artifactPreview.loading ? <div className="artifact-preview-state">{copy.artifact.loading}</div> : null}
                    {artifactPreview.error ? <div className="artifact-preview-state" role="alert">{artifactPreview.error}</div> : null}
                    {!artifactPreview.loading && !artifactPreview.error
                      ? <pre className="artifact-preview">{artifactPreview.content}</pre>
                      : null}
                  </>
                )
              : (
                  <div className="artifact-preview-state">{copy.artifact.empty}</div>
                )}
          </section>
          <section className="rail-metadata">
            <strong>{copy.artifact.review}</strong>
            <small>{selectedReview ? formatReviewVerdict(selectedReview.verdict, activeLocale) : copy.artifact.reviewCount(soulReviews.length)}</small>
            <small>{copy.artifact.memoryCandidates(data.lessons.length)}</small>
          </section>
        </aside>

        {settingsOpen
          ? (
              <SettingsDialog
                initial={data.settings}
                initialSection={settingsInitialSection}
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
  initialSection,
  onClose,
  onSaved,
  runtimeVersion,
  souls,
  templates,
}: {
  initial: LocalSettingsConfig
  initialSection: SettingsSection
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
  souls: VerticalSoul[]
  templates: CapabilityTemplate[]
}) {
  const [settings, setSettings] = useState(initial)
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [autosave, setAutosave] = useState<AutosaveState>('saved')
  const [engineTest, setEngineTest] = useState<string | null>(null)
  const activeLocale = normalizeLocale(settings.language)
  const copy = messagesFor(activeLocale)
  const settingsCopy = copy.settings

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
    setEngineTest(settingsCopy.engine.testing)
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
            <span>{autosaveCopy(autosave, settingsCopy)}</span>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label={copy.accessibility.closeSettings} title={copy.accessibility.closeSettings}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <header className="modal-head">
          <span className="kicker">{settingsCopy.dialog.kicker}</span>
          <h2 id="settings-dialog-title">{settingsCopy.dialog.title}</h2>
          <p className="subtitle">{settingsCopy.dialog.subtitle}</p>
        </header>

        <div className="modal-body">
          <aside className="settings-sidebar" aria-label={settingsCopy.dialog.title}>
            {settingsSections.map((item) => {
              const Icon = item.icon
              const navCopy = settingsNavCopy(settingsCopy.nav, item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${section === item.id ? ' active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{navCopy.title}</strong>
                    <small>{navCopy.detail}</small>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="settings-content">
            {section === 'execution'
              ? (
                  <ExecutionSettings
                    copy={copy}
                    engineTest={engineTest}
                    onRescan={() => void handleRescan()}
                    onTest={engineId => void handleTest(engineId)}
                    settings={settings}
                    update={persist}
                  />
                )
              : null}
            {section === 'soul-packs' ? <SoulPackSettings copy={copy} locale={activeLocale} souls={souls} templates={templates} /> : null}
            {section === 'connectors' ? <ConnectorsSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'mcp' ? <LocalMcpSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'external-mcp' ? <ExternalMcpSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'language' ? <LanguageSettings copy={copy} locale={activeLocale} update={persist} /> : null}
            {section === 'appearance' ? <AppearanceSettings copy={copy} settings={settings} update={persist} /> : null}
            {section === 'about'
              ? (
                  <div className="settings-section">
                    <div className="section-head">
                      <div>
                        <h3>{settingsCopy.about.title}</h3>
                        <p className="hint">{settingsCopy.about.hint}</p>
                      </div>
                    </div>
                    <dl className="about-grid">
                      <div>
                        <dt>{settingsCopy.about.version}</dt>
                        <dd>{runtimeVersion}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.executionMode}</dt>
                        <dd>{settings.executionMode}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.selectedEngine}</dt>
                        <dd>{settings.engineId}</dd>
                      </div>
                      <div>
                        <dt>{settingsCopy.about.updated}</dt>
                        <dd>{formatRelativeTime(settings.updatedAt, activeLocale)}</dd>
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
  copy,
  engineTest,
  onRescan,
  onTest,
  settings,
  update,
}: {
  copy: ReturnType<typeof messagesFor>
  engineTest: string | null
  onRescan: () => void
  onTest: (engineId: string) => void
  settings: LocalSettingsConfig
  update: (patch: Partial<LocalSettingsConfig>) => Promise<void>
}) {
  const installedCount = settings.engines.filter(engine => engine.installed).length
  const settingsCopy = copy.settings
  return (
    <>
      <div className="seg-control" role="tablist" aria-label={settingsCopy.nav.execution} style={{ '--seg-cols': 2 } as CSSProperties}>
        <button type="button" role="tab" aria-selected={settings.executionMode === 'local-cli'} className={`seg-btn ${settings.executionMode === 'local-cli' ? 'active' : ''}`} onClick={() => void update({ executionMode: 'local-cli' })}>
          <span className="seg-title">Local CLI</span>
          <span className="seg-meta">{settingsCopy.engine.availableCount(installedCount)}</span>
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
                  <h3>{settingsCopy.engine.title}</h3>
                  <p className="hint">{settingsCopy.engine.hint}</p>
                </div>
                <div className="section-head-actions">
                  <button type="button" className="ghost icon-btn settings-test-btn" onClick={() => onTest(settings.engineId)}>
                    <span>{settingsCopy.engine.test}</span>
                  </button>
                  <button type="button" className="ghost icon-btn settings-rescan-btn" onClick={onRescan}>
                    <RefreshCw size={13} />
                    <span>{settingsCopy.engine.rescan}</span>
                  </button>
                </div>
              </div>

              <div className="agent-grid">
                {settings.engines.map(engine => (
                  <EngineCard
                    key={engine.id}
                    active={settings.engineId === engine.id}
                    copy={copy}
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
                  <h3>{settingsCopy.byok.title}</h3>
                  <p className="hint">{settingsCopy.byok.hint}</p>
                </div>
              </div>
              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>{settingsCopy.byok.provider}</span>
                  <input value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.baseUrl}</span>
                  <input value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.model}</span>
                  <input value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
                </label>
                <label className="settings-field">
                  <span>{settingsCopy.byok.apiKeyRef}</span>
                  <input value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="env:OPENAI_API_KEY" />
                </label>
              </div>
            </section>
          )}
    </>
  )
}

function EngineCard({ active, copy, engine, onSelect }: { active: boolean, copy: ReturnType<typeof messagesFor>, engine: LocalEngineStatus, onSelect: () => void }) {
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
            : <span className="muted">{copy.common.notInstalled}</span>}
        </span>
      </span>
      {engine.installed ? <span className={`status-dot${active ? ' active' : ''}`} aria-hidden="true" /> : null}
    </button>
  )
}

function SoulPackSettings({ copy, locale, souls, templates }: { copy: ReturnType<typeof messagesFor>, locale: ReturnType<typeof normalizeLocale>, souls: VerticalSoul[], templates: CapabilityTemplate[] }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.soulPacks.title}</h3>
          <p className="hint">{settingsCopy.soulPacks.hint}</p>
        </div>
      </div>
      <div className="settings-card-list">
        {souls.map((soul) => {
          const soulCopy = displaySoul(soul, locale)
          return (
            <article key={soul.id} className={`settings-card-row ${soul.status === 'available' ? '' : 'disabled'}`}>
              <strong>
                {soulCopy.name}
                {' '}
                {copy.create.soul}
              </strong>
              <span>{soulCopy.description}</span>
              <small>
                {templates.filter(template => template.soulId === soul.id).length}
                {' '}
                {copy.common.templates}
                {' · '}
                {soul.status === 'available' ? copy.common.available : copy.common.comingSoon}
              </small>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ConnectorsSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.connectors.title}</h3>
          <p className="hint">{settingsCopy.connectors.hint}</p>
        </div>
      </div>
      <div className="connector-list">
        {settings.connectors.map(connector => (
          <label key={connector.id} className="switch-row">
            <span>
              <strong>{connector.name}</strong>
              <small>{connector.status === 'configured' ? settingsCopy.connectors.configured : settingsCopy.connectors.notConfigured}</small>
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

function LocalMcpSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.localMcp.title}</h3>
          <p className="hint">{settingsCopy.localMcp.hint}</p>
        </div>
      </div>
      <label className="switch-row">
        <span>
          <strong>{settingsCopy.localMcp.toggle}</strong>
          <small>{settings.localMcpServer.url}</small>
        </span>
        <input checked={settings.localMcpServer.enabled} type="checkbox" onChange={event => void update({ localMcpServer: { ...settings.localMcpServer, enabled: event.target.checked } })} />
      </label>
    </div>
  )
}

function ExternalMcpSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.externalMcp.title}</h3>
          <p className="hint">{settingsCopy.externalMcp.hint}</p>
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
              placeholder={settingsCopy.externalMcp.placeholder}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function LanguageSettings({ copy, locale, update }: { copy: ReturnType<typeof messagesFor>, locale: ReturnType<typeof normalizeLocale>, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.language.title}</h3>
          <p className="hint">{settingsCopy.language.hint}</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label={settingsCopy.language.title} style={{ '--seg-cols': 4 } as CSSProperties}>
        {supportedLocales.map(language => (
          <button key={language} type="button" className={`seg-btn ${locale === language ? 'active' : ''}`} onClick={() => void update({ language })}>
            <span className="seg-title">{languageLabel(language, locale)}</span>
            <span className="seg-meta">{copy.common.interface}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{settingsCopy.appearance.title}</h3>
          <p className="hint">{settingsCopy.appearance.hint}</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label={settingsCopy.appearance.title} style={{ '--seg-cols': 3 } as CSSProperties}>
        <AppearanceButton active={settings.appearance === 'system'} icon={<Settings size={14} />} label={settingsCopy.appearance.system} meta={copy.common.workspace} onClick={() => void update({ appearance: 'system' })} />
        <AppearanceButton active={settings.appearance === 'light'} icon={<Sun size={14} />} label={settingsCopy.appearance.light} meta={copy.common.workspace} onClick={() => void update({ appearance: 'light' })} />
        <AppearanceButton active={settings.appearance === 'dark'} icon={<Moon size={14} />} label={settingsCopy.appearance.dark} meta={copy.common.workspace} onClick={() => void update({ appearance: 'dark' })} />
      </div>
    </div>
  )
}

function AppearanceButton({ active, icon, label, meta, onClick }: { active: boolean, icon: ReactNode, label: string, meta: string, onClick: () => void }) {
  return (
    <button type="button" className={`seg-btn ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="seg-title seg-title-inline">
        {icon}
        {label}
      </span>
      <span className="seg-meta">{meta}</span>
    </button>
  )
}

function ProjectCard({
  active,
  artifact,
  item,
  locale,
  onSelect,
  run,
  template,
}: {
  active: boolean
  artifact: LocalArtifact | null
  item: LocalProject
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  run: LocalRun | null
  template?: CapabilityTemplate
}) {
  const copy = messagesFor(locale)
  const templateCopy = template ? displayTemplate(template, locale) : null
  const artifactLabel = artifact ? templateCopy?.outputKind ?? artifact.kind : copy.artifact.pending
  return (
    <button type="button" className={`design-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="design-card-thumb" aria-hidden="true">
        <FileText size={22} />
      </div>
      <div className="design-card-meta-block">
        <div className="design-card-name" title={item.title}>{item.title}</div>
        <div className="design-card-meta">
          <span className="ds">{templateCopy?.name ?? item.selectedSkillId}</span>
          {` · ${artifactLabel} · `}
          <span className="design-card-status design-card-status-succeeded">{formatStatus(run?.status ?? item.status, locale)}</span>
          {` · ${formatRelativeTime(item.updatedAt, locale)}`}
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

function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, readSystemTheme, () => 'light')
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {}
  const media = window.matchMedia(themeMediaQuery)
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }
  media.addListener(onChange)
  return () => media.removeListener(onChange)
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'light'
  return window.matchMedia(themeMediaQuery).matches ? 'dark' : 'light'
}

function resolveTheme(appearance: LocalSettingsConfig['appearance'], systemTheme: ResolvedTheme): ResolvedTheme {
  return appearance === 'system' ? systemTheme : appearance
}

function settingsNavCopy(nav: WorkerMessages['settings']['nav'], section: SettingsSection): { detail: string, title: string } {
  if (section === 'execution')
    return { title: nav.execution, detail: nav.executionDetail }
  if (section === 'soul-packs')
    return { title: nav.soulPacks, detail: nav.soulPacksDetail }
  if (section === 'connectors')
    return { title: nav.connectors, detail: nav.connectorsDetail }
  if (section === 'mcp')
    return { title: nav.localMcp, detail: nav.localMcpDetail }
  if (section === 'external-mcp')
    return { title: nav.externalMcp, detail: nav.externalMcpDetail }
  if (section === 'language')
    return { title: nav.language, detail: nav.languageDetail }
  if (section === 'appearance')
    return { title: nav.appearance, detail: nav.appearanceDetail }
  return { title: nav.about, detail: nav.aboutDetail }
}

function autosaveCopy(state: AutosaveState, settingsCopy: WorkerMessages['settings']): string {
  if (state === 'saving')
    return settingsCopy.autosave.saving
  if (state === 'failed')
    return settingsCopy.autosave.failed
  return settingsCopy.autosave.saved
}

function autosaveClass(state: AutosaveState): string {
  if (state === 'saving')
    return 'is-saving'
  if (state === 'failed')
    return 'is-failed'
  return 'is-saved'
}

function projectNamePlaceholder(soulId: string, copy: WorkerMessages): string {
  if (soulId === 'hr')
    return copy.create.projectPlaceholders.hr
  if (soulId === 'pm')
    return copy.create.projectPlaceholders.pm
  if (soulId === 'qa')
    return copy.create.projectPlaceholders.qa
  if (soulId === 'devops')
    return copy.create.projectPlaceholders.devops
  return copy.create.projectPlaceholders.default
}

function selectedEngineLabel(settings: LocalSettingsConfig, copy: WorkerMessages): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}` : settings.engineId
}
