import type { FormEvent } from 'react'
import type { WorkerPath } from '@/worker/lib/link'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import {
  Brain as BrainIcon,
  ClipboardList,
  Cpu,
  FileSearch,
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
  { to: '/', label: 'Workbench', exact: true, icon: ClipboardList },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/cases', label: 'Reviews', icon: FileSearch },
  { to: '/config', label: '配置', icon: SlidersHorizontal },
  { to: '/test', label: '探测', icon: Wrench },
  { to: '/secrets', label: 'Secrets', icon: KeyRound },
  { to: '/brain', label: 'Brain', icon: BrainIcon },
  { to: '/cron', label: 'Cron', icon: Timer },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
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
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 bg-deep-green px-4 py-4 text-on-dark sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-8">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-micro uppercase text-on-dark/70">Worker</span>
        <code className="truncate font-mono text-sm font-medium">{workerId}</code>
      </div>
      <dl className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs md:col-span-1 md:col-start-2 md:row-start-1 md:justify-end">
        <Stat label="config v" value={String(configVersion)} />
        <Stat
          label="executor"
          value={executor ? `${executor.type}` : '—'}
          status={executor?.status}
        />
        <Stat label="brains" value={String(brainsCount)} />
        <Stat label="启动" value={info.data?.startedAt ? new Date(info.data.startedAt).toLocaleString() : '—'} />
      </dl>
    </section>
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
      ? 'text-pale-green'
      : status === 'down'
        ? 'text-coral-soft'
        : status === 'degraded'
          ? 'text-warning-soft'
          : 'text-on-dark/70'
  return (
    <div className="flex min-w-0 flex-col border-l border-on-dark/20 pl-3">
      <dt className="text-micro uppercase text-on-dark/70">{label}</dt>
      <dd className={`max-w-[11rem] truncate font-mono text-xs ${status ? statusClass : 'text-on-dark'}`}>{value}</dd>
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
      <div
        data-testid="worker-shell"
        className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
      >
        <header
          data-testid="worker-shell-header"
          className="grid shrink-0 gap-3 border-b border-hairline bg-background px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] md:items-center md:px-8"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-hairline bg-primary text-primary-foreground">
              <Cpu className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg leading-none text-foreground">AIWorker</p>
              <p className="text-micro text-muted-foreground">Worker</p>
            </div>
          </div>
          <nav
            data-testid="worker-shell-nav"
            className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-4 md:flex md:flex-wrap md:items-center md:justify-center"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <WorkerLink
                  key={item.to}
                  to={item.to}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-hairline hover:bg-soft-stone hover:text-foreground"
                  activeProps={{ className: '!border-primary !bg-primary !text-primary-foreground hover:!border-primary hover:!bg-primary hover:!text-primary-foreground' }}
                  activeOptions={item.exact ? { exact: true } : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </WorkerLink>
              )
            })}
          </nav>
          <div className="flex items-center justify-end">
            <ThemeToggle />
          </div>
        </header>
        <TopBar />
        <Separator />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
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
    <main className="flex min-h-screen w-full items-center justify-center bg-soft-stone px-4 py-8 text-foreground">
      <section className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-card-border bg-card p-6 shadow-popover sm:p-8">
        <header className="flex min-w-0 items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-hairline bg-soft-stone">
            <LockKeyhole className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-micro uppercase text-muted-foreground">Worker Admin</p>
            <h1 className="text-feature font-normal">需要 bearer token</h1>
          </div>
        </header>

        <p className="text-sm text-muted-foreground">
          使用当前 worker token 解锁本 tab。
        </p>

        <form className="flex flex-col gap-4" onSubmit={submit}>
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
          {error && <p role="alert" className="app-alert-error">{error}</p>}
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
