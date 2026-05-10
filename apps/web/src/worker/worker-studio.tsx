import type { LocalRun } from '@zonease/aiworker-shared'
import type { CSSProperties, FormEvent } from 'react'
import type { LocalWorkspaceData } from './api'

import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Grid3X3,
  Image,
  Languages,
  Link,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createBrief, loadLocalWorkspaceData, startRun } from './api'

interface StudioState {
  data: LocalWorkspaceData | null
  loading: boolean
  error: string | null
}

interface ProjectCard {
  title: string
  engine: string
  type: string
  status: string
  age: string
}

const topTabs = ['Work orders', 'Examples', 'Worker packs', 'Connectors', 'Templates', 'Artifacts'] as const
const createTabs = ['Work order', 'From template', 'From artifact', 'Saved template'] as const
const designTabs = ['Recent', 'This workspace'] as const

const settingsSections = [
  { id: 'execution', title: 'Configure executor', detail: 'Local CLI / BYOK', icon: SlidersHorizontal },
  { id: 'packs', title: 'Worker packs', detail: 'Developer / HR / PM / QA', icon: Image },
  { id: 'connectors', title: 'Connectors', detail: 'External system connections', icon: SlidersHorizontal },
  { id: 'orbit', title: 'Daily summary', detail: 'Workspace changes and connector signals', icon: Eye },
  { id: 'mcp', title: 'MCP server', detail: 'Expose workspace context to your coding agent.', icon: Link },
  { id: 'external-mcp', title: 'External MCP', detail: 'Add MCP tools from external services.', icon: Sparkles },
  { id: 'language', title: 'Language', detail: 'Switch the interface language. Saved to this browser.', icon: Languages },
  { id: 'appearance', title: 'Appearance', detail: 'Choose light, dark, or follow system.', icon: Sun },
  { id: 'notifications', title: 'Notifications', detail: 'Completion alerts and sounds.', icon: Bell },
  { id: 'companion', title: 'Companion', detail: 'Adopt or customize', icon: Sparkles },
  { id: 'about', title: 'About', detail: 'Version and runtime details.', icon: Settings },
] as const

const engines = [
  { id: 'claude-code', name: 'Claude Code', detail: '2.1.132 (Claude Code)', installed: true, tone: 'coral' },
  { id: 'codex-cli', name: 'Codex CLI', detail: 'codex-cli 0.128.0', installed: true, tone: 'dark' },
  { id: 'devin', name: 'Devin for Terminal', detail: 'not installed', installed: false, tone: 'gray' },
  { id: 'gemini', name: 'Gemini CLI', detail: 'not installed', installed: false, tone: 'violet' },
  { id: 'opencode', name: 'OpenCode', detail: 'not installed', installed: false, tone: 'green' },
  { id: 'hermes', name: 'Hermes', detail: 'not installed', installed: false, tone: 'gray' },
  { id: 'kimi', name: 'Kimi CLI', detail: 'not installed', installed: false, tone: 'gray' },
  { id: 'cursor', name: 'Cursor Agent', detail: 'not installed', installed: false, tone: 'dark' },
  { id: 'qwen', name: 'Qwen Code', detail: 'not installed', installed: false, tone: 'violet' },
  { id: 'qoder', name: 'Qoder CLI', detail: 'not installed', installed: false, tone: 'dark' },
] as const

type EngineId = (typeof engines)[number]['id']

