import type { CapabilityTemplate, HostedSoulApp, LocalEngineStatus, LocalSettingsConfig } from '@zonease/aiworker-shared'
import type { CSSProperties } from 'react'

import { ActionCard, Button, Field, NavItemButton, SegmentedControl, SettingsShell } from '@zonease/aiworker-component'
import { Check, Gauge, Languages, Link, Moon, RefreshCw, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Terminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeTime, formatStatus, languageLabel, messagesFor, normalizeLocale, supportedLocales } from '../../i18n'
import { disableSoulApp, enableSoulApp, rescanEngines, reviewSoulAppSecurity, saveSettings, testEngine } from '../../local-workspace/api'
import { engineIconSrc } from '../model'

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
  apps,
  initial,
  initialSection,
  onAppsChanged,
  onClose,
  onSaved,
  runtimeVersion,
  templates,
}: {
  apps: HostedSoulApp[]
  initial: LocalSettingsConfig
  initialSection: SettingsSection
  onAppsChanged?: () => Promise<void> | void
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
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
          <Button variant="close" onClick={onClose} aria-label={copy.accessibility.closeSettings} title={copy.accessibility.closeSettings}>
            <X size={16} strokeWidth={2} />
          </Button>
        </div>

        <header className="modal-head">
          <span className="kicker">{settingsCopy.dialog.kicker}</span>
          <h2 id="settings-dialog-title">{settingsCopy.dialog.title}</h2>
          <p className="subtitle">{settingsCopy.dialog.subtitle}</p>
        </header>

        <SettingsShell
          className="modal-body"
          sidebar={(
            <nav aria-label={settingsCopy.dialog.title}>
              {settingsSections.map((item) => {
                const Icon = item.icon
                const navCopy = settingsNavCopy(settingsCopy.nav, item.id)
                return (
                  <NavItemButton
                    key={item.id}
                    active={section === item.id}
                    className="settings-nav-item"
                    description={navCopy.detail}
                    icon={<Icon size={18} />}
                    label={navCopy.title}
                    onClick={() => setSection(item.id)}
                  />
                )
              })}
            </nav>
          )}
          content={(
            <>
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
              {section === 'soul-packs' ? <SoulAppsSettings apps={apps} copy={copy} locale={activeLocale} settings={settings} templates={templates} onAppsChanged={onAppsChanged} /> : null}
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
            </>
          )}
        />
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
      <SegmentedControl
        ariaLabel={settingsCopy.nav.execution}
        value={settings.executionMode}
        onChange={value => void update({ executionMode: value as LocalSettingsConfig['executionMode'] })}
        options={[
          { description: settingsCopy.engine.availableCount(installedCount), label: 'Local CLI', value: 'local-cli' },
          { description: settings.byok.provider, label: 'BYOK', value: 'byok' },
        ]}
      />

      {settings.executionMode === 'local-cli'
        ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{settingsCopy.engine.title}</h3>
                  <p className="hint">{settingsCopy.engine.hint}</p>
                </div>
                <div className="section-head-actions">
                  <Button variant="ghost" icon={<Gauge size={13} />} className="settings-action-button settings-test-btn" onClick={() => onTest(settings.engineId)}>
                    <span>{settingsCopy.engine.test}</span>
                  </Button>
                  <Button variant="ghost" icon={<RefreshCw size={13} />} className="settings-action-button settings-rescan-btn" onClick={onRescan}>
                    <span>{settingsCopy.engine.rescan}</span>
                  </Button>
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
                <Field label={settingsCopy.byok.provider}>
                  <input value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
                </Field>
                <Field label={settingsCopy.byok.baseUrl}>
                  <input value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
                </Field>
                <Field label={settingsCopy.byok.model}>
                  <input value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
                </Field>
                <Field label={settingsCopy.byok.apiKeyRef}>
                  <input value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="env:OPENAI_API_KEY" />
                </Field>
              </div>
            </section>
          )}
    </>
  )
}

function EngineCard({ active, copy, engine, onSelect }: { active: boolean, copy: ReturnType<typeof messagesFor>, engine: LocalEngineStatus, onSelect: () => void }) {
  const iconSrc = engineIconSrc(engine.id)
  return (
    <ActionCard active={active} className={`agent-card${engine.installed ? '' : ' disabled'}`} disabled={!engine.installed} aria-pressed={active} onClick={onSelect}>
      <span className={`agent-icon ${engine.installed ? 'agent-icon-ready' : 'agent-icon-muted'}`} data-engine-icon={engine.id} aria-hidden="true">
        {iconSrc
          ? <span className="agent-icon-shape" style={{ '--engine-icon-url': `url(${iconSrc})` } as CSSProperties} />
          : <Sparkles size={24} />}
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
    </ActionCard>
  )
}

