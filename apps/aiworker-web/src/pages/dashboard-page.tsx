import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminConsoleData } from '@/lib/admin-data'

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Manager overview"
        title="AIWorker 分发控制台"
        description="管理 Soul release、Paseo environment、provider profile 和 assignment handoff。员工侧工作区、session、日志与权限提示全部留在 Paseo。"
        actions={<StatusBadge tone="info">Bun + Vite</StatusBadge>}
      />
      <BoundaryAlert />
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {adminConsoleData.metrics.map(metric => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="mt-2 text-2xl">{metric.value}</CardTitle>
              </div>
              <StatusBadge tone={metric.tone}>
                <metric.icon weight="duotone" />
              </StatusBadge>
            </CardHeader>
            <CardContent>
              <p className="text-xs/relaxed text-muted-foreground">{metric.helper}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <AssignmentTableCard title="最近 assignments" assignments={adminConsoleData.assignments} />
        <AuditCard />
      </div>
    </div>
  )
}
