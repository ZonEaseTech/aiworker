import type { IconSvgElement } from '@hugeicons/react'
import type { HostedSoulApp, LocalEngineStatus, LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import type { CSSProperties, ReactNode } from 'react'

import {
  Cancel01Icon,
  DashboardSpeed02Icon,
  LanguageCircleIcon,
  Link02Icon,
  Moon02Icon,
  RefreshIcon,
  Settings02Icon,
  Shield02Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Sun02Icon,
  TerminalIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@zonease/aiworker-ui/components/dialog'
import { Empty, EmptyDescription, EmptyHeader } from '@zonease/aiworker-ui/components/empty'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Kbd } from '@zonease/aiworker-ui/components/kbd'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { Switch } from '@zonease/aiworker-ui/components/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zonease/aiworker-ui/components/tabs'
import { ToggleGroup, ToggleGroupItem } from '@zonease/aiworker-ui/components/toggle-group'
import { useEffect, useState } from 'react'
import { formatRelativeTime, formatStatus, languageLabel, messagesFor, normalizeLocale, supportedLocales } from '../../i18n'
import { archiveSoulApp, enableSoulApp, rescanEngines, saveSettings, testEngine } from '../../local-workspace/api'
import { engineIconSrc } from '../model'

export type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'
type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed'
type WorkerMessages = ReturnType<typeof messagesFor>

const settingsSections: Array<{
  icon: IconSvgElement
  id: SettingsSection
}> = [
  { id: 'execution', icon: SlidersHorizontalIcon },
  { id: 'soul-packs', icon: SparklesIcon },
  { id: 'connectors', icon: Link02Icon },
  { id: 'mcp', icon: Shield02Icon },
  { id: 'external-mcp', icon: TerminalIcon },
  { id: 'language', icon: LanguageCircleIcon },
  { id: 'appearance', icon: Sun02Icon },
  { id: 'about', icon: Settings02Icon },
]

export function SettingsDialog({
  apps,
  initial,
  initialSection,
  onAppsChanged,
  onClose,
  onSaved,
  runtimeVersion,
}: {
  apps: HostedSoulApp[]
  initial: LocalSettingsConfig
  initialSection: SettingsSection
  onAppsChanged?: () => Promise<void> | void
  onClose: () => void
  onSaved: (settings: LocalSettingsConfig) => void
  runtimeVersion: string
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

  const activeContent = (
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
      {section === 'soul-packs' ? <SoulAppsSettings apps={apps} copy={copy} locale={activeLocale} onAppsChanged={onAppsChanged} /> : null}
      {section === 'connectors' ? <ConnectorsSettings copy={copy} settings={settings} update={persist} /> : null}
      {section === 'mcp' ? <LocalMcpSettings copy={copy} /> : null}
      {section === 'external-mcp' ? <ExternalMcpSettings copy={copy} settings={settings} /> : null}
      {section === 'language' ? <LanguageSettings copy={copy} locale={activeLocale} update={persist} /> : null}
      {section === 'appearance' ? <AppearanceSettings copy={copy} settings={settings} update={persist} /> : null}
      {section === 'about'
        ? (
            <ItemGroup className="gap-3">
              <SettingsSectionIntro title={settingsCopy.about.title} hint={settingsCopy.about.hint} />
              <ItemGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <SettingsFact label={settingsCopy.about.version} value={runtimeVersion} />
                <SettingsFact label={settingsCopy.about.executionMode} value={settings.executionMode} />
                <SettingsFact label={settingsCopy.about.selectedEngine} value={settings.engineId} />
                <SettingsFact label={settingsCopy.about.updated} value={formatRelativeTime(settings.updatedAt, activeLocale)} />
              </ItemGroup>
            </ItemGroup>
          )
        : null}
    </>
  )

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen)
          onClose()
      }}
    >
      <DialogContent
        className="flex h-dvh flex-col gap-0 overflow-hidden p-0 sm:h-5/6 sm:max-w-5xl"
        showCloseButton={false}
      >
        <ItemActions data-settings-slot="settings-dialog-actions" className="absolute top-4 right-4" aria-hidden={false}>
          {autosave !== 'idle'
            ? (
                <Badge
                  variant={autosave === 'failed' ? 'destructive' : 'outline'}
                  role="status"
                  aria-live="polite"
                >
                  {autosave === 'saving'
                    ? <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="animate-spin" />
                    : <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />}
                  {autosaveCopy(autosave, settingsCopy)}
                </Badge>
              )
            : null}
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label={copy.accessibility.closeSettings} title={copy.accessibility.closeSettings}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </DialogClose>
        </ItemActions>

        <DialogHeader className="px-6 pt-6 pr-20 pb-5">
          <Badge variant="secondary" className="w-fit">{settingsCopy.dialog.kicker}</Badge>
          <DialogTitle>{settingsCopy.dialog.title}</DialogTitle>
          <DialogDescription>{settingsCopy.dialog.subtitle}</DialogDescription>
        </DialogHeader>

        <Tabs
          orientation="vertical"
          value={section}
          className="min-h-0 flex-1 gap-0 max-md:flex-col"
          onValueChange={value => setSection(value as SettingsSection)}
        >
          <TabsList
            variant="line"
            aria-label={settingsCopy.dialog.title}
            className="min-h-0 w-full items-stretch justify-start gap-1 p-3 max-md:h-52 max-md:max-h-52 max-md:overflow-auto md:h-auto md:max-h-none md:w-60 md:flex-none md:flex-col md:self-start md:overflow-visible"
          >
            {settingsSections.map((item) => {
              const icon = item.icon
              const navCopy = settingsNavCopy(settingsCopy.nav, item.id)
              return (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  aria-label={`${navCopy.title} ${navCopy.detail}`}
                  className="h-auto min-w-fit justify-start px-2 py-2 md:w-full"
                >
                  <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                  <ItemContent asChild className="min-w-0 gap-0.5">
                    <span>
                      <ItemTitle asChild className="max-w-full">
                        <span>{navCopy.title}</span>
                      </ItemTitle>
                      <ItemDescription asChild className="hidden max-w-full md:block">
                        <span>{navCopy.detail}</span>
                      </ItemDescription>
                    </span>
                  </ItemContent>
                </TabsTrigger>
              )
            })}
          </TabsList>
          <TabsContent value={section} className="m-0 min-h-0 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <ItemGroup className="gap-4 p-6">
                {activeContent}
              </ItemGroup>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SettingsSectionIntro({
  actions,
  hint,
  title,
}: {
  actions?: ReactNode
  hint?: ReactNode
  title: ReactNode
}) {
  return (
    <Item variant="default" size="sm" className="items-start px-0 py-0">
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle role="heading" aria-level={3} size="base" className="max-w-full">{title}</ItemTitle>
        {hint ? <ItemDescription className="line-clamp-none max-w-prose">{hint}</ItemDescription> : null}
      </ItemContent>
      {actions
        ? (
            <ItemActions className="shrink-0 max-md:w-full max-md:justify-start">
              {actions}
            </ItemActions>
          )
        : null}
    </Item>
  )
}

