import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Cpu } from 'lucide-react'
import { Separator } from '@/shared/components/ui/separator'

function RootLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-5 py-4">
          <Cpu className="size-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">AIWorker · Worker</span>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
            activeOptions={{ exact: true }}
          >
            概览
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
