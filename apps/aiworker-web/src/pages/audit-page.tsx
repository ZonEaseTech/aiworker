import { AuditCard } from '@/components/audit/audit-card'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminConsoleData, approvalStatusMeta, getApprovalForAssignment, getTraceEventsForAssignment, statusMeta } from '@/lib/admin-data'

export function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="审计 / Handoff"
        title="交付证据与审计"
        description="展示 redacted receipt、状态迁移和 handoff references。不会展示 provider secret、shell script 全文或 Paseo session 内容。"
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <AuditCard />
        <Card>
          <CardHeader>
            <CardTitle>Handoff 就绪度</CardTitle>
            <CardDescription>ready 表示 AIWorker 准备好了 workspace 与 handoff，而不是读取运行时。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {adminConsoleData.assignments.map(assignment => (
              <div key={assignment.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{assignment.assignedEmail}</span>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={statusMeta[assignment.status].tone}>{statusMeta[assignment.status].label}</StatusBadge>
                    {getApprovalForAssignment(assignment.id)
                      ? (
                          <StatusBadge tone={approvalStatusMeta[getApprovalForAssignment(assignment.id)!.status].tone}>
                            {approvalStatusMeta[getApprovalForAssignment(assignment.id)!.status].label}
                          </StatusBadge>
                        )
                      : null}
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs/relaxed text-muted-foreground">{assignment.handoffLabel}</p>
                <p className="mt-2 text-[0.625rem] text-muted-foreground">
                  Trace 事件:
                  {' '}
                  {getTraceEventsForAssignment(assignment.id).length}
                  {' '}
                  · receipt
                  {' '}
                  {assignment.receiptId}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
