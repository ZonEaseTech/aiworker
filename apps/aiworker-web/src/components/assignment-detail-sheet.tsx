import type { AssignmentSummary } from '@/lib/admin-data'

import { StatusBadge } from '@/components/status-badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  approvalStatusMeta,
  getApprovalForAssignment,
  getEnvironment,
  getProviderProfile,
  getSoulRelease,
  getTraceEventsForAssignment,
  statusMeta,
} from '@/lib/admin-data'

export function AssignmentDetailSheet({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AssignmentSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!assignment) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{assignment.assignedEmail}</SheetTitle>
          <SheetDescription>
            查看这名员工是否已经能使用 AIWorker，以及管理员下一步要做什么。
          </SheetDescription>
        </SheetHeader>
        <AssignmentDetailContent assignment={assignment} />
      </SheetContent>
    </Sheet>
  )
}

export function AssignmentDetailContent({ assignment }: { assignment: AssignmentSummary }) {
  const environment = getEnvironment(assignment.environmentId)
  const provider = getProviderProfile(assignment.providerProfileId)
  const soul = getSoulRelease(assignment.soulReleaseId)
  const status = statusMeta[assignment.status]
  const approval = getApprovalForAssignment(assignment.id)
  const traceEvents = getTraceEventsForAssignment(assignment.id)

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <StatusBadge tone="outline">{assignment.team}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <Detail label="能力模板" value={`${soul.displayName} · ${soul.version}`} />
        <Detail label="后台 AI 账号" value={provider.label} />
        <Detail label="员工设备" value={environment.ownerEmail === assignment.assignedEmail ? '员工本人设备' : `${environment.ownerEmail} 代管设备`} />
        <Detail label="最近更新" value={assignment.updatedAt} />
      </dl>
      <Separator />
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">员工入口</h3>
        <p className="rounded-md border bg-muted/30 p-3 text-xs/relaxed text-foreground">
          {assignment.handoffLabel}
        </p>
        <p className="text-xs/relaxed text-muted-foreground">{assignment.nextStep}</p>
      </section>
      <Separator />
      {approval
        ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">管理员确认</h3>
                <StatusBadge tone={approvalStatusMeta[approval.status].tone}>{approvalStatusMeta[approval.status].label}</StatusBadge>
              </div>
              <p className="text-xs/relaxed text-muted-foreground">{approval.riskSummary}</p>
              <p className="text-[0.625rem] text-muted-foreground">
                {approval.controlApiState === 'persisted' ? '确认记录已保存。' : '当前为预览记录，正式连接管理数据后会保存。'}
              </p>
            </section>
          )
        : null}
      <Separator />
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">处理记录</h3>
        <div className="flex flex-col gap-2">
          {traceEvents.map(event => (
            <div key={event.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
                <span className="text-xs text-muted-foreground">{event.actor}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">{event.title}</p>
              <p className="mt-1 text-xs/relaxed text-muted-foreground">{event.detail}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{event.evidenceRef}</p>
              </details>
            </div>
          ))}
        </div>
      </section>
      <Separator />
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">开通操作</h3>
        <div className="flex flex-col gap-2">
          {assignment.audit.map(event => (
            <div key={event.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
                <span className="text-xs text-muted-foreground">{event.actor}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">{event.action}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{event.target}</p>
              </details>
            </div>
          ))}
        </div>
      </section>
      <Separator />
      <details className="rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">给技术支持查看的配置</summary>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <Detail label="能力版本" value={`${soul.displayName} · ${soul.version}`} technical />
          <Detail label="后台账号引用" value={`${provider.label} · ${provider.secretRef}`} technical />
          <Detail label="设备编号" value={`${environment.id} · ${environment.targetRef}`} technical />
          <Detail label="隔离方式" value={environment.isolation} technical />
          <Detail label="工作区路径" value={assignment.workspaceRef} technical />
          <Detail label="开通记录编号" value={assignment.receiptId} technical />
        </dl>
      </details>
    </div>
  )
}

function Detail({ label, technical = false, value }: { label: string, technical?: boolean, value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <dt className="text-[0.625rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-xs text-foreground ${technical ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
