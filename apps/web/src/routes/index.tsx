import type {
  ConflictsListResponse,
  ExecutionStatsResponse,
  HealthResponse,
  MemoriesListResponse,
  SkillsListResponse,
} from '@/features/dashboard/types'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, AlertTriangle, Brain, Sparkles } from 'lucide-react'
import { ActivityFeed } from '@/features/dashboard/ActivityFeed'
import { KpiCard } from '@/features/dashboard/KpiCard'
import { ServiceStatusCard } from '@/features/dashboard/ServiceStatusCard'
import { apiGet } from '@/lib/api'

function DashboardPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    refetchInterval: 30_000,
  })

  const skills = useQuery({
    queryKey: ['skills', 'list'],
    queryFn: () => apiGet<SkillsListResponse>('/api/skills'),
  })

  const memories = useQuery({
    queryKey: ['memories', 'list'],
    queryFn: () => apiGet<MemoriesListResponse>('/api/memories'),
  })

  const stats = useQuery({
    queryKey: ['executions', 'stats'],
    queryFn: () => apiGet<ExecutionStatsResponse>('/api/execution/stats'),
  })

  const conflicts = useQuery({
    queryKey: ['skills', 'conflicts'],
    queryFn: () => apiGet<ConflictsListResponse>('/api/skills/conflicts'),
  })

  const pendingConflicts = conflicts.data?.conflicts.filter(c => c.resolution === 'pending').length ?? conflicts.data?.total
  const avgDuration = stats.data?.averageDurationMs

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live overview of Brain and Executor integration.</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <ServiceStatusCard
          name="Brain"
          health={health.data?.services.brain}
          isLoading={health.isLoading}
          isFetching={health.isFetching}
          onCheck={() => health.refetch()}
        />
        <ServiceStatusCard
          name="Executor"
          health={health.data?.services.executor}
          isLoading={health.isLoading}
          isFetching={health.isFetching}
          onCheck={() => health.refetch()}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Skills"
              value={skills.data?.total}
              hint="Total registered"
              icon={Sparkles}
              isLoading={skills.isLoading}
            />
            <KpiCard
              title="Memories"
              value={memories.data?.total}
              hint="Stored entries"
              icon={Brain}
              isLoading={memories.isLoading}
            />
            <KpiCard
              title="Executions"
              value={stats.data?.total}
              hint={avgDuration != null ? `${Math.round(avgDuration)} ms avg` : undefined}
              icon={Activity}
              isLoading={stats.isLoading}
            />
            <KpiCard
              title="Pending conflicts"
              value={pendingConflicts}
              hint="Awaiting resolution"
              icon={AlertTriangle}
              isLoading={conflicts.isLoading}
              tone={pendingConflicts && pendingConflicts > 0 ? 'warning' : 'default'}
            />
          </div>
        </div>
        <div className="min-h-[420px] lg:col-span-1">
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: DashboardPage,
})
