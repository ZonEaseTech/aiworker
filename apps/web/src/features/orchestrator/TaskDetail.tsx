import type { TaskDetailResponse } from './types'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { CancelButton } from './CancelButton'
import { ConversationReplay } from './ConversationReplay'
import { StatusBadge } from './StatusBadge'

interface TaskDetailProps {
  taskId: string
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const query = useQuery({
    queryKey: ['orchestrator', 'tasks', taskId],
    queryFn: () => apiGet<TaskDetailResponse>(`/api/orchestrator/tasks/${taskId}`),
  })

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (query.isError) {
    const err = query.error as unknown as { status?: number }
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm font-medium">
          {err?.status === 404 ? 'Task not found.' : 'Failed to load task.'}
        </p>
      </div>
    )
  }

  const detail = query.data!
  const { task, messages, toolCalls } = detail

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
          <StatusBadge status={task.status} />
          {task.status === 'running' && <CancelButton taskId={task.id} />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Created:
            {' '}
            {format(new Date(task.createdAt), 'yyyy-MM-dd HH:mm:ss')}
          </span>
          {task.finishedAt && (
            <span>
              Finished:
              {' '}
              {format(new Date(task.finishedAt), 'yyyy-MM-dd HH:mm:ss')}
            </span>
          )}
          {task.conversationId && (
            <span className="font-mono">
              conv:
              {task.conversationId.slice(0, 10)}
            </span>
          )}
        </div>
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
            Prompt
          </div>
          <p className="whitespace-pre-wrap text-sm">{task.prompt}</p>
        </div>
        {task.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <div className="text-xs font-semibold uppercase text-destructive">
                Error
              </div>
              <p className="whitespace-pre-wrap break-words">{task.error}</p>
            </div>
          </div>
        )}
      </header>
      <ConversationReplay messages={messages} toolCalls={toolCalls} />
    </div>
  )
}