function SoulAppsSettings({
  apps,
  copy,
  locale,
  onAppsChanged,
  settings,
  templates,
}: {
  apps: HostedSoulApp[]
  copy: ReturnType<typeof messagesFor>
  locale: ReturnType<typeof normalizeLocale>
  onAppsChanged?: () => Promise<void> | void
  settings: LocalSettingsConfig
  templates: CapabilityTemplate[]
}) {
  const settingsCopy = copy.settings
  const soulAppsCopy = settingsCopy.soulPacks
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function updateLifecycle(app: HostedSoulApp) {
    setBusyAppId(app.appId)
    setError(null)
    try {
      if (app.status === 'enabled') {
        await disableSoulApp(app.appId)
      }
      else {
        const review = await reviewSoulAppSecurity(app.appId)
        if (!review.summary.canEnable)
          throw new Error(securityReviewBlockMessage(review.summary))
        await enableSoulApp(app.appId)
      }
      await onAppsChanged?.()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setBusyAppId(null)
    }
  }

  return (
    <div className="settings-section">
      <div className="section-head">
        <div>
          <h3>{soulAppsCopy.title}</h3>
          <p className="hint">{soulAppsCopy.hint}</p>
        </div>
      </div>
      <div className="settings-card-list">
        {apps.length > 0
          ? apps.map((app) => {
              const permissionCount = app.manifest.permissions?.length ?? 0
              const contributionCount = mountedContributionCount(app)
              const templateCount = templates.filter(template => template.soulId === app.appId || template.soulId === app.projectedSoul?.id).length
              const apiRoutePrefix = app.mountedContribution.apiRoutePrefix
              const domain = app.projectedSoul?.domain ?? app.manifest.soul?.domain ?? app.appId
              const permissionLabels = (app.manifest.permissions ?? []).map(permissionLabel).filter(isString)
              const connectorRows = (app.manifest.connectors?.required ?? []).map(connector => ({
                id: connector.id,
                label: soulAppsCopy.connectorStatus(connector.id, connectorStatus(connector.id, settings, soulAppsCopy)),
              }))
              const descriptorPermissions = descriptorPermissionLabels(app)
              const busy = busyAppId === app.appId
              const actionLabel = app.status === 'enabled' ? soulAppsCopy.disableApp(app.manifest.name) : soulAppsCopy.enableApp(app.manifest.name)
              return (
                <article key={app.appId} className={`settings-card-row ${app.status === 'enabled' ? '' : 'disabled'}`}>
                  <div className="settings-card-mainline">
                    <span>
                      <strong>{app.manifest.name}</strong>
                      <span>{`${formatStatus(app.status, locale)} · ${app.version}`}</span>
                    </span>
                    <Button
                      variant="ghost"
                      className="settings-action-button soul-app-lifecycle-button"
                      disabled={busy}
                      onClick={() => void updateLifecycle(app)}
                    >
                      <span>{busy ? soulAppsCopy.updating : actionLabel}</span>
                    </Button>
                  </div>
                  <small>{domain}</small>
                  <div className="settings-card-tags">
                    <small>{soulAppsCopy.permissionCount(permissionCount)}</small>
                    <small>{soulAppsCopy.templateCount(templateCount)}</small>
                    <small>{soulAppsCopy.mountedContributionCount(contributionCount)}</small>
                  </div>
                  <div className="settings-review-grid" aria-label={`${app.manifest.name} security review`}>
                    {permissionLabels.length > 0
                      ? (
                          <div className="settings-review-group">
                            <span>{soulAppsCopy.permissionsTitle}</span>
                            <div className="settings-card-tags">
                              {permissionLabels.slice(0, 4).map(label => <small key={label}>{label}</small>)}
                            </div>
                          </div>
                        )
                      : null}
                    {connectorRows.length > 0
                      ? (
                          <div className="settings-review-group">
                            <span>{soulAppsCopy.connectorsTitle}</span>
                            <div className="settings-card-tags">
                              {connectorRows.map(connector => <small key={connector.id}>{connector.label}</small>)}
                            </div>
                          </div>
                        )
                      : null}
                    {descriptorPermissions.length > 0
                      ? (
                          <div className="settings-review-group">
                            <span>{soulAppsCopy.descriptorPermissionsTitle}</span>
                            <div className="settings-card-tags">
                              {descriptorPermissions.slice(0, 4).map(label => <small key={label}>{label}</small>)}
                            </div>
                          </div>
                        )
                      : null}
                  </div>
                  {apiRoutePrefix ? <small>{soulAppsCopy.apiRoute(apiRoutePrefix)}</small> : null}
                </article>
              )
            })
          : (
              <div className="settings-note">{soulAppsCopy.empty}</div>
            )}
      </div>
      {error ? <p className="settings-note" role="alert">{error}</p> : null}
    </div>
  )
}

