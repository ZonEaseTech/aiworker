import type { LocalSettingsConfig, LocalWorker, LocalWorkerOverlayAsset, LocalWorkerOverlayAssetKind } from '@zonease/aiworker-soul-descriptor'
import type { StaticMessages } from '../features/i18n/types'

import { Add01Icon, Cancel01Icon, MoreHorizontalCircle01Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@zonease/aiworker-ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@zonease/aiworker-ui/components/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Label } from '@zonease/aiworker-ui/components/label'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@zonease/aiworker-ui/components/sidebar'
import { Switch } from '@zonease/aiworker-ui/components/switch'
import { Textarea } from '@zonease/aiworker-ui/components/textarea'
import { ToggleGroup, ToggleGroupItem } from '@zonease/aiworker-ui/components/toggle-group'
import { useEffect, useMemo, useState } from 'react'

import { getOverlayContent, LocalApiError, putOverlayContent, resetOverlayContent, saveSettings } from '../features/local-workspace/api'

type OverlayCategory = LocalWorkerOverlayAssetKind

const categories: { label: string, value: OverlayCategory }[] = [
  { label: 'Skills', value: 'skill' },
  { label: 'MCP clients', value: 'mcp-client' },
  { label: 'Entry files', value: 'entry-file' },
]

export function WorkerConfigurationDialog({
  activeWorkbenchTabId,
  assets,
  copy,
  onOpenChange,
  onReload,
  onSaveAssets,
  onSelectWorkbenchTab,
  onSettingsSaved,
  open,
  settings,
  worker,
  workbenchTabs,
}: {
  activeWorkbenchTabId?: string | null
  assets: LocalWorkerOverlayAsset[]
  copy: StaticMessages
  onOpenChange: (open: boolean) => void
  onReload?: () => Promise<void> | void
  onSaveAssets: (assets: LocalWorkerOverlayAsset[]) => Promise<void> | void
  onSelectWorkbenchTab?: (tab: { id: string, path: string }) => void
  onSettingsSaved?: (settings: LocalSettingsConfig) => void
  open: boolean
  settings?: LocalSettingsConfig | null
  worker: LocalWorker | null
  workbenchTabs?: { id: string, label: string, path: string }[]
}) {
  const labels = copy.workerConfig
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [draftCategory, setDraftCategory] = useState<'entry-file' | 'skill' | null>(null)
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [autosaveErrorMessage, setAutosaveErrorMessage] = useState<string | null>(null)
  const [contentDirty, setContentDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedPanel, setSelectedPanel] = useState<null | 'workbench' | 'execution'>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const displayAssets = useMemo(() => {
    if (assets.length === 0)
      return assets
    const seen = new Map<string, number>()
    const result: LocalWorkerOverlayAsset[] = []
    for (const asset of assets) {
      if (asset.kind !== 'skill') {
        result.push(asset)
        continue
      }
      const existing = seen.get(asset.id)
      if (existing !== undefined)
        continue
      seen.set(asset.id, result.length)
      result.push(asset)
    }
    return result
  }, [assets])
  const skillTargets = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const asset of assets) {
      if (asset.kind !== 'skill')
        continue
      const existing = map[asset.id]
      if (!existing)
        map[asset.id] = [asset.target]
      else
        existing.push(asset.target)
    }
    return map
  }, [assets])
  const canShowWorkbenchPanel = Boolean(workbenchTabs && workbenchTabs.length > 1)
  const canShowExecutionPanel = settings != null
  const effectiveSelectedPanel = selectedPanel === 'workbench' && canShowWorkbenchPanel
    ? 'workbench' as const
    : selectedPanel === 'execution' && canShowExecutionPanel
      ? 'execution' as const
      : null
  const selectedAsset = effectiveSelectedPanel === 'workbench' || effectiveSelectedPanel === 'execution' || draftCategory ? null : (displayAssets.find(asset => asset.id === selectedAssetId) ?? displayAssets[0] ?? null)

  function targetsFor(nextAsset: LocalWorkerOverlayAsset): string[] {
    if (nextAsset.kind !== 'skill')
      return [nextAsset.target]
    const existing = new Set(assets.filter(asset => asset.kind === 'skill' && asset.id === nextAsset.id).map(asset => asset.target))
    existing.add(nextAsset.target)
    return [...existing].sort()
  }

  async function saveAsset(nextAsset: LocalWorkerOverlayAsset) {
    const targets = targetsFor(nextAsset)
    const allOriginals = assets.filter(item => item.id === nextAsset.id && item.kind === nextAsset.kind && targets.includes(item.target))
    const isBaseline = allOriginals.some(item => item.source === 'baseline')

    if (isBaseline) {
      const overlayAssets = assets.filter(asset => asset.source !== 'baseline')
      const matchingKeys = targets.map(target => `${nextAsset.kind}:${target}:${nextAsset.id}`)
      const filtered = overlayAssets.filter(asset => !matchingKeys.includes(`${asset.kind}:${asset.target}:${asset.id}`))
      if (nextAsset.enabled) {
        setAutosave('saving')
        setAutosaveErrorMessage(null)
        try {
          await saveAssets([...filtered, ...baselineAssets()])
          setAutosave('saved')
        }
        catch (error) {
          setAutosave('failed')
          setAutosaveErrorMessage(error instanceof Error ? error.message : 'Save failed')
        }
        return
      }
      const stampedAssets: LocalWorkerOverlayAsset[] = targets.map(target => ({
        checksum: nextAsset.checksum,
        enabled: false,
        id: nextAsset.id,
        kind: nextAsset.kind,
        metadataJson: {},
        optionsJson: {},
        source: 'overlay' as const,
        sourceRef: nextAsset.sourceRef,
        target,
        updatedAt: new Date().toISOString(),
      }))
      setAutosave('saving')
      setAutosaveErrorMessage(null)
      try {
        await saveAssets([...filtered, ...stampedAssets, ...baselineAssets()])
        setAutosave('saved')
      }
      catch (error) {
        setAutosave('failed')
        setAutosaveErrorMessage(error instanceof Error ? error.message : 'Save failed')
      }
      return
    }
    const firstOriginal = allOriginals[0] as LocalWorkerOverlayAsset | undefined
    const errors = validateAsset({ ...nextAsset, target: targets[0]! }, assets, firstOriginal)
    if (errors.length > 0) {
      setAutosave('failed')
      setAutosaveErrorMessage(formatValidation(errors))
      return
    }
    setAutosave('saving')
    setAutosaveErrorMessage(null)
    try {
      const now = new Date().toISOString()
      const matchingKeys = new Set(targets.map(target => `${nextAsset.kind}:${target}:${nextAsset.id}`))
      const stamped = assets.map(asset =>
        matchingKeys.has(`${asset.kind}:${asset.target}:${asset.id}`)
          ? { ...asset, enabled: nextAsset.enabled, source: 'overlay' as const, updatedAt: now }
          : asset,
      )
      await saveAssets(stamped)
      setAutosave('saved')
    }
    catch (error) {
      setAutosave('failed')
      setAutosaveErrorMessage(error instanceof Error ? error.message : 'Save failed')
    }
  }

  function baselineAssets(): LocalWorkerOverlayAsset[] {
    return assets.filter(asset => asset.source === 'baseline')
  }

  async function saveAssets(nextAssets: LocalWorkerOverlayAsset[]) {
    await onSaveAssets(nextAssets)
  }

  async function deleteAsset(asset: LocalWorkerOverlayAsset) {
    setSaving(true)
    try {
      const matchingKeys = new Set(targetsFor(asset).map(target => `${asset.kind}:${target}:${asset.id}`))
      await saveAssets(assets.filter(item => !matchingKeys.has(`${item.kind}:${item.target}:${item.id}`)))
      setSelectedAssetId(null)
    }
    finally {
      setSaving(false)
    }
  }

  async function duplicateAsset(asset: LocalWorkerOverlayAsset) {
    const targets = targetsFor(asset)
    const now = new Date().toISOString()
    const newId = nextCopyId(asset.id, assets)
    const copies: LocalWorkerOverlayAsset[] = targets.map(target => ({
      ...asset,
      id: newId,
      source: 'overlay' as const,
      target,
      updatedAt: now,
    }))
    setSaving(true)
    try {
      await saveAssets([...assets, ...copies])
      setSelectedAssetId(newId)
    }
    finally {
      setSaving(false)
    }
  }

  function runOrConfirmDiscard(action: () => void) {
    if (!contentDirty) {
      action()
      return
    }
    setPendingNavigation(() => action)
  }

  function clearDirtyAndRun(action: () => void) {
    setContentDirty(false)
    setPendingNavigation(null)
    action()
  }

  function selectAsset(id: string) {
    runOrConfirmDiscard(() => {
      setDraftCategory(null)
      setSelectedPanel(null)
      setSelectedAssetId(id)
    })
  }

  function selectWorkbenchPanel() {
    runOrConfirmDiscard(() => {
      setDraftCategory(null)
      setSelectedPanel('workbench')
      setSelectedAssetId(null)
    })
  }

  function selectExecutionPanel() {
    runOrConfirmDiscard(() => {
      setDraftCategory(null)
      setSelectedPanel('execution')
      setSelectedAssetId(null)
    })
  }

  function startDraft(kind: 'entry-file' | 'skill') {
    runOrConfirmDiscard(() => {
      setSelectedPanel(null)
      setSelectedAssetId(null)
      setDraftCategory(kind)
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    runOrConfirmDiscard(() => onOpenChange(false))
  }

  function discardPendingChanges() {
    const action = pendingNavigation
    clearDirtyAndRun(() => action?.())
  }

  function cancelPendingDiscard() {
    setPendingNavigation(null)
  }

  function completeDraft() {
    setContentDirty(false)
    setDraftCategory(null)
  }

  useEffect(() => {
    if (autosave !== 'saved')
      return undefined
    const timeout = window.setTimeout(() => {
      setAutosave(current => current === 'saved' ? 'idle' : current)
    }, 1600)
    return () => window.clearTimeout(timeout)
  }, [autosave])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-dvh flex-col gap-0 overflow-hidden p-0 sm:h-5/6 sm:max-w-5xl" showCloseButton={false}>
        <ItemActions data-settings-slot="settings-dialog-actions" className="absolute top-4 right-4" aria-hidden={false}>
          {autosave !== 'idle'
            ? (
                <Badge variant={autosave === 'failed' ? 'destructive' : 'outline'} role="status" aria-live="polite">
                  {autosave === 'saving'
                    ? <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="animate-spin" />
                    : autosave === 'failed'
                      ? <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      : <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />}
                  {autosave === 'saving' ? 'Saving' : autosave === 'failed' ? 'Failed' : 'Saved'}
                </Badge>
              )
            : null}
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </DialogClose>
        </ItemActions>

        <DialogHeader className="px-6 pt-6 pr-20 pb-5">
          <Badge variant="secondary" className="w-fit">WORKER OVERLAY</Badge>
          <DialogTitle>Worker configuration</DialogTitle>
          <DialogDescription>{worker ? `${worker.name} worker overlay` : 'Worker overlay'}</DialogDescription>
        </DialogHeader>
        {pendingNavigation
          ? (
              <Alert className="mx-6 mb-3">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{labels.unsavedChangesTitle}</span>
                  <ItemActions className="gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={cancelPendingDiscard}>{labels.cancel}</Button>
                    <Button type="button" variant="destructive" size="sm" onClick={discardPendingChanges}>{labels.discardChanges}</Button>
                  </ItemActions>
                </AlertDescription>
              </Alert>
            )
          : null}
        <div data-testid="worker-configuration-body" className="flex flex-1 min-h-0 max-md:flex-col">
          <div data-testid="worker-overlay-sidebar" className="flex w-80 shrink-0 flex-col min-h-0 bg-sidebar text-sidebar-foreground max-md:max-h-64 max-md:w-full max-md:flex-none">
            <div className="shrink-0 px-3 pt-4 pb-2">
              <SidebarGroupLabel className="h-auto px-2 py-0 text-xs">Overlay assets</SidebarGroupLabel>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <SidebarGroup>
                {categories.map((cat) => {
                  const catAssets = displayAssets.filter(asset => asset.kind === cat.value)
                  const collapsed = collapsedGroups[cat.value] ?? false
                  return (
                    <CollapsibleGroup
                      key={cat.value}
                      collapsed={collapsed}
                      controlsId={`overlay-group-${cat.value}`}
                      onToggle={() => setCollapsedGroups(prev => ({ ...prev, [cat.value]: !collapsed }))}
                      title={cat.label}
                      toggleAriaLabel={`Toggle ${cat.label}`}
                      action={cat.value === 'skill' || cat.value === 'entry-file'
                        ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              aria-label={cat.value === 'skill' ? labels.addSkill : labels.addEntryFile}
                              title={cat.value === 'skill' ? labels.addSkill : labels.addEntryFile}
                              onClick={() => startDraft(cat.value === 'skill' ? 'skill' : 'entry-file')}
                            >
                              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          )
                        : null}
                      drawerProps={{ className: 'gap-1' }}
                    >
                      {catAssets.length > 0
                        ? (
                            <SidebarMenu>
                              {catAssets.map(asset => (
                                <SidebarMenuItem key={asset.id}>
                                  <SidebarMenuButton
                                    isActive={selectedAsset?.id === asset.id && selectedAsset?.kind === asset.kind}
                                    size="lg"
                                    className="h-11 items-start py-1.5"
                                    onClick={() => selectAsset(asset.id)}
                                  >
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                      <span className="truncate">{asset.id}</span>
                                      <span className="truncate font-normal text-sidebar-foreground/60">
                                        {asset.kind === 'skill' ? (skillTargets[asset.id] ?? [asset.target]).sort().join(', ') : asset.target}
                                      </span>
                                    </span>
                                  </SidebarMenuButton>
                                  <DropdownMenu>
                                    <SidebarMenuAction showOnHover asChild>
                                      <DropdownMenuTrigger asChild>
                                        <button type="button" aria-label={`More actions for ${asset.id}`}>
                                          <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                                        </button>
                                      </DropdownMenuTrigger>
                                    </SidebarMenuAction>
                                    <DropdownMenuContent align="start">
                                      <DropdownMenuItem onSelect={() => void duplicateAsset(asset)}>Duplicate</DropdownMenuItem>
                                      {asset.source !== 'baseline'
                                        ? (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem variant="destructive" onSelect={() => void deleteAsset(asset)}>Delete</DropdownMenuItem>
                                            </>
                                          )
                                        : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </SidebarMenuItem>
                              ))}
                            </SidebarMenu>
                          )
                        : (
                            <p className="px-2 text-xs text-sidebar-foreground/60">
                              No
                              {cat.label.toLowerCase()}
                              {' '}
                              assets.
                            </p>
                          )}
                    </CollapsibleGroup>
                  )
                })}
                {canShowWorkbenchPanel
                  ? (
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={effectiveSelectedPanel === 'workbench'}
                            size="lg"
                            className="h-11 items-start py-1.5"
                            onClick={selectWorkbenchPanel}
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">Workbench</span>
                              <span className="truncate font-normal text-sidebar-foreground/60">
                                Worker route preference
                              </span>
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    )
                  : null}
                {canShowExecutionPanel
                  ? (
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={effectiveSelectedPanel === 'execution'}
                            size="lg"
                            className="h-11 items-start py-1.5"
                            onClick={selectExecutionPanel}
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">{labels.executionPanel}</span>
                              <span className="truncate font-normal text-sidebar-foreground/60">
                                {labels.executionPanelDetail}
                              </span>
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    )
                  : null}
              </SidebarGroup>
            </ScrollArea>
            <div data-testid="worker-overlay-asset-list" data-orientation="vertical" className="hidden" />
          </div>
          <div data-testid="worker-overlay-editor-panel" className="flex min-w-0 flex-1 flex-col max-md:w-full max-md:flex-none max-md:min-w-0">
            <ScrollArea className="h-full">
              <div className="p-6">
                {draftCategory && worker
                  ? (
                      <OverlayContentAddPanel
                        key={draftCategory}
                        kind={draftCategory}
                        labels={labels}
                        workerId={worker.id}
                        onAdded={() => {
                          completeDraft()
                          void onReload?.()
                        }}
                        onCancel={() => runOrConfirmDiscard(() => completeDraft())}
                        onDirtyChange={setContentDirty}
                      />
                    )
                  : effectiveSelectedPanel === 'execution' && settings
                    ? (
                        <ExecutionConfigPanel
                          copy={copy}
                          settings={settings}
                          onSaved={onSettingsSaved}
                        />
                      )
                    : effectiveSelectedPanel === 'workbench'
                      ? (
                          <ItemGroup className="gap-3">
                            <Item variant="muted">
                              <ItemContent className="grid min-w-0 gap-3">
                                <ItemTitle>Workbench</ItemTitle>
                                <ItemDescription>
                                  Choose the declared mounted route used by this Soul worker.
                                </ItemDescription>
                              </ItemContent>
                            </Item>
                            {workbenchTabs && workbenchTabs.length > 1
                              ? (
                                  <Item variant="default">
                                    <ItemContent className="grid min-w-0 gap-2">
                                      <ItemTitle>Workbench route</ItemTitle>
                                      <ItemDescription>This preference is stored for this worker only.</ItemDescription>
                                      <ItemActions className="gap-0.5" role="tablist" aria-label="Workbench routes">
                                        {workbenchTabs.map(tab => (
                                          <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={tab.id === activeWorkbenchTabId}
                                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                              tab.id === activeWorkbenchTabId
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                            onClick={() => onSelectWorkbenchTab?.(tab)}
                                          >
                                            {tab.label}
                                          </button>
                                        ))}
                                      </ItemActions>
                                    </ItemContent>
                                  </Item>
                                )
                              : null}
                          </ItemGroup>
                        )
                      : selectedAsset
                        ? (
                            <ItemGroup className="gap-3">
                              <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <ItemTitle>{selectedAsset.id}</ItemTitle>
                                    {selectedAsset.source === 'baseline'
                                      ? <Badge variant="secondary" className="text-xs">baseline</Badge>
                                      : null}
                                  </div>
                                  <ItemDescription>{selectedAsset.target}</ItemDescription>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Switch
                                    checked={selectedAsset.enabled}
                                    disabled={saving}
                                    aria-label={`Enable ${selectedAsset.id}`}
                                    onCheckedChange={checked => void saveAsset({ ...selectedAsset, enabled: checked })}
                                  />
                                </div>
                              </div>
                              {autosave === 'failed' && autosaveErrorMessage
                                ? (
                                    <Alert variant="destructive">
                                      <AlertDescription>{autosaveErrorMessage}</AlertDescription>
                                    </Alert>
                                  )
                                : null}
                              {worker
                                ? (
                                    <OverlayContentEditorPanel
                                      key={`${selectedAsset.kind}:${selectedAsset.id}:${selectedAsset.target}`}
                                      asset={selectedAsset}
                                      labels={labels}
                                      workerId={worker.id}
                                      onDirtyChange={setContentDirty}
                                      onSaved={() => void onReload?.()}
                                    />
                                  )
                                : null}
                            </ItemGroup>
                          )
                        : (
                            <ItemDescription className="pt-8 text-center">
                              Select an asset from the list.
                            </ItemDescription>
                          )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// configKey the content GET/PUT endpoints address. Skills/entry-files key on the
// asset id; MCP keys on the engine target (codex/claude-code) the daemon resolves.
function contentConfigKey(asset: LocalWorkerOverlayAsset): string {
  if (asset.kind === 'entry-file')
    return `entry-file-overlay:${asset.id}`
  if (asset.kind === 'mcp-client')
    return `mcp-overlay:${asset.target}`
  return `skill-overlay:${asset.id}`
}

function OverlayContentEditorPanel({
  asset,
  labels,
  onDirtyChange,
  onSaved,
  workerId,
}: {
  asset: LocalWorkerOverlayAsset
  labels: StaticMessages['workerConfig']
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  workerId: string
}) {
  const configKey = contentConfigKey(asset)
  const target = asset.kind === 'skill' ? asset.target : undefined
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [editable, setEditable] = useState(false)
  const [source, setSource] = useState<'baseline' | 'overlay'>('baseline')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = editable && content !== savedContent

  useEffect(() => {
    let cancelled = false
    getOverlayContent(workerId, configKey, target)
      .then((result) => {
        if (cancelled)
          return
        setContent(result.content)
        setSavedContent(result.content)
        setEditable(result.editable)
        setSource(result.source)
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : labels.loadFailed)
      })
      .finally(() => {
        if (!cancelled)
          setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configKey, labels.loadFailed, target, workerId])

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  async function save() {
    if (!dirty)
      return
    setBusy(true)
    setError(null)
    try {
      const result = await putOverlayContent(workerId, configKey, { content, target })
      setContent(result.content)
      setSavedContent(result.content)
      setEditable(result.editable)
      setSource(result.source)
      onSaved()
    }
    catch (caught) {
      setError(caught instanceof LocalApiError ? caught.message : caught instanceof Error ? caught.message : labels.loadFailed)
    }
    finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setError(null)
    try {
      await resetOverlayContent(workerId, configKey)
      onSaved()
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.loadFailed)
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Item variant="default">
      <ItemContent className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <ItemTitle>{labels.editorTitle(asset.id)}</ItemTitle>
            <ItemDescription>{asset.kind === 'mcp-client' ? labels.readonlyHint : labels.contentLabel}</ItemDescription>
          </div>
          <Badge variant="outline" data-testid="overlay-content-source">
            {source === 'overlay' ? labels.sourceOverlay : labels.sourceBaseline}
          </Badge>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="overlay-content-textarea">{labels.contentLabel}</Label>
          <Textarea
            id="overlay-content-textarea"
            aria-label={labels.contentLabel}
            className="min-h-72 font-mono text-xs"
            value={content}
            readOnly={!editable}
            disabled={loading}
            onChange={event => setContent(event.currentTarget.value)}
          />
          {!editable
            ? <p className="text-xs text-muted-foreground">{labels.readonlyHint}</p>
            : null}
        </div>
        {error
          ? (
              <Alert variant="destructive">
                <AlertDescription data-testid="overlay-content-error">{error}</AlertDescription>
              </Alert>
            )
          : null}
        <ItemActions className="justify-end gap-2">
          {editable && source === 'overlay'
            ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void reset()}>
                  {labels.resetToBaseline}
                </Button>
              )
            : null}
          {editable
            ? (
                <Button type="button" disabled={busy || loading || !dirty} onClick={() => void save()}>
                  {busy ? labels.saving : labels.save}
                </Button>
              )
            : null}
        </ItemActions>
      </ItemContent>
    </Item>
  )
}

function OverlayContentAddPanel({
  kind,
  labels,
  onAdded,
  onCancel,
  onDirtyChange,
  workerId,
}: {
  kind: 'entry-file' | 'skill'
  labels: StaticMessages['workerConfig']
  onAdded: () => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  workerId: string
}) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = name.trim().length > 0 || content.length > 0

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  async function add() {
    if (!name.trim())
      return
    setBusy(true)
    setError(null)
    try {
      await putOverlayContent(workerId, `${kind}-overlay:${name.trim()}`, { content })
      onAdded()
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.loadFailed)
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <ItemGroup className="gap-3">
      <Item variant="muted">
        <ItemContent className="grid min-w-0 gap-1">
          <ItemTitle>{kind === 'skill' ? labels.addSkill : labels.addEntryFile}</ItemTitle>
          <ItemDescription>{labels.contentLabel}</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="default">
        <ItemContent className="grid min-w-0 gap-3">
          <div className="grid gap-2">
            <Input
              aria-label={labels.addNamePlaceholder}
              placeholder={labels.addNamePlaceholder}
              value={name}
              onChange={event => setName(event.currentTarget.value)}
            />
            <Textarea
              aria-label={labels.addContentPlaceholder}
              placeholder={labels.addContentPlaceholder}
              className="min-h-48 font-mono text-xs"
              value={content}
              onChange={event => setContent(event.currentTarget.value)}
            />
          </div>
          {error
            ? (
                <Alert variant="destructive">
                  <AlertDescription data-testid="overlay-add-error">{error}</AlertDescription>
                </Alert>
              )
            : null}
          <ItemActions className="justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>{labels.cancel}</Button>
            <Button type="button" disabled={busy || !name.trim()} onClick={() => void add()}>
              {busy ? labels.saving : labels.add}
            </Button>
          </ItemActions>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
}

// 镜像 daemon 的 isSafeSecretReference 逻辑，保持客户端校验与服务端一致
// packages/worker-daemon/src/modes/worker/settings.ts
const _SECRET_REFERENCE_PREFIXES = ['$', 'env:', 'secretref:'] as const
const _LITERAL_SECRET_RE = /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}|ghp_\w{20,}|gho_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35,}|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN[A-Z ]*PRIVATE KEY-----/

