import type { MessageDTO, ToolCallDTO } from './types'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ROLE_STYLES: Record<MessageDTO['role'], { label: string, chip: string, border: string }> = {
  system: {
    label: 'System',
    chip: 'bg-muted text-muted-foreground',
    border: 'border-muted',
  },
  user: {
    label: 'User',
    chip: 'bg-primary/10 text-primary',
    border: 'border-primary/30',
  },
  assistant: {
    label: 'Assistant',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  tool: {
    label: 'Tool',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
}

interface ConversationReplayProps {
  messages: MessageDTO[]
  toolCalls: ToolCallDTO[]
}

export function ConversationReplay({ messages, toolCalls }: ConversationReplayProps) {
  if (messages.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Waiting for the first message...
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {messages.map(message => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ol>
      {toolCalls.length > 0 && <ToolCallsSummary toolCalls={toolCalls} />}
    </div>
  )
}

function MessageRow({ message }: { message: MessageDTO }) {
  const style = ROLE_STYLES[message.role]
  const [expanded, setExpanded] = useState(false)
  const hasToolCalls = message.role === 'assistant'
    && Array.isArray(message.toolCalls)
    && message.toolCalls.length > 0

  return (
    <div className={cn('rounded-md border bg-card px-3 py-2', style.border)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Badge className={cn('uppercase tracking-wide', style.chip)}>
          {style.label}
        </Badge>
        {message.toolCallId && (
          <span className="font-mono text-[10px] text-muted-foreground">
            response to
            {' '}
            {message.toolCallId.slice(0, 10)}
          </span>
        )}
      </div>
      {message.content && (
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </pre>
      )}
      {hasToolCalls && (
        <div className="mt-2 flex flex-col gap-1">
          <button
            type="button"
            className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Hide' : 'Show'}
            {' '}
            {message.toolCalls!.length}
            {' '}
            tool call
            {message.toolCalls!.length === 1 ? '' : 's'}
          </button>
          {expanded && (
            <ul className="flex flex-col gap-2">
              {message.toolCalls!.map(call => (
                <li key={call.id} className="rounded-md border bg-background p-2">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-semibold">{call.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {call.id.slice(0, 10)}
                    </span>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-sm bg-muted/40 p-2 text-xs">
                    {JSON.stringify(call.arguments, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallsSummary({ toolCalls }: { toolCalls: ToolCallDTO[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-sm font-semibold">
          Tool executions (
          {toolCalls.length}
          )
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 flex flex-col gap-2">
          {toolCalls.map(tc => (
            <li key={tc.id} className="rounded-md border bg-background p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-semibold">{tc.toolName}</span>
                <span className="font-mono text-muted-foreground">
                  #
                  {tc.id}
                </span>
                {tc.durationMs != null && (
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {tc.durationMs}
                    ms
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Params</div>
                  <pre className="max-h-40 overflow-auto rounded-sm bg-muted/40 p-2">
                    {JSON.stringify(tc.params ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Result</div>
                  <pre className="max-h-40 overflow-auto rounded-sm bg-muted/40 p-2">
                    {JSON.stringify(tc.result ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
