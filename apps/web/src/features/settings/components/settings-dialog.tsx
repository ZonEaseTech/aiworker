import type { CapabilityTemplate, LocalEngineStatus, LocalSettingsConfig, VerticalSoul } from '@zonease/aiworker-shared'
import type { CSSProperties, ReactNode } from 'react'

import { Check, Languages, Link, Moon, RefreshCw, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Terminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { displaySoul, formatRelativeTime, languageLabel, messagesFor, normalizeLocale, supportedLocales } from '../../i18n'
import { rescanEngines, saveSettings, testEngine } from '../../local-workspace/api'

export type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'
type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type WorkerMessages = ReturnType<typeof messagesFor>

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

export function SettingsDialog({
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
  const [autosave, setAutosave] = useState<AutosaveState>('idle')
  const [engineTest, setEngineTest] = useState<string | null>(null)
  const activeLocale = normalizeLocale(settings.language)
  const copy = messagesFor(activeLocale)
  const settingsCopy = copy.settings

  useEffect(() => {
    if (autosave !== 'saved')
      return undefined
    const timeout = window.setTimeout(() => {
      setAutosave(current => current === 'saved' ? 'idle' : current)
    }, 1600)
    return () => window.clearTimeout(timeout)
  }, [autosave])

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
          {autosave !== 'idle'
            ? (
                <div className={`settings-autosave ${autosaveClass(autosave)}`} role="status" aria-live="polite">
                  {autosave === 'saving' ? <RefreshCw size={12} className="spin" /> : <Check size={12} />}
                  <span>{autosaveCopy(autosave, settingsCopy)}</span>
                </div>
              )
            : null}
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
