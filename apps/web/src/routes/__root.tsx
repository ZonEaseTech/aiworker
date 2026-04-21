import type { SafeRegisteredWorker } from '@aiworker/shared'
import { createRootRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Boxes, ChevronDown, FileStack, ServerOff } from 'lucide-react'
import { useMemo } from 'react'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useRegisteredWorkers } from '@/features/workers/hooks'
import { cn } from '@/lib/utils'

function WorkerSwitcher() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const query = useRegisteredWorkers()
  const matchedWorkerId = useMemo<string | null>(() => {
    const match = routerState.matches.find(m => m.routeId === '/workers/$workerId')
    if (!match)
      return null
    const params = match.params as { workerId?: string }
    return params.workerId ?? null
  }, [routerState.matches])
  const current: SafeRegisteredWorker | undefined = matchedWorkerId
    ? query.data?.find(w => w.id === matchedWorkerId)
    : undefined

  return (
    <div className="relative">
      <select
        aria-label="Switch worker"
        className={cn(
          'h-9 cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
        value={current?.id ?? ''}
        onChange={(e) => {
          const next = e.target.value
          if (next)
            void navigate({ to: '/workers/$workerId', params: { workerId: next } })
          else
            void navigate({ to: '/workers' })
        }}
      >
        <option value="">No worker selected</option>
        {(query.data ?? []).map(w => (
          <option key={w.id} value={w.id}>{w.displayName}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

function RootLayout() {
  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
          <div className="flex items-center gap-2 px-5 py-4">
            <FileStack className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">AIWorker</span>
          </div>
          <Separator />
          <nav className="flex flex-1 flex-col gap-1 p-3">
            <Link
              to="/workers"
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              )}
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
              activeOptions={{ exact: false }}
            >
              <Boxes className="size-4" />
              Workers
            </Link>
          </nav>
          <div className="px-3 pb-4 text-[11px] text-muted-foreground">
            <NoWorkersHint />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-background px-6">
            <span className="text-sm font-medium text-muted-foreground">
              Self-hosted Agent Runtime
            </span>
            <div className="flex items-center gap-2">
              <WorkerSwitcher />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function NoWorkersHint() {
  const query = useRegisteredWorkers()
  if (query.isLoading || (query.data && query.data.length > 0))
    return null
  return (
    <div className="flex items-start gap-2">
      <ServerOff className="mt-0.5 size-3.5 shrink-0" />
      <span>No workers registered. Register one from the Workers page.</span>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
