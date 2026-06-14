import type { ReactNode } from 'react'
import type { TranscriptItemModel, TranscriptTurnModel } from './transcript-types'

import { Button } from '#components/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#components/empty'
import { Item, ItemContent, ItemDescription, ItemGroup } from '#components/item'
import { Skeleton } from '#components/skeleton'
import { cn } from '#lib/utils'

import { ArtifactStrip } from './artifact-strip'
import { AssistantMarkdown } from './assistant-markdown'
import { CommandBlock } from './command-block'
import { ResourceCard } from './resource-card'
import { StreamingPlaceholder } from './streaming-placeholder'
import { TranscriptActivityGroup } from './transcript-activity-group'
import { summarizeTranscriptTurn } from './transcript-types'
import { TurnActionRail } from './turn-action-rail'

export interface ChatThreadProps {
  ariaLabel: string
  className?: string
  emptyState?: ReactNode
  loading?: boolean
  loadingLabel?: ReactNode
  onTurnCollapsedChange?: (turnId: string, collapsed: boolean) => void
  preparingResponseLabel?: string
  turns: TranscriptTurnModel[]
}

export function ChatThread({
  ariaLabel,
  className,
  emptyState,
  loading = false,
  loadingLabel = 'Loading transcript',
  onTurnCollapsedChange,
  preparingResponseLabel = 'Preparing response',
  turns,
}: ChatThreadProps) {
  const showCompanion = turns.length === 0

  return (
    <div
      data-transcript-slot="chat-thread"
      className={cn('mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4', className)}
    >
      <ItemGroup
        data-transcript-slot="chat-thread-log"
        role="log"
        aria-label={ariaLabel}
        aria-busy={loading ? true : undefined}
        className="w-full min-w-0 gap-4"
      >
        {turns.map(turn => (
          <TranscriptTurn key={turn.id} onCollapsedChange={onTurnCollapsedChange} preparingResponseLabel={preparingResponseLabel} turn={turn} />
        ))}
      </ItemGroup>
      {showCompanion
        ? (
            <div data-transcript-slot="chat-thread-empty" className="min-h-48 w-full min-w-0">
              {loading
                ? <TranscriptLoadingState label={loadingLabel} />
                : emptyState ?? <DefaultChatThreadEmptyState />}
            </div>
          )
        : null}
    </div>
  )
}

export interface TranscriptTurnProps {
  onCollapsedChange?: (turnId: string, collapsed: boolean) => void
  preparingResponseLabel?: string
  turn: TranscriptTurnModel
}

