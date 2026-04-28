import { useQuery } from '@tanstack/react-query'
import { Activity, Clock, UserPlus } from 'lucide-react'
import { listAuditEvents } from '@/fleet/api'
import { usePresence, useRegisteredWorkers } from '@/fleet/features/workers/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

/**
 * Fleet presence dashboard：summary 卡片 + 心跳分布 + 今日 enrollment 数。
 *
 * - online 数：来自 `system.presence` 30s polling（fleet UI 通用 staleTime）；
 * - 心跳分布：基于 workers.list 的 `lastSeenAt`，统计「最近 5min / 1h / 1d」分桶；
 * - 今日 enrollment：用 `audit.list` 拉今日的
 *   `gateway.worker.paired` + `gateway.enrollment.approved` 数（粗估）。
 */
export function PresenceCard() {
  const presence = usePresence()
  const workers = useRegisteredWorkers()
  const todaysEnrollments = useTodaysEnrollments()

  const onlineCount = presence.data?.online.length ?? 0
  const totalCount = workers.data?.length ?? 0
  const offlineCount = Math.max(0, totalCount - onlineCount)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Presence</h1>
        <p className="text-sm text-muted-foreground">
          Live snapshot driven by
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">system.presence</code>
          {' '}
          (30s) and
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">workers.list</code>
          {' '}
          (10s).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="size-4" />
              Online workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {presence.isLoading
              ? <Skeleton className="h-8 w-16" />
              : (
                  <div className="text-3xl font-semibold">
                    {onlineCount}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      /
                      {' '}
                      {totalCount}
                    </span>
                  </div>
                )}
            <p className="mt-1 text-xs text-muted-foreground">
              {offlineCount}
              {' '}
              offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="size-4" />
              Heartbeat distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workers.isLoading
              ? <Skeleton className="h-16 w-full" />
              : <HeartbeatBuckets lastSeen={(workers.data ?? []).map(w => w.lastSeenAt)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserPlus className="size-4" />
              Enrollments today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaysEnrollments.isLoading
              ? <Skeleton className="h-8 w-16" />
              : (
                  <div className="text-3xl font-semibold">
                    {todaysEnrollments.data ?? 0}
                  </div>
                )}
            <p className="mt-1 text-xs text-muted-foreground">
              gateway.worker.paired + gateway.enrollment.approved since 00:00 local
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function HeartbeatBuckets({ lastSeen }: { lastSeen: Array<string | undefined> }) {
  const now = Date.now()
  const buckets = { recent: 0, hour: 0, day: 0, stale: 0, never: 0 }
  for (const iso of lastSeen) {
    if (!iso) {
      buckets.never += 1
      continue
    }
    const ts = Date.parse(iso)
    if (Number.isNaN(ts)) {
      buckets.never += 1
      continue
    }
    const ageMs = now - ts
    if (ageMs <= 5 * 60_000)
      buckets.recent += 1
    else if (ageMs <= 60 * 60_000)
      buckets.hour += 1
    else if (ageMs <= 24 * 60 * 60_000)
      buckets.day += 1
    else
      buckets.stale += 1
  }
  const rows: Array<{ label: string, count: number }> = [
    { label: '< 5 min', count: buckets.recent },
    { label: '< 1 hour', count: buckets.hour },
    { label: '< 1 day', count: buckets.day },
    { label: '> 1 day', count: buckets.stale },
    { label: 'never', count: buckets.never },
  ]
  const total = rows.reduce((acc, r) => acc + r.count, 0)
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono">{row.count}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: total === 0 ? '0' : `${(row.count / total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 用 audit.list 估算今日 enrollment 数。Drizzle 没有 `>=` over text ISO 的索引,
 * 这里在客户端按 `at` 起始字符串过滤；fleet 一天 enrollment 量不会大到拉穷举,
 * limit 200 已经足够覆盖正常工作量。
 */
function useTodaysEnrollments() {
  return useQuery({
    queryKey: ['fleet', 'presence', 'enrollments-today'],
    queryFn: async () => {
      const today = startOfTodayIso()
      const [paired, approved] = await Promise.all([
        listAuditEvents({ action: 'gateway.worker.paired', limit: 200 }),
        listAuditEvents({ action: 'gateway.enrollment.approved', limit: 200 }),
      ])
      const count = (events: Array<{ at: string }>) =>
        events.filter(e => e.at >= today).length
      return count(paired.events) + count(approved.events)
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
