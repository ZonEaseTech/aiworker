import type { LocalWorker, LocalWorkerOverlayAsset, LocalWorkerOverlayAssetKind } from '@zonease/aiworker-shared'

import { Cancel01Icon, MoreHorizontalCircle01Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@zonease/aiworker-ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@zonease/aiworker-ui/components/dropdown-menu'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@zonease/aiworker-ui/components/sidebar'
import { Switch } from '@zonease/aiworker-ui/components/switch'
import { Textarea } from '@zonease/aiworker-ui/components/textarea'
import { useEffect, useMemo, useState } from 'react'

type OverlayCategory = LocalWorkerOverlayAssetKind

const categories: { label: string, value: OverlayCategory }[] = [
  { label: 'Skills', value: 'skill' },
  { label: 'MCP clients', value: 'mcp-client' },
  { label: 'Entry files', value: 'entry-file' },
]

interface NewAssetDraft {
  content: string
  id: string
  kind: OverlayCategory
  target: string
}

export function WorkerConfigurationDialog({
  activeWorkbenchTabId,
  assets,
  onOpenChange,
  onSaveAssets,
  onSelectWorkbenchTab,
  open,
  worker,
  workbenchTabs,
}: {
  activeWorkbenchTabId?: string | null
  assets: LocalWorkerOverlayAsset[]
  onOpenChange: (open: boolean) => void
  onSaveAssets: (assets: LocalWorkerOverlayAsset[]) => Promise<void> | void
  onSelectWorkbenchTab?: (tab: { id: string, path: string }) => void
  open: boolean
  worker: LocalWorker | null
  workbenchTabs?: { id: string, label: string, path: string }[]
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [activeCategory, setActiveCategory] = useState<OverlayCategory | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createValidation, setCreateValidation] = useState<string | null>(null)
  const [newAsset, setNewAsset] = useState<NewAssetDraft | null>(null)
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [autosaveErrorMessage, setAutosaveErrorMessage] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedPanel, setSelectedPanel] = useState<null | 'workbench'>(null)
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
  const selectedAsset = selectedPanel === 'workbench' ? null : (displayAssets.find(asset => asset.id === selectedAssetId) ?? displayAssets[0] ?? null)
  const selectedAssetKey = selectedAsset ? `${selectedAsset.kind}:${selectedAsset.id}` : null
  const defaultNewAsset = useMemo(() => activeCategory ? createDefaultAssetDraft(activeCategory, assets) : null, [activeCategory, assets])
  const effectiveNewAsset = newAsset?.kind === activeCategory ? newAsset : defaultNewAsset

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
        content: nextAsset.content,
        enabled: false,
        id: nextAsset.id,
        kind: nextAsset.kind,
        metadataJson: {},
        source: 'overlay' as const,
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

  function createTargets(kind: OverlayCategory, target: string): string[] {
    if (kind !== 'skill')
      return [target.trim()]
    return ['codex', 'claude-code']
  }

  async function createAsset() {
    if (!activeCategory || !effectiveNewAsset)
      return
    const targets = createTargets(activeCategory, effectiveNewAsset.target)
    const now = new Date().toISOString()
    const nextAssets: LocalWorkerOverlayAsset[] = targets.map(target => ({
      content: effectiveNewAsset.content,
      enabled: true,
      id: effectiveNewAsset.id.trim(),
      kind: activeCategory,
      metadataJson: {},
      source: 'overlay' as const,
      target,
      updatedAt: now,
    }))
    const errors = nextAssets.flatMap(asset => validateAsset(asset, assets))
    setCreateValidation(formatValidation(errors))
    if (errors.length > 0)
      return
    setSaving(true)
    try {
      await saveAssets([...assets, ...nextAssets])
      setSelectedAssetId(nextAssets[0]!.id)
      setNewAsset(null)
      setCreateOpen(false)
    }
    finally {
      setSaving(false)
    }
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

  function selectAsset(id: string) {
    setSelectedPanel(null)
    setSelectedAssetId(id)
  }

  function updateNewAsset(patch: Partial<NewAssetDraft>) {
    if (!defaultNewAsset)
      return
    setNewAsset(current => ({
      ...(current?.kind === activeCategory ? current : defaultNewAsset),
      ...patch,
    }))
    setCreateValidation(null)
  }

  useEffect(() => {
    if (autosave !== 'saved')
      return undefined
    const timeout = window.setTimeout(() => {
      setAutosave(current => current === 'saved' ? 'idle' : current)
    }, 1600)
    return () => window.clearTimeout(timeout)
  }, [autosave])

  useEffect(() => {
    setEditContent(selectedAsset?.content ?? '')
  }, [selectedAssetKey])

  useEffect(() => {
    if (selectedPanel === 'workbench' && (!workbenchTabs || workbenchTabs.length <= 1))
      setSelectedPanel(null)
  }, [selectedPanel, workbenchTabs])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                      meta={catAssets.length > 0 ? <Badge variant="outline">{catAssets.length}</Badge> : null}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setActiveCategory(cat.value)
                          setCreateOpen(true)
                          setCreateValidation(null)
                        }}
                      >
                        New
                        {' '}
                        {cat.label.slice(0, -1).toLowerCase()}
                      </Button>
                    </CollapsibleGroup>
                  )
                })}
                {workbenchTabs && workbenchTabs.length > 1
                  ? (
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={selectedPanel === 'workbench'}
                            size="lg"
                            className="h-11 items-start py-1.5"
                            onClick={() => {
                              setSelectedPanel('workbench')
                              setSelectedAssetId(null)
                            }}
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
              </SidebarGroup>
            </ScrollArea>
            <div data-testid="worker-overlay-asset-list" data-orientation="vertical" className="hidden" />
          </div>
          <div data-testid="worker-overlay-editor-panel" className="flex-1 min-w-0 max-md:w-full">
            <ScrollArea className="h-full">
              <div className="p-6">
                {createOpen
                  ? (
                      <ItemGroup className="gap-3">
                        <Item variant="muted">
                          <ItemContent className="grid min-w-0 gap-2">
                            <ItemTitle>
                              Create
                              {' '}
                              {activeCategory ? categories.find(c => c.value === activeCategory)?.label.slice(0, -1) : 'asset'}
                            </ItemTitle>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Input aria-label="Overlay asset id" value={effectiveNewAsset?.id ?? ''} onChange={event => updateNewAsset({ id: event.currentTarget.value })} />
                              <Input aria-label="Overlay asset target" value={effectiveNewAsset?.target ?? ''} onChange={event => updateNewAsset({ target: event.currentTarget.value })} />
                            </div>
                            <Textarea aria-label="Overlay asset content" value={effectiveNewAsset?.content ?? ''} onChange={event => updateNewAsset({ content: event.currentTarget.value })} />
                          </ItemContent>
                          <ItemActions>
                            <Button type="button" variant="secondary" disabled={saving} onClick={() => void createAsset()}>
                              Create asset
                            </Button>
                          </ItemActions>
                        </Item>
                        {createValidation
                          ? (
                              <Item variant="default">
                                <ItemContent>
                                  <ItemTitle>Validation</ItemTitle>
                                  <ItemDescription className="line-clamp-none whitespace-pre-wrap">{createValidation}</ItemDescription>
                                </ItemContent>
                              </Item>
                            )
                          : null}
                      </ItemGroup>
                    )
                  : selectedPanel === 'workbench'
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
                                <ItemDescription>
                                  {selectedAsset.source}
                                  {' '}
                                  ·
                                  {' '}
                                  {selectedAsset.target}
                                </ItemDescription>
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
                            <Textarea
                              value={editContent}
                              aria-label={`${selectedAsset.id} editor`}
                              readOnly={selectedAsset.source === 'baseline'}
                              onChange={event => setEditContent(event.currentTarget.value)}
                              onBlur={() => {
                                if (selectedAsset.source === 'baseline')
                                  return
                                if (editContent !== (selectedAsset?.content ?? '')) {
                                  void saveAsset({ ...selectedAsset, content: editContent })
                                }
                              }}
                            />
                            {autosave === 'failed' && autosaveErrorMessage
                              ? (
                                  <Alert variant="destructive">
                                    <AlertDescription>{autosaveErrorMessage}</AlertDescription>
                                  </Alert>
                                )
                              : null}
                          </ItemGroup>
                        )
                      : (
                          <ItemDescription className="pt-8 text-center">
                            Select an asset from the list or create a new one.
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

function createDefaultAssetDraft(kind: OverlayCategory, assets: LocalWorkerOverlayAsset[] = []): NewAssetDraft {
  const base = kind === 'entry-file' ? 'AGENTS.md' : kind === 'mcp-client' ? 'team-context' : 'custom-skill'
  return {
    content: defaultContent(kind),
    id: nextCopyId(base, assets),
    kind,
    target: kind === 'entry-file' ? 'workspace' : 'codex',
  }
}

function defaultContent(kind: OverlayCategory): string {
  if (kind === 'entry-file')
    return '# Worker entry\n'
  if (kind === 'mcp-client')
    return '{\n  "command": "",\n  "args": []\n}\n'
  return '# Custom Skill\n\nUse when this worker needs explicit local behavior.\n'
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
  if (!asset.content.trim())
    errors.push('Content is required.')
  if (assets.some(item => item !== original && item.kind === asset.kind && item.id === asset.id))
    errors.push('Another asset with this kind and id already exists.')
  if (/(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s]+/i.test(asset.content) || /sk-[a-z0-9]{15,}/i.test(asset.content))
    errors.push('Content appears to contain a literal secret. Use a secret reference instead.')
  return errors
}
