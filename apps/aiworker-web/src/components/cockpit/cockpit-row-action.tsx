import type { AssignmentSummary, CockpitRow } from '@/lib/admin-data'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { ArrowsClockwiseIcon, EyeIcon, PaperPlaneTiltIcon, PlayCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import {
  PlanPreviewControl,
  ProvisionCheckList,
  ProvisionGateSummary,
  useProvisionGate,
  warningsFullyAcknowledged,
} from '@/components/cockpit/provision-gate'
import { remediationFromCaughtError } from '@/components/forms/metadata-form-helpers'
import { RemediationAlert } from '@/components/remediation-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { tryGetSoulRelease } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

/**
 * 行内主操作，随 actionKind 变化：
 * - provision / retry → 打开开通门（plan 预览 + 4 项 check + warning 勾选确认 → provisionAssignment）
 * - pair → 发一次性入口（pairAssignment；入口只临时显示，不落库）
 * - view → 打开详情
 * - none → 开通中/准备中，禁用
 */
export function CockpitRowAction({ row, onView }: { row: CockpitRow, onView: (assignment: AssignmentSummary) => void }) {
  const { actionKind } = row

  if (actionKind === 'none') {
    return (
      <Button size="sm" variant="ghost" disabled aria-label={`${row.assignment.assignedEmail} 正在开通中`}>
        {row.statusLabel}
        …
      </Button>
    )
  }

  if (actionKind === 'view') {
    return (
      <Button size="sm" variant="ghost" onClick={() => onView(row.assignment)}>
        <EyeIcon data-icon="inline-start" weight="duotone" />
        查看
      </Button>
    )
  }

  if (actionKind === 'pair') {
    return <PairAction row={row} onView={onView} />
  }

  // provision | retry
  return <ProvisionAction row={row} />
}

function ProvisionAction({ row }: { row: CockpitRow }) {
  const { data, isLive, provisionAssignment } = useAdminData()
  const { assignment } = row
  const [open, setOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AdminRemediation | null>(null)

  const soul = tryGetSoulRelease(assignment.soulReleaseId, data)
  const gate = useProvisionGate({
    environment: assignment.environmentId,
    provider: assignment.providerProfileId,
    soul: soul?.descriptorRef ?? assignment.soulReleaseId,
    user: assignment.assignedEmail,
  })

  function toggleWarning(id: string, next: boolean) {
    setAcknowledged((current) => {
      const updated = new Set(current)
      if (next)
        updated.add(id)
      else
        updated.delete(id)
      return updated
    })
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setAcknowledged(new Set())
      setError(null)
      setSubmitting(false)
      gate.resetPreview()
    }
  }

  async function confirm() {
    setSubmitting(true)
    setError(null)
    try {
      await provisionAssignment(assignment.id)
      onOpenChange(false)
    }
    catch (caught) {
      setError(remediationFromCaughtError(caught))
    }
    finally {
      setSubmitting(false)
    }
  }

  const isRetry = row.actionKind === 'retry'
  const canConfirm = isLive
    && gate.previewReady
    && warningsFullyAcknowledged(row.gate, acknowledged)
    && !submitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        size="sm"
        variant={isRetry ? 'destructive' : 'default'}
        aria-label={`${isRetry ? '重试开通' : '开通'} ${assignment.assignedEmail}`}
        onClick={() => setOpen(true)}
      >
        {isRetry
          ? <ArrowsClockwiseIcon data-icon="inline-start" weight="duotone" />
          : <PlayCircleIcon data-icon="inline-start" weight="duotone" />}
        {isRetry ? '重试' : '开通'}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRetry ? '重试开通' : '开通'}</DialogTitle>
          <DialogDescription>
            {assignment.assignedEmail}
            {' · '}
            {row.soulDisplayName}
            {' '}
            → 先预览开通计划并确认下面的检查，再一键开通。审批已折叠进开通，操作人即审批人。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <PlanPreviewControl
            previewing={gate.previewing}
            previewReady={gate.previewReady}
            previewError={gate.previewError}
            disabled={!isLive}
            disabledReason={isLive ? undefined : '当前为演示模式，操作不会保存；请技术支持连接真实数据目录后再开通。'}
            onPreview={() => void gate.runPreview()}
          />
          <ProvisionCheckList
            checks={row.checks}
            acknowledgedWarnings={acknowledged}
            onToggleWarning={toggleWarning}
          />
          <ProvisionGateSummary gate={row.gate} acknowledgedWarnings={acknowledged} />
          {isRetry && !row.gate.blocked
            ? (
                <p className="rounded-md border bg-muted/20 p-2 text-[0.6875rem]/relaxed text-muted-foreground">
                  上次失败原因：
                  {' '}
                  {assignment.nextStep}
                </p>
              )
            : null}
          {row.gate.blocked ? <RemediationAlert remediation={adminRemediation('provider_auth_required')} /> : null}
          {error ? <RemediationAlert remediation={error} /> : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="outline">取消</Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={!canConfirm}
            aria-busy={submitting ? true : undefined}
            onClick={() => void confirm()}
          >
            {submitting ? '开通中…' : isRetry ? '确认并重试' : '确认并开通'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PairAction({ row, onView }: { row: CockpitRow, onView: (assignment: AssignmentSummary) => void }) {
  const { isLive, pairAssignment } = useAdminData()
  const { assignment } = row
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AdminRemediation | null>(null)
  const [pairingOutput, setPairingOutput] = useState<string | null>(null)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // 一次性入口只临时展示，关闭即丢弃，不落库、不缓存。
      setPairingOutput(null)
      setError(null)
      setSubmitting(false)
    }
  }

  async function sendPair() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await pairAssignment(assignment.id) as { pair?: { pairingOutput?: string } }
      setPairingOutput(result?.pair?.pairingOutput ?? '')
    }
    catch (caught) {
      setError(remediationFromCaughtError(caught))
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        size="sm"
        aria-label={`给 ${assignment.assignedEmail} 发送一次性入口`}
        onClick={() => setOpen(true)}
      >
        <PaperPlaneTiltIcon data-icon="inline-start" weight="duotone" />
        发入口
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送一次性入口</DialogTitle>
          <DialogDescription>
            {assignment.assignedEmail}
            {' '}
            的开通已就绪。生成的入口只在本弹窗临时显示，复制给员工后关闭即失效，不会保存。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Button
            size="sm"
            disabled={!isLive || submitting}
            aria-busy={submitting ? true : undefined}
            onClick={() => void sendPair()}
          >
            {submitting ? '生成入口中…' : pairingOutput !== null ? '重新生成入口' : '生成一次性入口'}
          </Button>
          {!isLive
            ? <p className="text-[0.6875rem]/relaxed text-muted-foreground">当前为演示模式，不会生成真实入口。</p>
            : null}
          {error ? <RemediationAlert remediation={error} /> : null}
          {pairingOutput
            ? (
                <pre className="overflow-x-auto rounded-md border bg-background p-3 text-[0.6875rem]/relaxed text-foreground">
                  {pairingOutput}
                </pre>
              )
            : null}
          <Button size="sm" variant="ghost" onClick={() => onView(assignment)}>
            <EyeIcon data-icon="inline-start" weight="duotone" />
            查看开通详情
          </Button>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="outline">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
