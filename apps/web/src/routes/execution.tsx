import type { ExecutionListResponse, ExecutionStats, LiveExecutionEvent } from '@/features/execution/types'
import type { BusEvent } from '@/lib/hooks/useEventStream'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, Clock, RefreshCw, Zap } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConversationReplay } from '@/features/execution/ConversationReplay'
import { ExecutionTable } from '@/features/execution/ExecutionTable'
import { LiveFeed } from '@/features/execution/LiveFeed'
import { apiGet } from '@/lib/api'
import { useEventStream } from '@/lib/hooks/useEventStream'

const LIVE_MAX = 50

function normalizeLiveEvent(event: BusEvent): LiveExecutionEvent | null {
  if (event.type !== 'tool_call_end' && event.type !== 'tool_call_start')
    return null

  const payload = (event.payload ?? {}) as Record<string, unknown>
  const toolName = typeof payload.toolName === 'string' ? payload.toolName : ''
  const duration = typeof payload.duration === 'number' ? payload.duration : undefined
  let status: LiveExecutionEvent['status'] = 'unknown'
  if (event.type === 'tool_call_start')
    status = 'running'
  else if (payload.error)
    status = 'error'
  else status = 'success'

  return {
    id: `${event.timestamp}-${toolName}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: event.timestamp,
    type: event.type,
    toolName,
    duration,
    status,
    payload: event.payload,
  }
}

function ExecutionPage() {
  const [conversationFilter, setConversationFilter] = useState('')
  const [liveEvents, setLiveEvents] = useState<LiveExecutionEvent[]>([])
  const [replayId, setReplayId] = useState<string | null>(null)

  const statsQuery = useQuery({
    queryKey: ['executions', 'stats'],
    queryFn: () => apiGet<ExecutionStats>('/api/execution/stats'),
    refetchInterval: 15_000,
  })

  const listQuery = useQuery({
    queryKey: ['executions', 'list', conversationFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '25' })
      if (conversationFilter.trim())
        params.set('conversationId', conversationFilter.trim())
      return apiGet<ExecutionListResponse>(`/api/execution?${params}`)
    },
  })

  const handleEvent = useCallback((event: BusEvent) => {
    const normalized = normalizeLiveEvent(event)
    if (!normalized)
      return
    setLiveEvents(prev => [normalized, ...prev].slice(0, LIVE_MAX))
  }, [])

  useEventStream(handleEvent)

  const topTools = useMemo(() => {
    const byTool = statsQuery.data?.byTool ?? {}
    return Object.entries(byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }))
  }, [statsQuery.data])

  const avgDuration = statsQuery.data?.averageDurationMs

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Execution Monitor</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="Total executions"
          value={statsQuery.data?.total}
          icon={<Activity className="size-4 text-muted-foreground" />}
          isLoading={statsQuery.isLoading}
        />
        <StatCard
          title="Avg duration"
          value={avgDuration != null ? `${Math.round(avgDuration)} ms` : '—'}
          icon={<Clock className="size-4 text-muted-foreground" />}
          isLoading={statsQuery.isLoading}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top tools</CardTitle>
            <Zap className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading
              ? <Skeleton className="h-6 w-full" />
              : topTools.length === 0
                ? <p className="text-xs text-muted-foreground">No tools tracked yet.</p>
                : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {topTools.map(t => (
                        <li key={t.name} className="flex items-center justify-between">
                          <span className="truncate font-medium">{t.name}</span>
                          <span className="tabular-nums text-muted-foreground">{t.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 pb-3">
          <CardTitle className="text-base">Live feed</CardTitle>
          <span className="text-xs text-muted-foreground">
            (last
            {' '}
            {liveEvents.length}
            {' '}
            / cap
            {' '}
            {LIVE_MAX}
            )
          </span>
        </CardHeader>
        <CardContent>
          <LiveFeed events={liveEvents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Execution log</CardTitle>
            <p className="text-xs text-muted-foreground">Click "View" on a row with a conversation id to replay the agent transcript.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 w-64"
              placeholder="Filter by conversationId"
              value={conversationFilter}
              onChange={e => setConversationFilter(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                listQuery.refetch()
                statsQuery.refetch()
              }}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ExecutionTable
            executions={listQuery.data?.logs ?? []}
            isLoading={listQuery.isLoading}
            onReplay={setReplayId}
          />
        </CardContent>
      </Card>

      {replayId && (
        <ConversationReplay
          conversationId={replayId}
          onClose={() => setReplayId(null)}
        />
      )}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number | string | undefined
  icon: React.ReactNode
  isLoading: boolean
}

function StatCard({ title, value, icon, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-7 w-20" />
          : <div className="text-2xl font-semibold">{value ?? 0}</div>}
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/execution')({
  component: ExecutionPage,
})