function SettingsFact({ label, value }: { label: string, value: string }) {
  return (
    <Item variant="muted" size="sm" className="items-start">
      <ItemContent className="min-w-0">
        <ItemDescription>{label}</ItemDescription>
        <ItemTitle className="max-w-full break-words">{value}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

function SettingsToggleText({ description, icon, title }: { description: ReactNode, icon?: ReactNode, title: ReactNode }) {
  return (
    <ItemContent asChild className="min-w-0 flex-none gap-0.5">
      <span>
        <ItemTitle asChild className="max-w-full">
          <span>
            {icon}
            {title}
          </span>
        </ItemTitle>
        <ItemDescription asChild className="max-w-full">
          <span>{description}</span>
        </ItemDescription>
      </span>
    </ItemContent>
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
      <ToggleGroup
        type="single"
        aria-label={settingsCopy.nav.execution}
        className="w-full"
        size="lg"
        spacing={0}
        value={settings.executionMode}
        onValueChange={(value) => {
          if (value)
            void update({ executionMode: value as LocalSettingsConfig['executionMode'] })
        }}
      >
        <ToggleGroupItem value="local-cli" className="h-auto min-h-12 flex-1 justify-start px-3 py-2">
          <SettingsToggleText title="Local CLI" description={settingsCopy.engine.availableCount(installedCount)} />
        </ToggleGroupItem>
        <ToggleGroupItem value="byok" className="h-auto min-h-12 flex-1 justify-start px-3 py-2">
          <SettingsToggleText title="BYOK" description={settings.byok.provider} />
        </ToggleGroupItem>
      </ToggleGroup>

      {settings.executionMode === 'local-cli'
        ? (
            <ItemGroup className="gap-3">
              <SettingsSectionIntro
                title={settingsCopy.engine.title}
                hint={settingsCopy.engine.hint}
                actions={(
                  <ItemActions aria-label={settingsCopy.engine.title}>
                    <Button
                      aria-label={settingsCopy.engine.test}
                      title={settingsCopy.engine.test}
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onTest(settings.engineId)}
                    >
                      <HugeiconsIcon icon={DashboardSpeed02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                    </Button>
                    <Button
                      aria-label={settingsCopy.engine.rescan}
                      title={settingsCopy.engine.rescan}
                      variant="ghost"
                      size="icon-sm"
                      onClick={onRescan}
                    >
                      <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                    </Button>
                  </ItemActions>
                )}
              />

              <ItemGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {settings.engines.map(engine => (
                  <EngineCard
                    key={engine.id}
                    active={settings.engineId === engine.id}
                    copy={copy}
                    engine={engine}
                    onSelect={() => void update({ engineId: engine.id })}
                  />
                ))}
              </ItemGroup>
              {engineTest
                ? (
                    <Alert role="status">
                      <AlertDescription>{engineTest}</AlertDescription>
                    </Alert>
                  )
                : null}
            </ItemGroup>
          )
        : (
            <ItemGroup className="gap-3">
              <SettingsSectionIntro title={settingsCopy.byok.title} hint={settingsCopy.byok.hint} />
              <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="settings-byok-provider">{settingsCopy.byok.provider}</FieldLabel>
                  <Input id="settings-byok-provider" value={settings.byok.provider} onChange={event => void update({ byok: { ...settings.byok, provider: event.target.value } })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-byok-base-url">{settingsCopy.byok.baseUrl}</FieldLabel>
                  <Input id="settings-byok-base-url" value={settings.byok.baseUrl} onChange={event => void update({ byok: { ...settings.byok, baseUrl: event.target.value } })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-byok-model">{settingsCopy.byok.model}</FieldLabel>
                  <Input id="settings-byok-model" value={settings.byok.model} onChange={event => void update({ byok: { ...settings.byok, model: event.target.value } })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-byok-api-key-ref">{settingsCopy.byok.apiKeyRef}</FieldLabel>
                  <Input id="settings-byok-api-key-ref" value={settings.byok.apiKeyRef} onChange={event => void update({ byok: { ...settings.byok, apiKeyRef: event.target.value } })} placeholder="env:OPENAI_API_KEY" />
                </Field>
              </FieldGroup>
            </ItemGroup>
          )}
    </>
  )
}

function EngineCard({ active, copy, engine, onSelect }: { active: boolean, copy: ReturnType<typeof messagesFor>, engine: LocalEngineStatus, onSelect: () => void }) {
  const iconSrc = engineIconSrc(engine.id)
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="lg"
      className="h-auto min-h-16 w-full justify-start gap-3 px-3 py-3 whitespace-normal"
      disabled={!engine.installed}
      aria-pressed={active}
      onClick={onSelect}
    >
      <EngineCardIcon engineId={engine.id} iconSrc={iconSrc} installed={engine.installed} />
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">{engine.name}</ItemTitle>
        <ItemDescription className="max-w-full">
          {engine.installed
            ? engine.version ?? engine.path ?? engine.command
            : copy.common.notInstalled}
        </ItemDescription>
      </ItemContent>
      {engine.installed
        ? (
            <Badge aria-hidden="true" className="shrink-0" variant={active ? 'default' : 'secondary'}>
              {active ? copy.statuses.active : copy.common.available}
            </Badge>
          )
        : null}
    </Button>
  )
}

function EngineCardIcon({ engineId, iconSrc, installed }: { engineId: string, iconSrc: null | string, installed: boolean }) {
  const maskStyle = iconSrc
    ? ({
        WebkitMaskImage: `url(${iconSrc})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        backgroundColor: 'currentColor',
        maskImage: `url(${iconSrc})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
      } satisfies CSSProperties)
    : undefined

  return (
    <ItemMedia
      variant="icon"
      className={iconSrc
        ? installed ? 'size-4' : 'size-4 opacity-60'
        : installed ? undefined : 'opacity-60'}
      style={maskStyle}
      data-engine-icon={engineId}
      data-engine-icon-src={iconSrc ?? undefined}
      aria-hidden="true"
    >
      {iconSrc
        ? null
        : <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} aria-hidden="true" />}
    </ItemMedia>
  )
}

function SoulAppsSettings({
  apps,
  copy,
  locale,
  onAppsChanged,
}: {
  apps: HostedSoulApp[]
  copy: ReturnType<typeof messagesFor>
  locale: ReturnType<typeof normalizeLocale>
  onAppsChanged?: () => Promise<void> | void
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
        await archiveSoulApp(app.appId)
      }
      else {
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
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={soulAppsCopy.title} hint={soulAppsCopy.hint} />
      <ItemGroup className="gap-2">
        {apps.length > 0
          ? apps.map((app) => {
              const permissionCount = app.permissions.length
              const workbenchCount = app.mountedWorkbench ? 1 : 0
              const apiRoutePrefix = app.api.routePrefix
              const soulId = app.soulId || app.projectedSoul?.id || app.appId
              const permissionLabels = app.permissions.map(permissionLabel).filter(isString)
              const busy = busyAppId === app.appId
              const actionLabel = app.status === 'enabled' ? soulAppsCopy.archiveApp(app.name) : soulAppsCopy.enableApp(app.name)
              return (
                <Card key={app.appId} size="sm" className={app.status === 'enabled' ? undefined : 'opacity-70'}>
                  <CardHeader>
                    <ItemContent className="min-w-0">
                      <CardTitle>{app.name}</CardTitle>
                      <CardDescription>{`${formatStatus(app.status, locale)} · ${app.version}`}</CardDescription>
                    </ItemContent>
                    <CardAction>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void updateLifecycle(app)}
                      >
                        {busy ? soulAppsCopy.updating : actionLabel}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <CardDescription>{soulId}</CardDescription>
                    <ItemActions className="min-w-0 flex-wrap justify-start gap-1.5">
                      <Badge variant="outline">{soulAppsCopy.permissionCount(permissionCount)}</Badge>
                      <Badge variant="outline">{soulAppsCopy.mountedWorkbenchCount(workbenchCount)}</Badge>
                    </ItemActions>
                    <ItemGroup className="gap-2" aria-label={`${app.name} app access`}>
                      {permissionLabels.length > 0
                        ? (
                            <ItemContent className="gap-1.5">
                              <Kbd className="h-auto w-fit uppercase">{soulAppsCopy.permissionsTitle}</Kbd>
                              <ItemActions className="min-w-0 flex-wrap justify-start gap-1.5">
                                {permissionLabels.slice(0, 4).map(label => <Badge key={label} variant="outline">{label}</Badge>)}
                              </ItemActions>
                            </ItemContent>
                          )
                        : null}
                    </ItemGroup>
                    {apiRoutePrefix ? <CardDescription>{soulAppsCopy.apiRoute(apiRoutePrefix)}</CardDescription> : null}
                  </CardContent>
                </Card>
              )
            })
          : (
              <Empty className="min-h-16 flex-none p-3">
                <EmptyHeader>
                  <EmptyDescription>{soulAppsCopy.empty}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
      </ItemGroup>
      {error
        ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )
        : null}
    </ItemGroup>
  )
}

function permissionLabel(permission: HostedSoulApp['permissions'][number]): string | null {
  if (!permission.kind || !permission.action || !permission.target)
    return null
  return `${permission.kind}:${permission.action}:${permission.target}`
}

function isString(value: string | null): value is string {
  return typeof value === 'string'
}

function ConnectorsSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={settingsCopy.connectors.title} hint={settingsCopy.connectors.hint} />
      <ItemGroup className="gap-2">
        {settings.connectors.map((connector) => {
          const switchId = `settings-connector-${connector.id}`
          return (
            <Item key={connector.id} variant="muted" size="sm">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={switchId}>{connector.name}</FieldLabel>
                  <FieldDescription>{connector.status === 'configured' ? settingsCopy.connectors.configured : settingsCopy.connectors.notConfigured}</FieldDescription>
                </FieldContent>
                <Switch
                  id={switchId}
                  checked={connector.enabled}
                  onCheckedChange={checked => void update({
                    connectors: settings.connectors.map(item => item.id === connector.id
                      ? { ...item, enabled: checked, status: checked ? 'configured' : 'not_configured' }
                      : item),
                  })}
                />
              </Field>
            </Item>
          )
        })}
      </ItemGroup>
    </ItemGroup>
  )
}

function LocalMcpSettings({ copy }: { copy: ReturnType<typeof messagesFor> }) {
  const settingsCopy = copy.settings
  return (
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={settingsCopy.localMcp.title} hint={settingsCopy.localMcp.hint} />
      <Item variant="muted" size="sm" className="opacity-70">
        <Field orientation="horizontal" data-disabled>
          <FieldContent>
            <FieldLabel htmlFor="settings-local-mcp">{settingsCopy.localMcp.toggle}</FieldLabel>
            <FieldDescription>{settingsCopy.localMcp.pending}</FieldDescription>
          </FieldContent>
          <Switch id="settings-local-mcp" checked={false} disabled />
        </Field>
      </Item>
    </ItemGroup>
  )
}

function ExternalMcpSettings({ copy, settings }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig }) {
  const settingsCopy = copy.settings
  return (
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={settingsCopy.externalMcp.title} hint={settingsCopy.externalMcp.hint} />
      <FieldGroup>
        {settings.externalMcpServers.map(server => (
          <Field key={server.id}>
            <FieldLabel htmlFor={`settings-external-mcp-${server.id}`}>{server.name}</FieldLabel>
            <Input
              id={`settings-external-mcp-${server.id}`}
              disabled
              value={server.command}
              placeholder={settingsCopy.externalMcp.placeholder}
              readOnly
            />
          </Field>
        ))}
      </FieldGroup>
      <FieldDescription>{settingsCopy.externalMcp.pending}</FieldDescription>
    </ItemGroup>
  )
}

