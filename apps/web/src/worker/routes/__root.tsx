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
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { Separator } from '@/shared/components/ui/separator'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b bg-card px-4 py-3 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Worker</span>
        <code className="truncate font-mono text-sm font-semibold">{workerId}</code>
      </div>
      <div className="col-start-2 row-start-1 shrink-0 md:col-start-3">
        <ThemeToggle />
      </div>
      <dl className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs md:col-span-1 md:col-start-2 md:row-start-1">
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
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`max-w-[11rem] truncate font-mono ${status ? statusClass : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}

function RootLayout() {
  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
        <TopBar />
        <div
          data-testid="worker-shell"
          className="flex min-w-0 flex-1 flex-col md:flex-row"
        >
          <aside
            data-testid="worker-shell-sidebar"
            className="flex min-w-0 w-full shrink-0 flex-col border-b bg-card md:w-60 md:border-b-0 md:border-r"
          >
            <div className="flex items-center gap-2 px-5 py-4">
              <Cpu className="size-5 text-primary" />
              <span className="text-sm font-semibold tracking-tight">AIWorker · Worker</span>
            </div>
            <Separator />
            <nav
              data-testid="worker-shell-nav"
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 p-2 sm:grid-cols-4 md:flex md:flex-1 md:flex-col md:p-3"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <WorkerLink
                    key={item.to}
                    to={item.to}
                    className="flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
                    activeOptions={item.exact ? { exact: true } : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </WorkerLink>
                )
              })}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
