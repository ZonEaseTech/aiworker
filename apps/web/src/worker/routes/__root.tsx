import type { FormEvent } from 'react'
import type { WorkerPath } from '@/worker/lib/link'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import {
  Brain as BrainIcon,
  ClipboardList,
  Cpu,
  KeyRound,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Separator } from '@/shared/components/ui/separator'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { getBearerToken, setBearerToken } from '@/worker/lib/auth'
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
  { to: '/brain', label: 'Brain', icon: BrainIcon },
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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-border bg-surface-ink px-4 py-3 text-primary-foreground sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold uppercase text-primary-foreground/70">Worker</span>
        <code className="truncate font-mono text-sm font-bold">{workerId}</code>
      </div>
      <div className="col-start-2 row-start-1 shrink-0 md:col-start-3">
        <ThemeToggle className="text-primary-foreground hover:text-primary-foreground" />
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
      ? 'text-success'
      : status === 'down'
        ? 'text-destructive'
        : status === 'degraded'
          ? 'text-warning'
          : 'text-primary-foreground/70'
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs font-bold uppercase text-primary-foreground/70">{label}</dt>
      <dd className={`max-w-[11rem] truncate font-mono ${status ? statusClass : 'text-primary-foreground'}`}>{value}</dd>
    </div>
  )
}

function RootLayout() {
  const [bearer, setBearer] = useState(() => getBearerToken())

  if (!bearer) {
    return (
      <WorkerAdminLocked
        onUnlock={(token) => {
          setBearerToken(token)
          setBearer(token)
        }}
      />
    )
  }

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
            className="flex min-w-0 w-full shrink-0 flex-col border-b border-border bg-surface-ink text-primary-foreground md:w-60 md:border-b-0 md:border-r"
          >
            <div className="flex items-center gap-2 px-5 py-4">
              <Cpu className="size-5 text-primary" />
              <span className="text-sm font-bold">AIWorker · Worker</span>
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
                    className="flex min-w-0 items-center gap-2 rounded-md border-b-2 border-l-0 border-transparent px-3 py-2 text-sm font-bold text-primary-foreground/70 transition-colors hover:border-primary hover:bg-surface-dark hover:text-primary-foreground md:border-b-0 md:border-l-2"
                    activeProps={{ className: 'border-primary bg-surface-dark text-primary-foreground' }}
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

function WorkerAdminLocked({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextToken = token.trim()
    if (!nextToken) {
      setError('请输入 bearer token。')
      return
    }
    setError(null)
    onUnlock(nextToken)
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="flex w-full max-w-md flex-col gap-5 rounded-md border bg-card p-5 shadow-sm">
        <header className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <LockKeyhole className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted-foreground">Worker Admin</p>
            <h1 className="text-xl font-bold">需要 bearer token</h1>
          </div>
        </header>

        <p className="text-sm text-muted-foreground">
          请使用
          {' '}
          <code className="font-mono text-xs">aiworker serve --open</code>
          {' '}
          打开的页面进入，或粘贴当前 worker token 解锁本 tab。
        </p>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="worker-admin-token">Bearer token</Label>
            <Input
              id="worker-admin-token"
              autoComplete="off"
              value={token}
              onChange={event => setToken(event.target.value)}
              type="password"
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit">
            <KeyRound aria-hidden="true" />
            解锁
          </Button>
        </form>
      </section>
    </main>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
