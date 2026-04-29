import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Activity, Boxes, FileStack, FileText, Inbox } from 'lucide-react'
import { ThemeToggle } from '@/shared/components/theme-toggle'
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
      <div
        data-testid="fleet-shell"
        className="flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row"
      >
        <aside
          data-testid="fleet-shell-sidebar"
          className="flex min-w-0 w-full shrink-0 flex-col border-b border-border bg-surface-ink text-primary-foreground md:min-h-screen md:w-60 md:border-b-0 md:border-r"
        >
          <div className="flex items-center gap-2 px-5 py-4">
            <FileStack className="size-5 text-primary" />
            <span className="text-sm font-bold">
              AIWorker · Fleet
            </span>
          </div>
          <Separator />
          <nav
            data-testid="fleet-shell-nav"
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 p-2 sm:grid-cols-4 md:flex md:flex-1 md:flex-col md:p-3"
          >
            {NAV_ITEMS.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border-b-2 border-l-0 border-transparent px-3 py-2 text-sm font-bold text-primary-foreground/70 transition-colors hover:border-primary hover:bg-surface-dark hover:text-primary-foreground md:border-b-0 md:border-l-2',
                )}
                activeProps={{ className: 'border-primary bg-surface-dark text-primary-foreground' }}
                activeOptions={{ exact: item.exact }}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between gap-3 border-b bg-background px-4 md:h-14 md:px-6">
            <span className="min-w-0 truncate text-sm font-bold text-muted-foreground">
              Self-hosted Agent Runtime · fleet view
            </span>
            <ThemeToggle />
          </header>
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
