import type { ReactNode } from 'react'
import type { TranscriptItemModel, TranscriptTurnModel } from './transcript-types'

import { Button } from '#components/button'
import { Item, ItemContent, ItemDescription, ItemGroup } from '#components/item'
import { cn } from '#lib/utils'

import { ArtifactStrip } from './artifact-strip'
import { AssistantMarkdown } from './assistant-markdown'
import { CommandBlock } from './command-block'
import { StreamingPlaceholder } from './streaming-placeholder'
import { TranscriptActivityGroup } from './transcript-activity-group'
import { summarizeTranscriptTurn } from './transcript-types'

export interface ChatThreadProps {
  ariaLabel: string
  className?: string
  onTurnCollapsedChange?: (turnId: string, collapsed: boolean) => void
  turns: TranscriptTurnModel[]
}

export function ChatThread({ ariaLabel, className, onTurnCollapsedChange, turns }: ChatThreadProps) {
  return (
    <ItemGroup
      data-transcript-slot="chat-thread"
      role="log"
      aria-label={ariaLabel}
      className={cn('min-w-0 gap-3', className)}
    >
      {turns.map(turn => (
        <TranscriptTurn key={turn.id} onCollapsedChange={onTurnCollapsedChange} turn={turn} />
      ))}
    </ItemGroup>
  )
}

export interface TranscriptTurnProps {
  onCollapsedChange?: (turnId: string, collapsed: boolean) => void
  turn: TranscriptTurnModel
}

export function TranscriptTurn({ onCollapsedChange, turn }: TranscriptTurnProps) {
  const summary = turn.summary ?? createDefaultTurnSummary(turn)
  const title = turn.title ?? 'Turn'

  return (
    <section
      data-transcript-slot="transcript-turn"
      data-collapsed={turn.collapsed ? 'true' : undefined}
      className="min-w-0 rounded-md border border-border bg-background"
    >
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs/relaxed font-medium">{title}</h3>
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
                  aria-label={`${turn.collapsed ? 'Expand' : 'Collapse'} turn ${stringifyNode(title)}`}
                  aria-expanded={!turn.collapsed}
                  onClick={() => onCollapsedChange(turn.id, !turn.collapsed)}
                >
                  {turn.collapsed ? 'Expand' : 'Collapse'}
                </Button>
              )
            : null}
        </div>
      </header>
      {turn.collapsed
        ? null
        : (
            <div data-transcript-slot="transcript-turn-detail" className="grid min-w-0 gap-3 p-3">
              {turn.items.map(item => <TranscriptItem key={item.id} item={item} />)}
            </div>
          )}
    </section>
  )
}

function TranscriptItem({ item }: { item: TranscriptItemModel }) {
  if (item.kind === 'user-message') {
    return (
      <Item data-transcript-slot="user-message" variant="muted" className="min-w-0">
        <ItemContent>
          <ItemDescription className="max-w-full line-clamp-none text-foreground">{item.body}</ItemDescription>
        </ItemContent>
      </Item>
    )
  }

  if (item.kind === 'assistant-markdown') {
    return item.streaming && !item.markdown.trim()
      ? <StreamingPlaceholder label="Preparing response" />
      : <AssistantMarkdown markdown={item.markdown} streaming={item.streaming} />
  }

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

function createDefaultTurnSummary(turn: TranscriptTurnModel): ReactNode {
  const summary = summarizeTranscriptTurn(turn)

  return `${summary.itemCount} items, ${summary.activityCount} activities, ${summary.artifactCount} artifacts`
}

function stringifyNode(node: ReactNode): string {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : 'item'
}
