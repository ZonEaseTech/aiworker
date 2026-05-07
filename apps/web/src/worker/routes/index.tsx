import type { WorkerPath } from '@/worker/lib/link'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, Brain, Cpu, MessageSquare, ShieldCheck, Timer } from 'lucide-react'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useApprovals, useCronJobs, useWorkerHealth, useWorkerInfo } from '@/worker/lib/hooks'
import { WorkerLink } from '@/worker/lib/link'

function WorkerOverview() {
  const health = useWorkerHealth()
  const info = useWorkerInfo()
  const cron = useCronJobs()
  const approvals = useApprovals()

  return (
    <section className="app-page-narrow">
      <header className="app-page-header min-w-0">
        <h1 className="app-page-title">概览</h1>
        <p className="app-page-copy break-words">
          单 worker 自管面板。所有数据通道走当前入口的
          {' '}
          <code className="app-code">/api/worker/*</code>
          兼容管理 API。
        </p>
      </header>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Worker 健康"
          icon={Activity}
          loading={health.isLoading}
          error={health.error}
        >
          {health.data && (
            <ul className="space-y-1 text-sm">
              <Row label="status" value={health.data.status} />
              <Row label="config" value={`v${health.data.configVersion}`} />
              <Row
                label="brain"
                value={health.data.brain ? health.data.brain.status : 'unknown'}
              />
              <Row
                label="executor"
                value={health.data.executor ? health.data.executor.status : 'unknown'}
              />
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          title="Brain"
          icon={Brain}
          loading={info.isLoading}
          error={info.error}
          actionTo="/config"
          actionLabel="改配置"
        >
          {info.data && (
            <ul className="space-y-1 text-sm">
              {info.data.brains.length === 0
                ? <li className="text-muted-foreground">未配置 brain。</li>
                : info.data.brains.map(b => (
                    <li key={b.id} className="flex items-center justify-between">
                      <code className="font-mono text-xs">{b.id}</code>
                      <span className="text-xs text-muted-foreground">
                        {b.type}
                        {' · '}
                        {b.status}
                      </span>
                    </li>
                  ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          title="Executor"
          icon={Cpu}
          loading={info.isLoading}
          error={info.error}
          actionTo="/test"
          actionLabel="探测"
        >
          {info.data && (
            <ul className="space-y-1 text-sm">
              <Row label="type" value={info.data.executor.type} />
              {info.data.executor.model && <Row label="model" value={info.data.executor.model} />}
              <Row label="status" value={info.data.executor.status} />
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          title="Cron 调度"
          icon={Timer}
          loading={cron.isLoading}
          error={cron.error}
          actionTo="/cron"
          actionLabel="管理"
        >
          {cron.data && (
            <p className="text-sm text-muted-foreground">
              共
              {' '}
              <span className="font-medium text-foreground">{cron.data.jobs.length}</span>
              {' '}
              个；
              {' '}
              <span className="font-medium text-foreground">
                {cron.data.jobs.filter(j => j.enabled).length}
              </span>
              {' '}
              启用中。
            </p>
          )}
        </SummaryCard>

        <SummaryCard
          title="Approvals"
          icon={ShieldCheck}
          loading={approvals.isLoading}
          error={approvals.error}
          actionTo="/approvals"
          actionLabel={approvals.data?.approvals.length ? '处理' : '查看'}
        >
          {approvals.data && (
            <p className="text-sm">
              <span
                className={
                  approvals.data.approvals.length > 0
                    ? 'font-medium text-warning'
                    : 'text-muted-foreground'
                }
              >
                {approvals.data.approvals.length}
                {' '}
                pending
              </span>
            </p>
          )}
        </SummaryCard>

        <SummaryCard
          title="Chat"
          icon={MessageSquare}
          loading={false}
          actionTo="/chat"
          actionLabel="打开"
        >
          <p className="text-sm text-muted-foreground">
            发条消息给 worker，检查 orchestrator 端到端通路。
          </p>
        </SummaryCard>
      </div>
    </section>
  )
}

function SummaryCard({
  title,
  icon: Icon,
  loading,
  error,
  actionTo,
  actionLabel,
  children,
}: {
  title: string
  icon: typeof Activity
  loading: boolean
  error?: unknown
  actionTo?: WorkerPath
  actionLabel?: string
  children?: React.ReactNode
}) {
  return (
    <article className="app-panel flex min-w-0 flex-col gap-3">
      <header className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-feature font-normal">{title}</h3>
        </div>
        {actionTo && (
          <WorkerLink
            to={actionTo}
            className="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {actionLabel ?? '前往'}
          </WorkerLink>
        )}
      </header>
      {loading
        ? <Skeleton className="h-16" />
        : error
          ? <p className="text-xs text-destructive">{error instanceof Error ? error.message : '加载失败'}</p>
          : children}
    </article>
  )
}

function Row({ label, value }: { label: string, value: string }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 truncate font-mono text-xs">{value}</code>
    </li>
  )
}

export const Route = createFileRoute('/')({
  component: WorkerOverview,
})
