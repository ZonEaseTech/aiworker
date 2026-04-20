import type { AgentTask, ListTasksResponse } from './types'
import { useInfiniteQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'

const PAGE_SIZE = 50

interface TaskListProps {
  selectedId?: string
  onSelect: (taskId: string) => void
}

export function TaskList({ selectedId, onSelect }: TaskListProps) {
  const query = useInfiniteQuery({
    queryKey: ['orchestrator', 'tasks'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam)
        params.set('cursor', pageParam)
      return apiGet<ListTasksResponse>(`/api/orchestrator/tasks?${params}`)
    },
    getNextPageParam: last => last.nextCursor,
  })

  const tasks: AgentTask[] = query.data?.pages.flatMap(p => p.tasks) ?? []

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {['a', 'b', 'c', 'd', 'e'].map(k => (
          <Skeleton key={k} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm text-destructive">Failed to load tasks.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No tasks yet. Submit one above to get started.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {tasks.map(task => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onSelect(task.id)}
              className={cn(
                'flex w-full flex-col gap-1 border-b px-3 py-2 text-left transition-colors hover:bg-accent/60',
                selectedId === task.id && 'bg-accent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {task.id.slice(0, 8)}
                </span>
                <StatusBadge status={task.status} />
              </div>
              <p className="line-clamp-2 text-sm">
                {task.prompt.length > 80 ? `${task.prompt.slice(0, 80)}…` : task.prompt}
              </p>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="p-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            <ChevronDown className="size-4" />
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