export function TranscriptTurn({ onCollapsedChange, preparingResponseLabel = 'Preparing response', turn }: TranscriptTurnProps) {
  const summary = turn.summary ?? createDefaultTurnSummary(turn)
  const title = turn.title
  const turnKind = resolveTranscriptTurnKind(turn)
  const showHeader = Boolean(title || turn.meta || turn.collapsed || onCollapsedChange)

  return (
    <section
      data-transcript-slot="transcript-turn"
      data-transcript-turn-kind={turnKind}
      data-collapsed={turn.collapsed ? 'true' : undefined}
      className={cn(
        'flex min-w-0',
        turnKind === 'user' ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        data-transcript-slot="transcript-turn-shell"
        className={cn(
          'min-w-0',
          turnKind === 'user' ? 'ml-auto max-w-[min(42rem,85%)]' : 'w-full',
        )}
      >
        {showHeader
          ? (
              <header className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  {title ? <h3 className="truncate text-xs/relaxed font-medium">{title}</h3> : null}
                  {turn.collapsed ? <p className="truncate text-xs/relaxed text-muted-foreground">{summary}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {turn.meta ? <div className="text-xs text-muted-foreground">{turn.meta}</div> : null}
                  {onCollapsedChange
                    ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${turn.collapsed ? 'Expand' : 'Collapse'} turn ${stringifyNode(title ?? 'item')}`}
                          aria-expanded={!turn.collapsed}
                          onClick={() => onCollapsedChange(turn.id, !turn.collapsed)}
                        >
                          {turn.collapsed ? 'Expand' : 'Collapse'}
                        </Button>
                      )
                    : null}
                </div>
              </header>
            )
          : null}
        {turn.collapsed
          ? null
          : (
              <div
                data-transcript-slot="transcript-turn-detail"
                className={cn(
                  'grid min-w-0 gap-3',
                  turnKind === 'user' && 'justify-items-end',
                )}
              >
                {turn.items.map(item => <TranscriptItem key={item.id} item={item} preparingResponseLabel={preparingResponseLabel} />)}
              </div>
            )}
      </div>
    </section>
  )
}

function TranscriptItem({ item, preparingResponseLabel = 'Preparing response' }: { item: TranscriptItemModel, preparingResponseLabel?: string }) {
  if (item.kind === 'user-message') {
    return (
      <Item data-transcript-slot="user-message" variant="muted" className="min-w-0 rounded-lg bg-muted/70">
        <ItemContent>
          <ItemDescription className="max-w-full line-clamp-none text-foreground">{item.body}</ItemDescription>
        </ItemContent>
      </Item>
    )
  }

  if (item.kind === 'assistant-markdown') {
    return item.streaming && !item.markdown.trim()
      ? <StreamingPlaceholder label={preparingResponseLabel} />
      : <AssistantMarkdown markdown={item.markdown} streaming={item.streaming} />
  }

  if (item.kind === 'timeline-step')
    return <TimelineStepItem item={item} />

  if (item.kind === 'activity-group') {
    return (
      <TranscriptActivityGroup
        activities={item.activities}
        defaultCollapsed={item.defaultCollapsed}
        summary={item.summary}
      />
    )
  }

  if (item.kind === 'command') {
    return (
      <CommandBlock
        command={item.command}
        language={item.language}
        output={item.output}
        status={item.status}
        title={item.title}
      />
    )
  }

  if (item.kind === 'artifact-strip')
    return <ArtifactStrip artifacts={item.artifacts} />

  if (item.kind === 'resource-card')
    return <ResourceCard resource={item.resource} />

  if (item.kind === 'turn-action-rail')
    return <TurnActionRail actions={item.actions} />

  if (item.kind === 'status') {
    return (
      <Item
        data-transcript-slot="status-message"
        variant="muted"
        className={cn('min-w-0', item.tone === 'danger' && 'bg-destructive/5')}
      >
        <ItemContent>
          <ItemDescription
            tone={item.tone === 'danger' ? 'destructive' : 'default'}
            className="max-w-full line-clamp-none"
          >
            {item.body}
          </ItemDescription>
        </ItemContent>
      </Item>
    )
  }

  return (
    <div data-transcript-slot="custom-item" className="min-w-0">
      {item.node}
    </div>
  )
}

function TimelineStepItem({ item }: { item: Extract<TranscriptItemModel, { kind: 'timeline-step' }> }) {
  const optimistic = item.provenance === 'optimistic'

  return (
    <div
      data-transcript-slot="timeline-step"
      data-timeline-step-provenance={item.provenance}
      data-timeline-step-status={item.status}
      className={cn(
        'flex min-w-0 items-start gap-2 py-1 text-xs/relaxed text-muted-foreground',
        item.status === 'failed' && 'text-destructive',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/45',
          item.status === 'running' && 'animate-pulse bg-foreground/55',
          item.status === 'failed' && 'bg-destructive',
        )}
      />
      <div className="min-w-0">
        <p className="max-w-full text-xs/relaxed text-current">
          <span>{item.title}</span>
          {item.body
            ? (
                <span className="text-muted-foreground">
                  {' · '}
                  {item.body}
                </span>
              )
            : null}
        </p>
        {optimistic
          ? (
              <div className="mt-2 grid min-w-0 gap-1.5" aria-hidden="true">
                <Skeleton className="h-1.5 w-28" />
                <Skeleton className="h-1.5 w-36" />
              </div>
            )
          : null}
      </div>
    </div>
  )
}

function createDefaultTurnSummary(turn: TranscriptTurnModel): ReactNode {
  const summary = summarizeTranscriptTurn(turn)

  return `${summary.itemCount} items, ${summary.activityCount} activities, ${summary.artifactCount} artifacts, ${summary.resourceCount} resources`
}

function DefaultChatThreadEmptyState() {
  return (
    <Empty className="min-h-48 border-0 bg-transparent">
      <EmptyHeader>
        <EmptyTitle>Ready when you are</EmptyTitle>
        <EmptyDescription>This session has no messages yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function TranscriptLoadingState({ label }: { label: ReactNode }) {
  const statusLabel = typeof label === 'string' ? label : undefined

  return (
    <div
      data-transcript-slot="chat-thread-loading"
      role="status"
      aria-label={statusLabel}
      aria-live="polite"
      className="grid min-h-48 w-full min-w-0 content-center gap-3 py-4"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
      <p className="text-xs/relaxed text-muted-foreground">{label}</p>
    </div>
  )
}

function resolveTranscriptTurnKind(turn: TranscriptTurnModel): 'assistant' | 'mixed' | 'user' {
  const itemKinds = new Set(turn.items.map(item => item.kind))
  if (itemKinds.size === 1 && itemKinds.has('user-message'))
    return 'user'
  if (turn.items.some(item => item.kind === 'assistant-markdown'))
    return 'assistant'
  return 'mixed'
}

function stringifyNode(node: ReactNode): string {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : 'item'
}