function securityReviewBlockMessage(summary: {
  missingRequiredConnectorIds: readonly string[]
  warnings: readonly string[]
}): string {
  if (summary.warnings.length > 0)
    return summary.warnings.join(' ')
  if (summary.missingRequiredConnectorIds.length > 0)
    return `Required connectors are not available: ${summary.missingRequiredConnectorIds.join(', ')}`
  return 'Host security review does not allow enabling this Soul App.'
}

function mountedContributionCount(app: HostedSoulApp): number {
  return app.mountedContribution.artifactPreviewIds.length
    + app.mountedContribution.panelIds.length
    + app.mountedContribution.reviewPanelIds.length
    + app.mountedContribution.workspaceWidgetIds.length
}

function permissionLabel(permission: HostedSoulApp['manifest']['permissions'][number]): string | null {
  if (!permission.kind || !permission.action || !permission.target)
    return null
  return `${permission.kind}:${permission.action}:${permission.target}`
}

function isString(value: string | null): value is string {
  return typeof value === 'string'
}

function connectorStatus(connectorId: string, settings: LocalSettingsConfig, copy: ReturnType<typeof messagesFor>['settings']['soulPacks']): string {
  const connector = settings.connectors.find(item => item.id === connectorId)
  if (!connector)
    return copy.unavailableConnector
  return connector.enabled ? copy.enabledConnector : copy.disabledConnector
}

function descriptorPermissionLabels(app: HostedSoulApp): string[] {
  const labels = new Set<string>()
  const add = (permissions?: readonly string[]) => {
    for (const permission of permissions ?? [])
      labels.add(permission)
  }
  const workbench = app.manifest.ui?.workbench
  add(workbench?.primaryAction?.requiredPermissions)
  for (const action of workbench?.actions ?? [])
    add(action.requiredPermissions)
  add(workbench?.search?.requiredPermissions)
  add(workbench?.settings?.requiredPermissions)
  add(app.manifest.ui?.workspaceContext?.terminal?.requiredPermissions)
  for (const route of app.manifest.ui?.routes ?? [])
    add(route.surface?.requiredPermissions)
  for (const panel of app.manifest.ui?.panels ?? [])
    add(panel.surface?.requiredPermissions)
  for (const preview of app.manifest.ui?.artifactPreviews ?? [])
    add(preview.surface?.requiredPermissions)
  for (const panel of app.manifest.ui?.reviewPanels ?? [])
    add(panel.surface?.requiredPermissions)
  for (const widget of app.manifest.ui?.workspaceWidgets ?? [])
    add(widget.surface?.requiredPermissions)
  return [...labels]
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
          <Field key={server.id} label={server.name}>
            <input
              value={server.command}
              onChange={event => void update({
                externalMcpServers: settings.externalMcpServers.map(item => item.id === server.id ? { ...item, command: event.target.value } : item),
              })}
              placeholder={settingsCopy.externalMcp.placeholder}
            />
          </Field>
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
      <SegmentedControl
        ariaLabel={settingsCopy.language.title}
        value={locale}
        onChange={language => void update({ language: language as LocalSettingsConfig['language'] })}
        options={supportedLocales.map(language => ({
          description: copy.common.interface,
          label: languageLabel(language, locale),
          value: language,
        }))}
      />
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
      <SegmentedControl
        ariaLabel={settingsCopy.appearance.title}
        value={settings.appearance}
        onChange={appearance => void update({ appearance: appearance as LocalSettingsConfig['appearance'] })}
        options={[
          { description: copy.common.workspace, label: (
            <span className="seg-title-inline">
              <Settings size={14} />
              {settingsCopy.appearance.system}
            </span>
          ), value: 'system' },
          { description: copy.common.workspace, label: (
            <span className="seg-title-inline">
              <Sun size={14} />
              {settingsCopy.appearance.light}
            </span>
          ), value: 'light' },
          { description: copy.common.workspace, label: (
            <span className="seg-title-inline">
              <Moon size={14} />
              {settingsCopy.appearance.dark}
            </span>
          ), value: 'dark' },
        ]}
      />
    </div>
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
