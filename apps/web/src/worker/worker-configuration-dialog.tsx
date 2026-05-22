import type { LocalWorker, LocalWorkerOverlayAsset, LocalWorkerOverlayAssetKind, LocalWorkspace, SoulAppProjectionReceipt } from '@zonease/aiworker-shared'

import { MoreHorizontalCircle01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@zonease/aiworker-ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@zonease/aiworker-ui/components/dropdown-menu'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { Switch } from '@zonease/aiworker-ui/components/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zonease/aiworker-ui/components/tabs'
import { Textarea } from '@zonease/aiworker-ui/components/textarea'
import { useMemo, useState } from 'react'

type OverlayCategory = LocalWorkerOverlayAssetKind
type OverlayTab = OverlayCategory | 'projection'

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

interface AssetDraft {
  content: string
  key: string | null
}

export function WorkerConfigurationDialog({
  assets,
  onOpenChange,
  onProjectWorkspaceAssets,
  onSaveAssets,
  open,
  projectionWorkspace,
  worker,
}: {
  assets: LocalWorkerOverlayAsset[]
  onOpenChange: (open: boolean) => void
  onProjectWorkspaceAssets?: () => Promise<SoulAppProjectionReceipt | null> | SoulAppProjectionReceipt | null
  onSaveAssets: (assets: LocalWorkerOverlayAsset[]) => Promise<void> | void
  open: boolean
  projectionWorkspace?: LocalWorkspace | null
  worker: LocalWorker | null
}) {
  const [tab, setTab] = useState<OverlayTab>('skill')
  const [createOpen, setCreateOpen] = useState(false)
  const [createValidation, setCreateValidation] = useState<string | null>(null)
  const [draft, setDraft] = useState<AssetDraft>({ content: '', key: null })
  const [mode, setMode] = useState<'editor' | 'preview'>('editor')
  const [newAsset, setNewAsset] = useState<NewAssetDraft | null>(null)
  const [assetValidation, setAssetValidation] = useState<string | null>(null)
  const [projecting, setProjecting] = useState(false)
  const [projectionStatus, setProjectionStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const activeCategory = tab === 'projection' ? null : tab
  const selectedAssets = useMemo(() => tab === 'projection' ? [] : assets.filter(asset => asset.kind === tab), [assets, tab])
  const selectedAsset = selectedAssets.find(asset => asset.id === selectedAssetId) ?? selectedAssets[0] ?? null
  const selectedAssetKey = selectedAsset ? `${selectedAsset.kind}:${selectedAsset.id}` : null
  const draftContent = selectedAssetKey && draft.key === selectedAssetKey ? draft.content : selectedAsset?.content ?? ''
  const dirty = Boolean(selectedAsset && draftContent !== selectedAsset.content)
  const defaultNewAsset = useMemo(() => activeCategory ? createDefaultAssetDraft(activeCategory, assets) : null, [activeCategory, assets])
  const effectiveNewAsset = newAsset?.kind === activeCategory ? newAsset : defaultNewAsset

  async function saveAsset(nextAsset: LocalWorkerOverlayAsset) {
    const stampedAsset = { ...nextAsset, source: 'overlay' as const, updatedAt: new Date().toISOString() }
    setSaving(true)
    try {
      await saveAssets(assets.map(asset => asset.id === nextAsset.id && asset.kind === nextAsset.kind ? stampedAsset : asset))
    }
    finally {
      setSaving(false)
    }
  }

  async function saveAssets(nextAssets: LocalWorkerOverlayAsset[]) {
    await onSaveAssets(nextAssets)
  }

  async function createAsset() {
    if (!activeCategory || !effectiveNewAsset)
      return
    const nextAsset: LocalWorkerOverlayAsset = {
      content: effectiveNewAsset.content,
      enabled: true,
      id: effectiveNewAsset.id.trim(),
      kind: activeCategory,
      metadataJson: {},
      source: 'overlay',
      target: effectiveNewAsset.target.trim(),
      updatedAt: new Date().toISOString(),
    }
    const errors = validateAsset(nextAsset, assets)
    setCreateValidation(formatValidation(errors))
    if (errors.length > 0)
      return
    setSaving(true)
    try {
      await saveAssets([...assets, nextAsset])
      setSelectedAssetId(nextAsset.id)
      setAssetValidation(null)
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
      await saveAssets(assets.filter(item => !(item.kind === asset.kind && item.id === asset.id)))
      setSelectedAssetId(null)
      setAssetValidation(null)
    }
    finally {
      setSaving(false)
    }
  }

  async function duplicateAsset(asset: LocalWorkerOverlayAsset) {
    const copy = {
      ...asset,
      id: nextCopyId(asset.id, assets),
      source: 'overlay' as const,
      updatedAt: new Date().toISOString(),
    }
    setSaving(true)
    try {
      await saveAssets([...assets, copy])
      setSelectedAssetId(copy.id)
      setAssetValidation(null)
    }
    finally {
      setSaving(false)
    }
  }

  function runValidation(asset: LocalWorkerOverlayAsset) {
    setAssetValidation(formatValidation(validateAsset({ ...asset, content: draftContent }, assets, asset)))
  }

  function resetDraft() {
    setDraft({ content: selectedAsset?.content ?? '', key: selectedAssetKey })
    setAssetValidation(null)
  }

  function selectAsset(id: string) {
    setSelectedAssetId(id)
    setAssetValidation(null)
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

  async function projectWorkspaceAssets() {
    if (!onProjectWorkspaceAssets || !projectionWorkspace)
      return
    setProjecting(true)
    setProjectionStatus(null)
    try {
      const receipt = await onProjectWorkspaceAssets()
      setProjectionStatus(`Projection updated${receipt ? ` with ${receipt.projections.length} item${receipt.projections.length === 1 ? '' : 's'}` : ''}.`)
    }
    catch (error) {
      setProjectionStatus(error instanceof Error ? error.message : String(error))
    }
    finally {
      setProjecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh flex-col gap-0 overflow-hidden p-0 sm:h-5/6 sm:max-w-5xl">
        <div className="px-6 pt-6 pb-5">
          <Badge variant="secondary" className="w-fit">WORKER OVERLAY</Badge>
          <DialogTitle>Worker configuration</DialogTitle>
          <DialogDescription>{worker ? `${worker.name} worker overlay` : 'Worker overlay'}</DialogDescription>
        </div>
        <Tabs
          value={tab}
          className="flex flex-1 min-h-0 flex-col gap-0"
          onValueChange={(value) => {
            setTab(value as OverlayTab)
            setCreateOpen(false)
            setCreateValidation(null)
            setAssetValidation(null)
          }}
        >
          <TabsList>
            {categories.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
            <TabsTrigger value="projection">Projection</TabsTrigger>
          </TabsList>
          {categories.map(item => (
            <TabsContent key={item.value} value={item.value} className="flex-1 min-h-0 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="grid gap-4 p-6">
                  <div data-testid="worker-overlay-asset-list" data-orientation="horizontal" className="flex min-w-0 gap-2 overflow-x-auto">
                <Button
                  type="button"
                  variant={createOpen ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setCreateOpen(current => !current)
                    setCreateValidation(null)
                  }}
                >
                  New asset
                </Button>
                {selectedAssets.length > 0
                  ? selectedAssets.map(asset => (
                      <Button key={asset.id} type="button" variant={selectedAsset?.id === asset.id ? 'secondary' : 'ghost'} onClick={() => selectAsset(asset.id)}>
                        {asset.id}
                      </Button>
                    ))
                  : <ItemDescription>No worker overlay assets.</ItemDescription>}
              </div>
              {createOpen
                ? (
                    <>
                      <Item variant="muted">
                        <ItemContent className="grid min-w-0 gap-2">
                          <ItemTitle>
                            Create
                            {' '}
                            {item.label.slice(0, -1)}
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
                    </>
                  )
                : null}
              {selectedAsset
                ? (
                    <ItemGroup className="gap-3">
                      <Item variant="muted">
                        <ItemContent className="min-w-0">
                          <ItemTitle>{selectedAsset.id}</ItemTitle>
                          <ItemDescription>
                            {selectedAsset.source}
                            {' '}
                            ·
                            {' '}
                            {selectedAsset.target}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          {dirty
                            ? (
                                <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void saveAsset({ ...selectedAsset, content: draftContent })}>
                                  Apply
                                </Button>
                              )
                            : null}
                          <Switch
                            checked={selectedAsset.enabled}
                            disabled={saving}
                            aria-label={`Enable ${selectedAsset.id}`}
                            onCheckedChange={checked => void saveAsset({ ...selectedAsset, enabled: checked })}
                          />
                          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => runValidation(selectedAsset)}>
                            Validate
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${selectedAsset.id}`}>
                                <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => void duplicateAsset(selectedAsset)}>Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onSelect={resetDraft} disabled={!dirty}>Reset draft</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setTab('projection')}>Projection history</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => void deleteAsset(selectedAsset)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </ItemActions>
                      </Item>
                      {assetValidation
                        ? (
                            <Item variant="default">
                              <ItemContent>
                                <ItemTitle>Validation</ItemTitle>
                                <ItemDescription className="line-clamp-none whitespace-pre-wrap">{assetValidation}</ItemDescription>
                              </ItemContent>
                            </Item>
                          )
                        : null}
                      <Tabs value={mode} onValueChange={value => setMode(value as 'editor' | 'preview')}>
                        <TabsList>
                          <TabsTrigger value="editor">Editor</TabsTrigger>
                          <TabsTrigger value="preview">Preview</TabsTrigger>
                        </TabsList>
                        <TabsContent value="editor">
                          <Textarea value={draftContent} aria-label={`${selectedAsset.id} editor`} onChange={event => setDraft({ content: event.currentTarget.value, key: selectedAssetKey })} />
                        </TabsContent>
                        <TabsContent value="preview">
                          <Item variant="default">
                            <ItemContent>
                              <ItemTitle>{selectedAsset.id}</ItemTitle>
                              <ItemDescription className="line-clamp-none whitespace-pre-wrap">{draftContent}</ItemDescription>
                            </ItemContent>
                          </Item>
                        </TabsContent>
                      </Tabs>
                    </ItemGroup>
                  )
                : null}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
          <TabsContent value="projection" className="flex-1 min-h-0 overflow-hidden p-0">
            <ScrollArea className="h-full">
            <ItemGroup className="gap-2">
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>Projection receipt</ItemTitle>
                  <ItemDescription>
                    {projectionWorkspace
                      ? `Target workspace: ${projectionWorkspace.name}`
                      : 'Select a workspace before running projection.'}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button type="button" variant="secondary" size="sm" disabled={!projectionWorkspace || !onProjectWorkspaceAssets || projecting} onClick={() => void projectWorkspaceAssets()}>
                    <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                    Run projection
                  </Button>
                </ItemActions>
              </Item>
              {projectionStatus
                ? (
                    <Item variant="default">
                      <ItemContent>
                        <ItemTitle>Projection status</ItemTitle>
                        <ItemDescription>{projectionStatus}</ItemDescription>
                      </ItemContent>
                    </Item>
                  )
                : null}
              {assets.length > 0
                ? assets.map(asset => (
                    <Item key={`${asset.kind}:${asset.id}`} variant="default">
                      <ItemContent className="min-w-0">
                        <ItemTitle>{asset.id}</ItemTitle>
                        <ItemDescription>{`${asset.kind} · ${asset.enabled ? 'enabled' : 'disabled'} · ${asset.target}`}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))
                : (
                    <Item variant="default">
                      <ItemContent>
                        <ItemTitle>No overlay projections yet</ItemTitle>
                        <ItemDescription>Create a worker overlay asset before checking projection receipts.</ItemDescription>
                      </ItemContent>
                    </Item>
                  )}
            </ItemGroup>
            </ScrollArea>
          </TabsContent>
        </Tabs>
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

function formatValidation(errors: string[]): string {
  return errors.length > 0 ? errors.map(error => `- ${error}`).join('\n') : 'Overlay asset is valid.'
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
  if (/(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s]+/i.test(asset.content) || /sk-[a-z0-9]/i.test(asset.content))
    errors.push('Content appears to contain a literal secret. Use a secret reference instead.')
  return errors
}
