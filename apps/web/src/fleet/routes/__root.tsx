import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Activity, Boxes, FileStack, FileText, Inbox } from 'lucide-react'
import { Separator } from '@/shared/components/ui/separator'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'

const NAV_ITEMS = [
  { to: '/workers', label: 'Workers', icon: Boxes, exact: false },
  { to: '/enroll', label: 'Enrollments', icon: Inbox, exact: false },
  { to: '/audit', label: 'Audit', icon: FileText, exact: false },
  { to: '/presence', label: 'Presence', icon: Activity, exact: false },
] as const

function RootLayout() {
  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
          <div className="flex items-center gap-2 px-5 py-4">
            <FileStack className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">
              AIWorker · Fleet
            </span>
          </div>
          <Separator />
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                )}
                activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
                activeOptions={{ exact: item.exact }}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-5 py-3 text-[11px] text-muted-foreground">
            Fleet UI talks to gateway via
            {' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">/ws</code>
            {' '}
            only — worker config / secrets / cron live in each worker&apos;s own
            <code className="rounded bg-muted px-1 py-0.5 font-mono">/admin/</code>
            .
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-background px-6">
            <span className="text-sm font-medium text-muted-foreground">
              Self-hosted Agent Runtime · fleet view
            </span>
          </header>
          <main className="flex-1 overflow-auto p-6">
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
