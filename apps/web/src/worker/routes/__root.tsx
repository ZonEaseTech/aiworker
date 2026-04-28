import type { WorkerPath } from '@/worker/lib/link'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import {
  ClipboardList,
  Cpu,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Wrench,
} from 'lucide-react'
import { Separator } from '@/shared/components/ui/separator'
import { useWorkerHealth, useWorkerInfo } from '@/worker/lib/hooks'
import { WorkerLink } from '@/worker/lib/link'

interface NavItem {
  to: WorkerPath
  label: string
  icon: typeof ClipboardList
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '概览', exact: true, icon: ClipboardList },
  { to: '/config', label: '配置', icon: SlidersHorizontal },
  { to: '/secrets', label: 'Secrets', icon: KeyRound },
  { to: '/test', label: '探测', icon: Wrench },
  { to: '/cron', label: 'Cron', icon: Timer },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
]

function TopBar() {
  const health = useWorkerHealth()
  const info = useWorkerInfo()

  // displayName fallback：worker 没有原生顶层 displayName，先用 workerId；
  // 若以后 buildInfo 引入 displayName 字段（FEAT-019 之外的扩展），把这里
  // 改为读对应字段即可。
  const workerId = health.data?.workerId ?? info.data?.workerId ?? '—'
  const configVersion = info.data?.configVersion ?? health.data?.configVersion ?? '—'
  const executor = info.data?.executor
  const brainsCount = info.data?.brains?.length ?? 0

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-3">
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Worker</span>
        <code className="font-mono text-sm font-semibold">{workerId}</code>
      </div>
      <dl className="flex flex-wrap items-center gap-4 text-xs">
        <Stat label="config v" value={String(configVersion)} />
        <Stat
          label="executor"
          value={executor ? `${executor.type}` : '—'}
          status={executor?.status}
        />
        <Stat label="brains" value={String(brainsCount)} />
        <Stat label="启动" value={info.data?.startedAt ? new Date(info.data.startedAt).toLocaleString() : '—'} />
      </dl>
    </header>
  )
}

function Stat({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status?: string
}) {
  const statusClass
    = status === 'healthy'
      ? 'text-emerald-700 dark:text-emerald-400'
      : status === 'down'
        ? 'text-destructive'
        : status === 'degraded'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-muted-foreground'
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-mono ${status ? statusClass : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}

function RootLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
          <div className="flex items-center gap-2 px-5 py-4">
            <Cpu className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">AIWorker · Worker</span>
          </div>
          <Separator />
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <WorkerLink
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
                  activeOptions={item.exact ? { exact: true } : undefined}
                >
                  <Icon className="size-4" />
                  {item.label}
                </WorkerLink>
              )
            })}
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
