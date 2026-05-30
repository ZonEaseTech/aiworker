import {
  Add01Icon,
  File02Icon,
  RefreshIcon,
  Search01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Avatar, AvatarFallback } from '@zonease/aiworker-ui/components/avatar'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@zonease/aiworker-ui/components/input-group'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { displayCapability } from '../../features/i18n'
import { WorkerIdentityBlock, WorkspaceCard } from '../../features/local-workspace/components'
import { sessionForWorkspace } from '../../features/local-workspace/model'
import { StudioChromeHeader, StudioEmptyState, StudioTitleBlock } from '../components/studio-shell'

type WorkerIdentityBlockProps = Parameters<typeof WorkerIdentityBlock>[0]
type WorkspaceCardProps = Parameters<typeof WorkspaceCard>[0]
type LocalWorkspace = WorkspaceCardProps['item']
type WorkspaceCapability = NonNullable<WorkspaceCardProps['capability']>

interface WorkspaceFallbackData {
  capabilities: WorkspaceCapability[]
}

export function WorkspaceContextNoMountedSurface({
  copy,
  onOpenSettings,
  onRefresh,
  selectedSoulCopy,
  selectedWorkspace,
}: {
  copy: WorkerIdentityBlockProps['copy']
  onOpenSettings: () => void
  onRefresh: () => void
  selectedSoulCopy: WorkerIdentityBlockProps['soulCopy']
  selectedWorkspace: LocalWorkspace
}) {
  return (
    <>
      <StudioChromeHeader
        actions={(
          <>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </>
        )}
      >
        <StudioTitleBlock kicker={copy.workspace.currentWorkspace} title={selectedWorkspace.name} />
      </StudioChromeHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-7 py-10 max-md:p-4 max-md:pt-7">
        <StudioEmptyState
          icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
          title={copy.workspace.noMountedSurface}
          detail={copy.workspace.noMountedSurfaceDetail(selectedSoulCopy.name)}
        />
      </CardContent>
    </>
  )
}

export function WorkerHomeFallback({
  allSessions,
  copy,
  data,
  filteredWorkspaces,
  locale,
  onCreateWorkspace,
  onOpenSettings,
  onRefresh,
  onSearch,
  onSelectWorkspace,
  query,
  selectedSoul,
  selectedSoulCopy,
  selectedWorker,
  selectedWorkspace,
  capabilities,
}: {
  allSessions: Parameters<typeof sessionForWorkspace>[1]
  copy: WorkerIdentityBlockProps['copy']
  data: WorkspaceFallbackData
  filteredWorkspaces: LocalWorkspace[]
  locale: WorkspaceCardProps['locale']
  onCreateWorkspace: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  onSearch: (value: string) => void
  onSelectWorkspace: (workspace: LocalWorkspace) => void
  query: string
  selectedSoul: WorkerIdentityBlockProps['soul']
  selectedSoulCopy: WorkerIdentityBlockProps['soulCopy']
  selectedWorker: NonNullable<WorkerIdentityBlockProps['worker']>
  selectedWorkspace: LocalWorkspace | null
  capabilities: WorkspaceCapability[]
}) {
  return (
    <>
      <StudioChromeHeader
        actions={(
          <>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.workspace}>
              <Avatar size="sm" aria-hidden="true">
                <AvatarFallback>{workerInitials(selectedWorker.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </>
        )}
      >
        <StudioTitleBlock kicker={copy.workspace.currentWorker} title={copy.workspace.workspaceTitle(selectedWorker.name)} />
      </StudioChromeHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6 max-md:px-4">
        <ItemGroup className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
          <WorkerIdentityBlock
            compact
            copy={copy}
            locale={locale}
            soul={selectedSoul}
            soulCopy={selectedSoulCopy}
            worker={selectedWorker}
          />
          <Item variant="muted" size="sm" className="min-w-0 items-start">
            <ItemContent className="min-w-0 gap-3">
              <ItemTitle>{`${copy.create.capability} (${capabilities.length})`}</ItemTitle>
              <ItemActions className="min-w-0 flex-wrap justify-start gap-1.5">
                {capabilities.map(capability => (
                  <Badge key={capability.id} variant="outline" className="max-w-full truncate">
                    {displayCapability(capability, locale).name}
                  </Badge>
                ))}
              </ItemActions>
            </ItemContent>
          </Item>
        </ItemGroup>

        <ItemGroup className="min-h-0 gap-3">
          <ItemActions className="flex-wrap justify-between gap-x-2.5 gap-y-2">
            <ItemActions className="min-w-0 gap-2">
              <ItemTitle>{`${copy.workspace.workspaceList} (${filteredWorkspaces.length})`}</ItemTitle>
              <Button
                aria-label={copy.workspace.createWorkspace}
                size="icon"
                title={copy.workspace.createWorkspace}
                type="button"
                variant="ghost"
                onClick={onCreateWorkspace}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
            </ItemActions>

            <ItemActions className="min-w-0 flex-1 flex-wrap justify-end gap-2">
              {renderToolbarSearchInput({
                ariaLabel: copy.accessibility.searchProjects,
                onChange: onSearch,
                placeholder: copy.projects.searchPlaceholder,
                value: query,
              })}
            </ItemActions>
          </ItemActions>

          <ItemGroup className="grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredWorkspaces.length > 0
              ? filteredWorkspaces.map((item) => {
                  const session = sessionForWorkspace(item, allSessions)
                  return (
                    <WorkspaceCard
                      key={item.id}
                      active={selectedWorkspace?.id === item.id}
                      item={item}
                      locale={locale}
                      session={session}
                      capability={data.capabilities.find(capability => capability.id === session?.capabilityId)}
                      onSelect={() => onSelectWorkspace(item)}
                    />
                  )
                })
              : (
                  <StudioEmptyState
                    icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
                    title={copy.projects.empty.title}
                    detail={copy.projects.empty.detail(selectedSoulCopy.name)}
                    action={(
                      <Button type="button" variant="ghost" size="lg" onClick={onCreateWorkspace}>
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                        {copy.workspace.createWorkspace}
                      </Button>
                    )}
                  />
                )}
          </ItemGroup>
        </ItemGroup>
      </CardContent>
    </>
  )
}

function renderToolbarSearchInput({
  ariaLabel,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <InputGroup className="min-w-36 flex-1 basis-44 md:max-w-70">
      <InputGroupAddon>
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </InputGroup>
  )
}

function workerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1)
    return words.slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
  return Array.from(words[0] ?? 'AI').slice(0, 2).join('').toUpperCase()
}
