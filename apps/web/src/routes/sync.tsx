import type { ConflictListResponse, DiffResponse, RecentEventsResponse, SyncDirection, SyncEventDto, SyncResponse } from '@/features/sync/types'
import type { BusEvent } from '@/lib/hooks/useEventStream'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, GitBranch, Play } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SyncTimeline } from '@/features/sync/SyncTimeline'
import { apiGet, apiPost } from '@/lib/api'
import { useEventStream } from '@/lib/hooks/useEventStream'

const SYNC_EVENT_TYPES = new Set([
  'sync_started',
  'sync_completed',
  'sync_failed',
  'skill_updated',
])

function isSyncEventDto(payload: unknown): payload is SyncEventDto {
  return !!payload
    && typeof payload === 'object'
    && 'id' in (payload as object)
    && 'type' in (payload as object)
    && 'source' in (payload as object)
}

function SyncPage() {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<SyncDirection>('bidirectional')
  const [liveOverrides, setLiveOverrides] = useState<SyncEventDto[]>([])

  const diffQuery = useQuery({
    queryKey: ['skills', 'diff'],
    queryFn: () => apiGet<DiffResponse>('/api/skills/diff'),
    refetchInterval: 30_000,
  })

  const conflictsQuery = useQuery({
    queryKey: ['skills', 'conflicts'],
    queryFn: () => apiGet<ConflictListResponse>('/api/skills/conflicts'),
  })

  const recentQuery = useQuery({
    queryKey: ['events', 'recent'],
    queryFn: () => apiGet<RecentEventsResponse>('/api/events/recent?limit=50'),
  })

  const syncMutation = useMutation({
    mutationFn: (dir: SyncDirection) => apiPost<SyncResponse>('/api/skills/sync', { direction: dir }),
    onSuccess: (data) => {
      toast.success(`Sync ${data.status}`, { description: `Synced ${data.synced}, conflicts ${data.conflicts}` })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (err: unknown) => {
      toast.error('Sync failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    },
  })

  const handleEvent = useCallback((event: BusEvent) => {
    if (!SYNC_EVENT_TYPES.has(event.type))
      return
    if (isSyncEventDto(event.payload)) {
      const dto = event.payload
      setLiveOverrides(prev => [dto, ...prev.filter(e => e.id !== dto.id)].slice(0, 50))
    }
  }, [])

  useEventStream(handleEvent)

  const liveEvents = useMemo(() => {
    const base = recentQuery.data?.events ?? []
    const overrideIds = new Set(liveOverrides.map(e => e.id))
    return [...liveOverrides, ...base.filter(e => !overrideIds.has(e.id))].slice(0, 50)
  }, [recentQuery.data, liveOverrides])

  const counts = useMemo(() => {
    const entries = diffQuery.data?.diff ?? []
    let brain = 0
    let executor = 0
    for (const e of entries) {
      if (e.status === 'identical' || e.status === 'modified') {
        brain++
        executor++
      }
      else if (e.status === 'added-brain') {
        brain++
      }
      else if (e.status === 'added-executor') {
        executor++
      }
    }
    return { brain, executor }
  }, [diffQuery.data])

  const pendingConflicts = conflictsQuery.data?.conflicts.filter(c => c.resolution === 'pending').length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sync</h1>
        <div className="flex items-center gap-2">
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            value={direction}
            onChange={e => setDirection(e.target.value as SyncDirection)}
          >
            <option value="bidirectional">Bidirectional</option>
            <option value="brain-to-executor">Brain → Executor</option>
            <option value="executor-to-brain">Executor → Brain</option>
          </select>
          <Button
            size="sm"
            onClick={() => syncMutation.mutate(direction)}
            disabled={syncMutation.isPending}
          >
            <Play className="size-4" />
            {syncMutation.isPending ? 'Syncing...' : 'Run Sync Now'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Brain skills</CardTitle>
            <GitBranch className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {diffQuery.isLoading
              ? <Skeleton className="h-7 w-20" />
              : <div className="text-2xl font-semibold">{counts.brain}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Executor skills</CardTitle>
            <GitBranch className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {diffQuery.isLoading
              ? <Skeleton className="h-7 w-20" />
              : <div className="text-2xl font-semibold">{counts.executor}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending conflicts</CardTitle>
            <AlertTriangle className={pendingConflicts > 0 ? 'size-4 text-amber-500' : 'size-4 text-muted-foreground'} />
          </CardHeader>
          <CardContent>
            {conflictsQuery.isLoading
              ? <Skeleton className="h-7 w-20" />
              : <div className="text-2xl font-semibold">{pendingConflicts}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sync events</CardTitle>
        </CardHeader>
        <CardContent>
          {recentQuery.isLoading
            ? (
                <div className="flex flex-col gap-2">
                  {['a', 'b', 'c', 'd'].map(k => (
                    <Skeleton key={k} className="h-10 w-full" />
                  ))}
                </div>
              )
            : <SyncTimeline events={liveEvents} />}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/sync')({
  component: SyncPage,
})
