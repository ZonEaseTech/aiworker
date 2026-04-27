import { createFileRoute } from '@tanstack/react-router'

function WorkerOverview() {
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Worker 自助管理</h1>
        <p className="text-sm text-muted-foreground">
          Phase 1 骨架占位。完整的配置/对话/事件视图由 FEAT-035 接入。
        </p>
      </header>
    </section>
  )
}

export const Route = createFileRoute('/')({
  component: WorkerOverview,
})