export function WorkerStudio() {
  const [state, setState] = useState<StudioState>({ data: null, loading: true, error: null })
  const [projectName, setProjectName] = useState('')
  const [activeTopTab, setActiveTopTab] = useState<(typeof topTabs)[number]>('Work orders')
  const [activeCreateTab, setActiveCreateTab] = useState<(typeof createTabs)[number]>('Work order')
  const [activeDesignTab, setActiveDesignTab] = useState<(typeof designTabs)[number]>('Recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedEngine, setSelectedEngine] = useState<EngineId>('codex-cli')
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, loading: false, error: null })
    }
    catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = projectName.trim()
    if (!title)
      return

    setSubmitting(true)
    try {
      const body = `Run this work order for ${title}. Produce a visible artifact and capture review notes.`
      const result = await createBrief({ title, body })
      await startRun({ briefId: result.brief.id, prompt: body })
      setProjectName('')
      await refresh()
    }
    finally {
      setSubmitting(false)
    }
  }

  const projects = useMemo(() => {
    const fromData = buildProjectCards(state.data)
    const fallback: ProjectCard[] = [
      { title: 'Developer repo review', engine: 'developer', type: 'verification-report', status: 'Completed', age: '2d ago' },
      { title: 'Candidate screen', engine: 'hr-recruiting', type: 'candidate-screen', status: 'Completed', age: '3d ago' },
    ]
    return fromData.length > 0 ? fromData : fallback
  }, [state.data])

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle)
      return projects
    return projects.filter(project => project.title.toLowerCase().includes(needle))
  }, [projects, query])

  if (state.loading && !state.data) {
    return (
      <main className="od-loading-shell">
        <span>Loading workspace...</span>
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

  return (
    <main className="entry-shell">
      <div
        className="entry has-pet-rail"
        style={{ gridTemplateColumns: '380px 1fr auto' }}
      >
        <aside className="entry-side" style={{ width: 380 }} aria-label="Work order creator">
          <div className="entry-brand">
            <span className="entry-brand-mark" aria-hidden="true">
              <img src="/logo.svg" alt="" className="brand-mark-img" draggable={false} />
            </span>
            <div className="entry-brand-text">
              <div className="entry-brand-title-row">
                <span className="entry-brand-title">AIWorker</span>
                <span className="entry-brand-pill">Local Worker</span>
              </div>
              <div className="entry-brand-subtitle">work order studio</div>
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
              <button
                type="button"
                className="newproj-tabs-arrow right"
                aria-label="Scroll project types right"
              >
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </div>

            <form className="newproj-body" onSubmit={submitProject}>
              <h3 className="newproj-title">
                <span className="newproj-title-text">New work order</span>
              </h3>

              <input
                className="newproj-name"
                aria-label="Work order name"
                data-testid="new-project-name"
                placeholder="What should this worker do?"
                value={projectName}
                onChange={event => setProjectName(event.target.value)}
              />

              <section className="newproj-section">
                <label className="newproj-label">Worker pack</label>
                <button className="ds-select" type="button">
                  <span className="ds-icon-empty" aria-hidden="true">
                    <span />
                  </span>
                  <span className="ds-select-copy">
                    <strong>Developer - code workspace</strong>
                    <small>Switch to HR, PM, QA, finance, or legal later</small>
                  </span>
                  <ChevronDown aria-hidden="true" size={16} />
                </button>
              </section>

              <section className="newproj-section">
                <label className="newproj-label">Run depth</label>
                <div className="fidelity-grid">
                  <FidelityCard label="Quick pass" variant="wireframe" />
                  <FidelityCard label="Full artifact" variant="high-fidelity" active />
                </div>
              </section>

              <button
                className="primary newproj-create"
                data-testid="create-project"
                type="submit"
                disabled={!projectName.trim() || submitting}
              >
                <Plus aria-hidden="true" size={13} />
                <span>Create</span>
              </button>

              <button className="ghost newproj-import" type="button">
                <Upload aria-hidden="true" size={13} />
                <span>Import work order file</span>
              </button>
            </form>
            <div className="newproj-footer">Runs stay local to this workspace by default.</div>
          </section>

          <div className="entry-side-foot">
            <button type="button" className="foot-pill pet-pill pet-pill-fresh">
              <span className="pet-pill-glyph" aria-hidden="true">✦</span>
              <span>Change companion</span>
            </button>
            <button type="button" className="foot-pill" onClick={() => setSettingsOpen(true)}>
              <Settings aria-hidden="true" size={12} />
              <span>Local CLI</span>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <span>Codex CLI · codex-cli 0.128.0</span>
            </button>
            <button type="button" className="foot-pill">
              <Languages aria-hidden="true" size={12} />
              <span>English</span>
              <ChevronDown aria-hidden="true" size={12} />
            </button>
          </div>
        </aside>

        <section className="entry-main" aria-label="Work orders">
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
              <button
                className="settings-trigger"
                type="button"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings aria-hidden="true" size={16} />
              </button>
              <button className="avatar-btn" type="button" aria-label="Account">
                <span aria-hidden="true" className="avatar-btn-initials">AI</span>
              </button>
            </div>
          </header>

          <div className="entry-tab-content">
            <div className="tab-panel">
              <div className="tab-panel-toolbar">
                <div className="toolbar-left">
                  <div className="subtab-pill" role="group" aria-label="Work order filters">
                    {designTabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        className={activeDesignTab === tab ? 'active' : ''}
                        aria-pressed={activeDesignTab === tab}
                        onClick={() => setActiveDesignTab(tab)}
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
                      aria-label="Search work orders"
                      placeholder="Search work orders..."
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                    />
                  </label>
                  <div className="subtab-pill" role="group" aria-label="View mode">
                    <button
                      type="button"
                      className={view === 'grid' ? 'active' : ''}
                      aria-pressed={view === 'grid'}
                      aria-label="Grid view"
                      onClick={() => setView('grid')}
                    >
                      <Grid3X3 size={14} />
                    </button>
                    <button
                      type="button"
                      className={view === 'list' ? 'active' : ''}
                      aria-pressed={view === 'list'}
                      aria-label="List view"
                      onClick={() => setView('list')}
                    >
                      <List size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className={view === 'grid' ? 'design-grid' : 'design-grid design-grid-list'}>
                {visibleProjects.map(project => (
                  <DesignCard key={`${project.title}-${project.age}`} project={project} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="pet-rail" aria-label="Companion">
          <header className="pet-rail-head">
            <div className="pet-rail-title">
              <span aria-hidden="true">✦</span>
              <strong>COMPANION</strong>
            </div>
            <div className="pet-rail-head-actions">
              <button type="button" className="pet-rail-collapse" aria-label="Collapse pet picker">
                <ChevronRight size={14} />
              </button>
              <button type="button" className="pet-rail-collapse" aria-label="Hide pet picker">
                <X size={14} />
              </button>
            </div>
          </header>
          <p className="pet-rail-hint">Pick a small status helper for this workspace.</p>
          <div className="pet-rail-status">
            <button type="button" className="pet-rail-status-pill">
              <Eye aria-hidden="true" size={12} />
              <span>Tuck away</span>
            </button>
          </div>
          <div className="pet-rail-list">
            <button
              type="button"
              className="pet-rail-item active"
              aria-pressed="true"
              style={{ '--pet-accent': 'var(--accent)' } as CSSProperties}
            >
              <span className="pet-rail-item-glyph" aria-hidden="true">👨‍💼</span>
              <span className="pet-rail-item-meta">
                <span className="pet-rail-item-name">Buddy</span>
                <span className="pet-rail-item-flavor">Local status, run hints, and quick actions</span>
              </span>
              <Check size={14} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="pet-rail-customize">
            <Sparkles aria-hidden="true" size={12} />
            <span>Customize...</span>
          </button>
          <div className="floating-pet" aria-hidden="true">T</div>
        </aside>

        {settingsOpen
          ? (
              <SettingsDialog
                selectedEngine={selectedEngine}
                onClose={() => setSettingsOpen(false)}
                onEngineChange={setSelectedEngine}
              />
            )
          : null}
      </div>
    </main>
  )
}

function SettingsDialog({
  selectedEngine,
  onClose,
  onEngineChange,
}: {
  selectedEngine: EngineId
  onClose: () => void
  onEngineChange: (engine: EngineId) => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="settings-chrome" aria-hidden={false}>
          <div className="settings-autosave is-saved" role="status" aria-live="polite">
            <Check size={12} />
            <span>All changes saved</span>
          </div>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <header className="modal-head">
          <span className="kicker">WELCOME</span>
          <h2 id="settings-dialog-title">Set up AIWorker</h2>
          <p className="subtitle">
            Pick how local runs execute. You can change this any time from the Settings button.
          </p>
          <button type="button" className="welcome-pet-teaser">
            <span className="welcome-pet-glyph" aria-hidden="true">
              ✦
            </span>
            <span className="welcome-pet-copy">
              <strong>Choose a companion</strong>
              <span>A small workspace helper for run status and quick actions.</span>
            </span>
            <span className="welcome-pet-cta">
              Pick one
              <ChevronRight size={12} />
            </span>
          </button>
        </header>

        <div className="modal-body">
          <aside className="settings-sidebar" aria-label="Settings sections">
            {settingsSections.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`settings-nav-item${section.id === 'execution' ? ' active' : ''}`}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{section.title}</strong>
                    <small>{section.detail}</small>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="settings-content">
            <div
              className="seg-control"
              role="tablist"
              aria-label="Execution mode"
              style={{ '--seg-cols': 2 } as CSSProperties}
            >
              <button type="button" role="tab" aria-selected="true" className="seg-btn active">
                <span className="seg-title">Local CLI</span>
                <span className="seg-meta">2 installed</span>
              </button>
              <button type="button" role="tab" aria-selected="false" className="seg-btn">
                <span className="seg-title">BYOK</span>
                <span className="seg-meta">API provider</span>
              </button>
            </div>

            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>Local CLI</h3>
                  <p className="hint">Detected by scanning your PATH. Pick the CLI you want work orders to flow through.</p>
                </div>
                <div className="section-head-actions">
                  <button type="button" className="ghost icon-btn settings-test-btn">
                    <span>Test</span>
                  </button>
                  <button type="button" className="ghost icon-btn settings-rescan-btn">
                    <RefreshCw size={13} />
                    <span>Rescan</span>
                  </button>
                </div>
              </div>

              <div className="agent-grid">
                {engines.map(engine => (
                  <button
                    key={engine.id}
                    type="button"
                    className={`agent-card${selectedEngine === engine.id ? ' active' : ''}${engine.installed ? '' : ' disabled'}`}
                    disabled={!engine.installed}
                    aria-pressed={selectedEngine === engine.id}
                    onClick={() => onEngineChange(engine.id)}
                  >
                    <span className={`agent-icon agent-icon-${engine.tone}`} aria-hidden="true">
                      {engine.installed
                        ? <Sparkles size={28} />
                        : <span />}
                    </span>
                    <span className="agent-card-body">
                      <span className="agent-card-name">{engine.name}</span>
                      <span className="agent-card-meta">
                        {engine.installed
                          ? <span>{engine.detail}</span>
                          : <span className="muted">{engine.detail}</span>}
                      </span>
                    </span>
                    {engine.installed
                      ? (
                          <span className={`status-dot${selectedEngine === engine.id ? ' active' : ''}`} aria-hidden="true" />
                        )
                      : null}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function FidelityCard({
  label,
  variant,
  active = false,
}: {
  label: string
  variant: 'wireframe' | 'high-fidelity'
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`fidelity-card${active ? ' active' : ''}`}
      aria-pressed={active}
    >
      <span className={`fidelity-thumb fidelity-thumb-${variant}`} aria-hidden="true">
        {variant === 'wireframe' ? <WireframeArt /> : <HighFidelityArt />}
      </span>
      <span className="fidelity-label">{label}</span>
    </button>
  )
}

function WireframeArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden="true">
      <rect x="6" y="8" width="46" height="6" rx="2" fill="#d8d4cb" />
      <rect x="6" y="20" width="34" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="28" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="36" width="30" height="4" rx="2" fill="#ebe8e1" />
      <circle cx="22" cy="56" r="6" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="64" y="8" width="50" height="54" rx="3" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="22" width="32" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="30" width="38" height="4" rx="2" fill="#ebe8e1" />
    </svg>
  )
}

function HighFidelityArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden="true">
      <rect x="6" y="8" width="34" height="6" rx="2" fill="#1a1916" />
      <rect x="6" y="20" width="46" height="4" rx="2" fill="#74716b" />
      <rect x="6" y="28" width="42" height="4" rx="2" fill="#b3b0a8" />
      <rect x="6" y="40" width="22" height="9" rx="2" fill="#c96442" />
      <rect x="64" y="8" width="50" height="54" rx="4" fill="#fbeee5" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#c96442" />
      <rect x="70" y="22" width="32" height="3" rx="1.5" fill="#74716b" />
      <rect x="70" y="29" width="36" height="3" rx="1.5" fill="#b3b0a8" />
      <rect x="70" y="36" width="20" height="6" rx="2" fill="#c96442" />
    </svg>
  )
}

function DesignCard({ project }: { project: ProjectCard }) {
  return (
    <div className="design-card" role="button" tabIndex={0}>
      <div className="design-card-thumb" aria-hidden="true" />
      <div className="design-card-meta-block">
        <div className="design-card-name" title={project.title}>{project.title}</div>
        <div className="design-card-meta">
          <span className="ds">{project.engine}</span>
          {` · ${project.type} · `}
          <span className="design-card-status design-card-status-succeeded">{project.status}</span>
          {` · ${project.age}`}
        </div>
      </div>
    </div>
  )
}

function buildProjectCards(data: LocalWorkspaceData | null): ProjectCard[] {
  if (!data)
    return []

  return data.briefs.map((brief) => {
    const latestRun = latestRunForBrief(brief.id, data.runs)
    return {
      title: brief.title,
      engine: latestRun?.executor ?? 'Local CLI',
      type: 'worker-project',
      status: titleCase(latestRun?.status ?? brief.status),
      age: relativeTime(brief.updatedAt),
    }
  })
}

function latestRunForBrief(briefId: string, runs: LocalRun[]): LocalRun | null {
  return runs
    .filter(run => run.briefId === briefId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
