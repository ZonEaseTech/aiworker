import { AuditCard } from '@/components/audit/audit-card'
import { DemoDataNotice } from '@/components/demo-data-notice'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { approvalStatusMeta, getApprovalForAssignment, getTraceEventsForAssignment, statusMeta } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

export function AuditPage() {
  const { data } = useAdminData()
  const isEmpty = data.recentAuditEvents.length === 0 && data.assignments.length === 0
  return (
    <div className="flex flex-col gap-6">
      <DemoDataNotice />
      <PageHeader
        eyebrow="记录"
        title="管理员操作记录"
        description="记录（audit + handoff）留存管理员开通、确认和发送入口的动作，方便追溯；不会展示员工对话、密钥或设备上的原始内容。"
      />
      {isEmpty
        ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>还没有操作记录</EmptyTitle>
                <EmptyDescription>
                  当你在操作台给员工开通、发入口或重试后，这里会自动留下可追溯的记录。先去操作台完成第一次开通。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <AuditCard />
        <Card>
          <CardHeader>
            <CardTitle>员工入口状态</CardTitle>
            <CardDescription>只判断员工入口是否已经可发送，不进入员工使用过程。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.assignments.map(assignment => (
              <div key={assignment.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{assignment.assignedEmail}</span>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={statusMeta[assignment.status].tone}>{statusMeta[assignment.status].label}</StatusBadge>
                    {getApprovalForAssignment(assignment.id, data)
                      ? (
                          <StatusBadge tone={approvalStatusMeta[getApprovalForAssignment(assignment.id, data)!.status].tone}>
                            {approvalStatusMeta[getApprovalForAssignment(assignment.id, data)!.status].label}
                          </StatusBadge>
                        )
                      : null}
                  </div>
                </div>
                <p className="mt-2 text-xs/relaxed text-muted-foreground">{assignment.handoffLabel}</p>
                <p className="mt-2 text-[0.625rem] text-muted-foreground">
                  处理记录：
                  {' '}
                  {getTraceEventsForAssignment(assignment.id, data).length}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                  <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">
                    开通记录编号：
                    {' '}
                    {assignment.receiptId}
                  </p>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
