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
        className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
      >
        <header
          data-testid="fleet-shell-header"
          className="grid shrink-0 gap-3 border-b border-hairline bg-background px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] md:items-center md:px-8"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-hairline bg-primary text-primary-foreground">
              <FileStack className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg leading-none text-foreground">AIWorker</p>
              <p className="text-micro text-muted-foreground">Fleet</p>
            </div>
          </div>
          <nav
            data-testid="fleet-shell-nav"
            className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-4 md:flex md:items-center md:justify-center"
          >
            {NAV_ITEMS.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-hairline hover:bg-soft-stone hover:text-foreground',
                )}
                activeProps={{ className: '!border-primary !bg-primary !text-primary-foreground hover:!border-primary hover:!bg-primary hover:!text-primary-foreground' }}
                activeOptions={{ exact: item.exact }}
              >
                <item.icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-end">
            <ThemeToggle />
          </div>
        </header>
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

export const Route = createRootRoute({
  component: RootLayout,
})
