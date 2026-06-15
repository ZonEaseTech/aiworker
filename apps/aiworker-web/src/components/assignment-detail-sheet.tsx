import type { AssignmentSummary } from '@/lib/admin-data'
import { StatusBadge } from '@/components/status-badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {

  getEnvironment,
  getProviderProfile,
  getSoulRelease,
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

  const environment = getEnvironment(assignment.environmentId)
  const provider = getProviderProfile(assignment.providerProfileId)
  const soul = getSoulRelease(assignment.soulReleaseId)
  const status = statusMeta[assignment.status]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{assignment.assignedEmail}</SheetTitle>
          <SheetDescription>
            Assignment metadata and redacted handoff. Paseo owns the workspace runtime after handoff.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <StatusBadge tone="outline">{assignment.team}</StatusBadge>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <Detail label="Soul release" value={`${soul.displayName} · ${soul.version}`} />
            <Detail label="Provider profile" value={`${provider.label} · ${provider.secretRef}`} />
            <Detail label="Environment" value={`${environment.id} · ${environment.isolation}`} />
            <Detail label="Target" value={environment.targetRef} />
            <Detail label="Workspace" value={assignment.workspaceRef} />
            <Detail label="Receipt" value={assignment.receiptId} />
          </dl>
          <Separator />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Handoff</h3>
            <p className="rounded-md border bg-muted/30 p-3 font-mono text-xs/relaxed text-foreground">
              {assignment.handoffLabel}
            </p>
            <p className="text-xs/relaxed text-muted-foreground">{assignment.nextStep}</p>
          </section>
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Audit trail</h3>
            <div className="flex flex-col gap-2">
              {assignment.audit.map(event => (
                <div key={event.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge tone={event.tone}>{event.at}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{event.actor}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-foreground">{event.action}</p>
                  <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{event.target}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Detail({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <dt className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-mono text-xs text-foreground">{value}</dd>
    </div>
  )
}
