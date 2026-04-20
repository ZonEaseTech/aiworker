import type { AgentTask, ListTasksResponse, MessageDto, TaskDetailResponse, ToolCall } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ConversationReplayProps {
  conversationId: string
  onClose: () => void
}

const ROLE_VARIANT: Record<MessageDto['role'], 'secondary' | 'outline' | 'success' | 'warning'> = {
  system: 'outline',
  user: 'secondary',
  assistant: 'success',
  tool: 'warning',
}

interface FindTaskResult {
  task: AgentTask | null
  exhausted: boolean
}

const SCAN_PAGE_LIMIT = 200
const SCAN_MAX_PAGES = 10

async function findTaskByConversationId(conversationId: string): Promise<FindTaskResult> {
  let cursor: string | undefined
  for (let i = 0; i < SCAN_MAX_PAGES; i++) {
    const params = new URLSearchParams({ limit: String(SCAN_PAGE_LIMIT) })
    if (cursor)
      params.set('cursor', cursor)
    const page = await apiGet<ListTasksResponse>(`/api/orchestrator/tasks?${params}`)
    const match = page.tasks.find(t => t.conversationId === conversationId)
    if (match)
      return { task: match, exhausted: true }
    if (!page.nextCursor)
      return { task: null, exhausted: true }
    cursor = page.nextCursor
  }
  return { task: null, exhausted: false }
}

function ToolCallsBlock({ calls }: { calls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-left font-medium hover:underline"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {calls.length}
        {' '}
        tool call
        {calls.length === 1 ? '' : 's'}
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1.5 pl-4">
          {calls.map(c => (
            <li key={c.id} className="flex flex-col gap-1">
              <span className="font-mono">{c.name}</span>
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 font-mono text-[11px]">
                {JSON.stringify(c.arguments, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ConversationReplay({ conversationId, onClose }: ConversationReplayProps) {
  const taskQuery = useQuery({
    queryKey: ['orchestrator', 'task-by-conversation', conversationId],
    queryFn: () => findTaskByConversationId(conversationId),
  })

  const matchedTaskId = taskQuery.data?.task?.id
  const detailQuery = useQuery({
    queryKey: ['orchestrator', 'task-detail', matchedTaskId],
    queryFn: () => apiGet<TaskDetailResponse>(`/api/orchestrator/tasks/${matchedTaskId}`),
    enabled: !!matchedTaskId,
  })

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close panel"
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold">Conversation replay</h2>
            <code className="text-xs text-muted-foreground">{conversationId}</code>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {taskQuery.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {!taskQuery.isLoading && taskQuery.data && !taskQuery.data.task && (
            <p className="text-sm text-muted-foreground">
              {taskQuery.data.exhausted
                ? 'No orchestrator task is associated with this conversation.'
                : `No matching task in the most recent ${SCAN_MAX_PAGES * SCAN_PAGE_LIMIT} tasks. The task may be older — narrow by conversationId via the orchestrator API.`}
            </p>
          )}
          {detailQuery.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {detailQuery.data && (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Prompt</div>
                <p className="whitespace-pre-wrap">{detailQuery.data.task.prompt}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {detailQuery.data.messages.map(m => (
                  <li
                    key={m.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border p-3',
                      m.role === 'assistant' && 'bg-emerald-500/5',
                      m.role === 'tool' && 'bg-amber-500/5',
                      m.role === 'user' && 'bg-sky-500/5',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={ROLE_VARIANT[m.role]} className="uppercase">
                        {m.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {m.content && (
                      <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                    )}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <ToolCallsBlock calls={m.toolCalls} />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
