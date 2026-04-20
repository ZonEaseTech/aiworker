import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Activity, Bot, Database, FileStack, LayoutDashboard, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/skills', label: 'Skills', icon: Sparkles },
  { to: '/memory', label: 'Memory', icon: Database },
  { to: '/execution', label: 'Execution', icon: Activity },
  { to: '/orchestrator', label: 'Orchestrator', icon: Bot },
  { to: '/config', label: 'Config', icon: Settings },
  { to: '/sync', label: 'Sync', icon: RefreshCw },
] as const

function RootLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-5 py-4">
          <FileStack className="size-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">AIWorker</span>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              )}
              activeProps={{
                className: 'bg-accent text-accent-foreground font-medium',
              }}
              activeOptions={{ exact: item.to === '/' }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-6">
          <span className="text-sm font-medium text-muted-foreground">
            Middleware glue service
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Hermes: unknown</Badge>
            <Badge variant="outline">OpenClaw: unknown</Badge>
          </div>
        </header>
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