function isLiteralSecret(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed === '[REDACTED]')
    return false
  const prefix = _SECRET_REFERENCE_PREFIXES.find(p => trimmed.startsWith(p))
  if (!prefix)
    return true
  const body = trimmed.slice(prefix.length)
  if (body.includes('='))
    return true
  return _LITERAL_SECRET_RE.test(body)
}

function ExecutionConfigPanel({
  copy,
  onSaved,
  settings,
}: {
  copy: StaticMessages
  onSaved?: (settings: LocalSettingsConfig) => void
  settings: LocalSettingsConfig
}) {
  const labels = copy.workerConfig
  const settingsCopy = copy.settings

  const [mode, setMode] = useState<LocalSettingsConfig['executionMode']>(settings.executionMode)
  const [engineId, setEngineId] = useState(settings.engineId)
  const [provider, setProvider] = useState(settings.byok.provider)
  const [baseUrl, setBaseUrl] = useState(settings.byok.baseUrl)
  const [model, setModel] = useState(settings.byok.model)
  // apiKeyRef 从不预填真实引用值 — 只用 apiKeyRefPresent 布尔显示已配置状态
  const [apiKeyRef, setApiKeyRef] = useState('')
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // 从 settings 派生是否已设置 key，绝不把真实引用值渲染到 DOM
  const apiKeyRefPresent = Boolean(settings.byok.apiKeyRef.trim())

  function handleApiKeyRefChange(value: string) {
    setApiKeyRef(value)
    setApiKeyError(value && isLiteralSecret(value) ? labels.keyRefLiteralError : null)
  }

  async function handleSave() {
    if (apiKeyRef && isLiteralSecret(apiKeyRef)) {
      setApiKeyError(labels.keyRefLiteralError)
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const patch: Partial<LocalSettingsConfig> = {
        executionMode: mode,
        engineId,
        byok: {
          ...settings.byok,
          provider,
          baseUrl,
          model,
          ...(apiKeyRef ? { apiKeyRef } : {}),
        },
      }
      const result = await saveSettings(patch)
      onSaved?.(result.settings)
      setApiKeyRef('')
      setSaved(true)
    }
    catch (error) {
      setSaveError(error instanceof Error ? error.message : labels.loadFailed)
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <ItemGroup className="gap-4" data-testid="execution-config-panel">
      <Item variant="muted">
        <ItemContent className="grid min-w-0 gap-1">
          <ItemTitle>{labels.executionPanel}</ItemTitle>
          <ItemDescription>{settingsCopy.nav.executionDetail}</ItemDescription>
        </ItemContent>
      </Item>

      <ToggleGroup
        type="single"
        aria-label={settingsCopy.nav.execution}
        className="w-full"
        value={mode}
        onValueChange={(value) => {
          if (value)
            setMode(value as LocalSettingsConfig['executionMode'])
        }}
      >
        <ToggleGroupItem value="local-cli" className="h-auto min-h-12 flex-1 justify-start px-3 py-2">
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-medium">Local CLI</span>
            <span className="text-xs font-normal opacity-70">
              {settingsCopy.engine.availableCount(settings.engines.filter(e => e.installed).length)}
            </span>
          </span>
        </ToggleGroupItem>
        <ToggleGroupItem value="byok" className="h-auto min-h-12 flex-1 justify-start px-3 py-2">
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-medium">BYOK</span>
            <span className="text-xs font-normal opacity-70">{provider}</span>
          </span>
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === 'local-cli'
        ? (
            <Item variant="default">
              <ItemContent className="grid min-w-0 gap-2">
                <ItemTitle>{settingsCopy.engine.title}</ItemTitle>
                <ItemDescription>{settingsCopy.engine.hint}</ItemDescription>
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {settings.engines.map(engine => (
                    <button
                      key={engine.id}
                      type="button"
                      aria-pressed={engineId === engine.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                        engineId === engine.id
                          ? 'border-primary bg-primary/5 font-medium'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => setEngineId(engine.id)}
                    >
                      <span className="flex-1 truncate">{engine.id}</span>
                      {engine.installed
                        ? <Badge variant="outline" className="shrink-0 text-xs">{copy.common.installed}</Badge>
                        : <Badge variant="secondary" className="shrink-0 text-xs">{copy.common.notInstalled}</Badge>}
                    </button>
                  ))}
                </div>
              </ItemContent>
            </Item>
          )
        : (
            <Item variant="default">
              <ItemContent className="grid min-w-0 gap-3">
                <ItemTitle>{settingsCopy.byok.title}</ItemTitle>
                <ItemDescription>{settingsCopy.byok.hint}</ItemDescription>
                <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="wcd-byok-provider">{settingsCopy.byok.provider}</FieldLabel>
                    <Input id="wcd-byok-provider" value={provider} onChange={e => setProvider(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="wcd-byok-base-url">{settingsCopy.byok.baseUrl}</FieldLabel>
                    <Input id="wcd-byok-base-url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="wcd-byok-model">{settingsCopy.byok.model}</FieldLabel>
                    <Input id="wcd-byok-model" value={model} onChange={e => setModel(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="wcd-byok-api-key-ref">{settingsCopy.byok.apiKeyRef}</FieldLabel>
                    <Input
                      id="wcd-byok-api-key-ref"
                      aria-label={settingsCopy.byok.apiKeyRef}
                      data-testid="byok-api-key-ref-input"
                      placeholder="env:NAME"
                      value={apiKeyRef}
                      autoComplete="off"
                      onChange={e => handleApiKeyRefChange(e.target.value)}
                    />
                    {apiKeyError
                      ? (
                          <p className="text-xs text-destructive" data-testid="api-key-ref-error">{apiKeyError}</p>
                        )
                      : apiKeyRefPresent
                        ? (
                            <p className="text-xs text-muted-foreground" data-testid="api-key-ref-present">
                              {settingsCopy.byok.hint}
                            </p>
                          )
                        : null}
                  </Field>
                </FieldGroup>
              </ItemContent>
            </Item>
          )}

      {saveError
        ? (
            <Alert variant="destructive">
              <AlertDescription data-testid="execution-save-error">{saveError}</AlertDescription>
            </Alert>
          )
        : null}
      {saved
        ? (
            <Alert role="status">
              <AlertDescription>{settingsCopy.autosave.saved}</AlertDescription>
            </Alert>
          )
        : null}
      <ItemActions className="justify-end">
        <Button
          type="button"
          disabled={saving || Boolean(apiKeyRef && apiKeyError)}
          onClick={() => void handleSave()}
        >
          {saving ? labels.saving : labels.save}
        </Button>
      </ItemActions>
    </ItemGroup>
  )
}

function formatValidation(errors: string[]): string | null {
  return errors.length > 0 ? errors.map(error => `- ${error}`).join('\n') : null
}

function nextCopyId(id: string, assets: LocalWorkerOverlayAsset[]): string {
  const existing = new Set(assets.map(asset => asset.id))
  if (!existing.has(id))
    return id
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${id}-${index}`
    if (!existing.has(candidate))
      return candidate
  }
  return `${id}-${Date.now()}`
}

function validateAsset(asset: LocalWorkerOverlayAsset, assets: LocalWorkerOverlayAsset[], original?: LocalWorkerOverlayAsset): string[] {
  const errors: string[] = []
  if (!asset.id.trim())
    errors.push('Asset id is required.')
  if (!asset.target.trim())
    errors.push('Target is required.')
  if (!asset.sourceRef.trim())
    errors.push('Source reference is required.')
  if (assets.some(item => item !== original && item.kind === asset.kind && item.id === asset.id))
    errors.push('Another asset with this kind and id already exists.')
  if (/(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s]+/i.test(asset.sourceRef) || /sk-[a-z0-9]{15,}/i.test(asset.sourceRef))
    errors.push('Source reference appears to contain a literal secret.')
  return errors
}