function LanguageSettings({ copy, locale, update }: { copy: ReturnType<typeof messagesFor>, locale: ReturnType<typeof normalizeLocale>, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={settingsCopy.language.title} hint={settingsCopy.language.hint} />
      <ToggleGroup
        type="single"
        aria-label={settingsCopy.language.title}
        className="w-full flex-wrap justify-start"
        size="lg"
        spacing={0}
        value={locale}
        onValueChange={(language) => {
          if (language)
            void update({ language: language as LocalSettingsConfig['language'] })
        }}
      >
        {supportedLocales.map(language => (
          <ToggleGroupItem key={language} value={language} className="h-auto min-h-12 min-w-28 flex-col items-start px-3 py-2">
            <SettingsToggleText title={languageLabel(language, locale)} description={copy.common.interface} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </ItemGroup>
  )
}

function AppearanceSettings({ copy, settings, update }: { copy: ReturnType<typeof messagesFor>, settings: LocalSettingsConfig, update: (patch: Partial<LocalSettingsConfig>) => Promise<void> }) {
  const settingsCopy = copy.settings
  return (
    <ItemGroup className="gap-3">
      <SettingsSectionIntro title={settingsCopy.appearance.title} hint={settingsCopy.appearance.hint} />
      <ToggleGroup
        type="single"
        aria-label={settingsCopy.appearance.title}
        className="w-full flex-wrap justify-start"
        size="lg"
        spacing={0}
        value={settings.appearance}
        onValueChange={(appearance) => {
          if (appearance)
            void update({ appearance: appearance as LocalSettingsConfig['appearance'] })
        }}
      >
        <ToggleGroupItem value="system" className="h-auto min-h-12 min-w-28 flex-col items-start px-3 py-2">
          <SettingsToggleText icon={<HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />} title={settingsCopy.appearance.system} description={copy.common.workspace} />
        </ToggleGroupItem>
        <ToggleGroupItem value="light" className="h-auto min-h-12 min-w-28 flex-col items-start px-3 py-2">
          <SettingsToggleText icon={<HugeiconsIcon icon={Sun02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />} title={settingsCopy.appearance.light} description={copy.common.workspace} />
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" className="h-auto min-h-12 min-w-28 flex-col items-start px-3 py-2">
          <SettingsToggleText icon={<HugeiconsIcon icon={Moon02Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />} title={settingsCopy.appearance.dark} description={copy.common.workspace} />
        </ToggleGroupItem>
      </ToggleGroup>
    </ItemGroup>
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
