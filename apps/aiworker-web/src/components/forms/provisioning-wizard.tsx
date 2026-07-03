import type { CreateAssignmentFormValues } from '@/components/forms/metadata-form-helpers'
import type { CockpitGate } from '@/lib/admin-data'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { CheckCircleIcon, CircleDashedIcon, PlusIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import {
  PlanPreviewControl,
  ProvisionCheckList,
  ProvisionGateSummary,
  useProvisionGate,
  warningsFullyAcknowledged,
} from '@/components/cockpit/provision-gate'
import { CreateEnvironmentSheet } from '@/components/forms/create-environment-sheet'
import { CreateProviderSheet } from '@/components/forms/create-provider-sheet'
import { AssignmentFormContent } from '@/components/forms/metadata-form-content'
import {
  buildAssignmentPayload,
  emptyAssignmentForm,
  remediationFromCaughtError,
  validateAssignmentForm,
} from '@/components/forms/metadata-form-helpers'
import { RegisterSoulSheet } from '@/components/forms/register-soul-sheet'
import { RemediationAlert } from '@/components/remediation-alert'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { tryGetSoulRelease } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

interface CreateAssignmentResult {
  assignment?: { assignmentId?: string }
}

export interface ProvisioningWizardProps {
  onAssignmentCreated?: (assignmentId: string) => void
}

/**
 * 单步 cockpit 新开通抽屉（设计 B4）。
 *
 * 乙路（复用）：挑员工 + 挑 Soul，机器/账号默认带出（smart defaults）→ 创建 assignment →
 * plan 预览 + 校验门 → 创建并开通。
 * 甲路（新员工）：同抽屉内内联建 Environment / Provider（用现有 create sheet 走 CLI 代写），
 * 再回到本抽屉选中它们继续。
 *
 * 折叠的是独立“审批”步骤，不是信息：创建后仍展示 plan 预览 + 4 项 check + warning 勾选确认，
 * “创建并开通”= create assignment（若需）→ provisionAssignment 合并动作。
 */
export function ProvisioningWizard({ onAssignmentCreated }: ProvisioningWizardProps) {
  const { createMetadata, data, isLive, provisionAssignment } = useAdminData()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<CreateAssignmentFormValues>(emptyAssignmentForm)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [remediation, setRemediation] = useState<AdminRemediation | null>(null)
  // 已创建的 assignment id（创建成功后进入开通门；甲路半态保留已建对象）。
  const [createdAssignmentId, setCreatedAssignmentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const createdAssignment = createdAssignmentId
    ? data.assignments.find(item => item.id === createdAssignmentId)
    : undefined
  const createdSoul = createdAssignment ? tryGetSoulRelease(createdAssignment.soulReleaseId, data) : undefined

  const gate = useProvisionGate({
    environment: createdAssignment?.environmentId ?? values.environment,
    provider: createdAssignment?.providerProfileId ?? values.provider,
    soul: createdSoul?.descriptorRef ?? createdAssignment?.soulReleaseId ?? values.soulReleaseRef,
    user: createdAssignment?.assignedEmail ?? values.user,
  })

  // 智能默认：env owner 跟随员工邮箱在 create-environment sheet 内处理；
  // provider 默认复用第一个 ready 的后台账号。
  const defaultProviderId = useMemo(
    () => data.providerProfiles.find(profile => profile.status === 'ready')?.id ?? data.providerProfiles[0]?.id ?? '',
    [data.providerProfiles],
  )

  function reset() {
    setValues(emptyAssignmentForm)
    setValidationError(null)
    setRemediation(null)
    setCreatedAssignmentId(null)
    setCreating(false)
    setProvisioning(false)
    setAcknowledged(new Set())
    gate.resetPreview()
  }

  function applyDefaults(next: CreateAssignmentFormValues): CreateAssignmentFormValues {
    if (!next.provider && defaultProviderId)
      return { ...next, provider: defaultProviderId }
    return next
  }

  async function createAssignment() {
    const error = validateAssignmentForm(values)
    setValidationError(error)
    if (error)
      return
    setCreating(true)
    setRemediation(null)
    try {
      const result = await createMetadata<CreateAssignmentResult>('/api/assignments', buildAssignmentPayload(values))
      const assignmentId = result.assignment?.assignmentId
      if (assignmentId) {
        setCreatedAssignmentId(assignmentId)
        onAssignmentCreated?.(assignmentId)
      }
    }
    catch (caught) {
      setRemediation(remediationFromCaughtError(caught))
    }
    finally {
      setCreating(false)
    }
  }

  // 门以 approval.checks 为准：createMetadata 已 reload，assignment 进快照后其 approval.checks 可用。
  const approval = createdAssignmentId
    ? data.approvals.find(item => item.assignmentId === createdAssignmentId)
    : undefined
  const effectiveChecks = approval?.checks ?? []
  const effectiveGate: CockpitGate = approval
    ? {
        blocked: effectiveChecks.some(check => check.status === 'blocked'),
        canProvision: !effectiveChecks.some(check => check.status === 'blocked'),
        blockingChecks: effectiveChecks.filter(check => check.status === 'blocked'),
        warningChecks: effectiveChecks.filter(check => check.status === 'warning'),
      }
    // fail-closed：assignment 已建但 approval 尚未在快照里（reload 未回或未来 approval 变稀疏）时，
    // 宁可禁止开通也不放行一个"零 check"的开通。校验门是承重安全机制，缺信息即拒绝。
    : { blocked: true, canProvision: false, blockingChecks: [], warningChecks: [] }

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

  async function provisionCreated() {
    if (!createdAssignmentId)
      return
    setProvisioning(true)
    setRemediation(null)
    try {
      await provisionAssignment(createdAssignmentId)
      reset()
      setOpen(false)
    }
    catch (caught) {
      setRemediation(remediationFromCaughtError(caught))
    }
    finally {
      setProvisioning(false)
    }
  }

  const submitDisabled = !isLive
  const disabledReason = isLive
    ? undefined
    : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再开通。'

  const canProvision = isLive
    && gate.previewReady
    && warningsFullyAcknowledged(effectiveGate, acknowledged)
    && !provisioning

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next)
          reset()
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" aria-label="给员工新开通 AIWorker">
          <PlusIcon data-icon="inline-start" weight="bold" />
          新开通
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>新开通</SheetTitle>
          <SheetDescription>
            给一位员工在一台目标机上开通 AIWorker。乙路（复用）：挑员工 + 挑能力 Soul，机器 Environment 和账号 Provider 智能带出。
            甲路（新员工）：在下面内联创建缺失的机器或账号。审批已折叠进开通，无需单独确认步骤。
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6">
          {createdAssignment
            ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-sm font-medium">开通对象已就绪</p>
                    <p className="mt-1 text-xs/relaxed text-muted-foreground">
                      {createdAssignment.assignedEmail}
                      {' · '}
                      {createdSoul?.displayName ?? createdAssignment.soulReleaseId}
                    </p>
                  </div>
                  <PlanPreviewControl
                    previewing={gate.previewing}
                    previewReady={gate.previewReady}
                    previewError={gate.previewError}
                    disabled={submitDisabled}
                    disabledReason={disabledReason}
                    onPreview={() => void gate.runPreview()}
                  />
                  {effectiveChecks.length
                    ? (
                        <ProvisionCheckList
                          checks={effectiveChecks}
                          acknowledgedWarnings={acknowledged}
                          onToggleWarning={toggleWarning}
                        />
                      )
                    : null}
                  <ProvisionGateSummary gate={effectiveGate} acknowledgedWarnings={acknowledged} />
                  {remediation ? <RemediationAlert remediation={remediation} /> : null}
                </div>
              )
            : (
                <>
                  <StepIndicator hasEnvironment={Boolean(values.environment)} hasProvider={Boolean(values.provider)} />
                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
                    <span className="text-xs text-muted-foreground">缺机器或账号？就地创建：</span>
                    <CreateEnvironmentSheet />
                    <CreateProviderSheet />
                    <RegisterSoulSheet />
                  </div>
                  <AssignmentFormContent
                    environments={data.environments}
                    error={validationError}
                    onChange={next => setValues(applyDefaults(next))}
                    providers={data.providerProfiles}
                    souls={data.soulReleases}
                    values={values}
                  />
                  {remediation ? <RemediationAlert remediation={remediation} /> : null}
                </>
              )}
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button size="sm" variant="outline" aria-label="取消并关闭新开通抽屉">
              取消
            </Button>
          </SheetClose>
          {createdAssignment
            ? (
                <Button
                  size="sm"
                  disabled={!canProvision}
                  aria-busy={provisioning ? true : undefined}
                  aria-label={provisioning ? '开通中' : '创建并开通'}
                  onClick={() => void provisionCreated()}
                >
                  {provisioning ? '开通中…' : '创建并开通'}
                </Button>
              )
            : (
                <Button
                  size="sm"
                  disabled={submitDisabled || creating}
                  aria-busy={creating ? true : undefined}
                  aria-label={creating ? '准备开通对象中' : '下一步：准备开通'}
                  onClick={() => void createAssignment()}
                >
                  {creating ? '准备中…' : '下一步'}
                </Button>
              )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function StepIndicator({ hasEnvironment, hasProvider }: { hasEnvironment: boolean, hasProvider: boolean }) {
  const steps: Array<{ label: string, done: boolean }> = [
    { label: '目标机 Environment', done: hasEnvironment },
    { label: '后台账号 Provider', done: hasProvider },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map(step => (
        <span
          key={step.label}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] text-muted-foreground"
        >
          {step.done
            ? <CheckCircleIcon weight="fill" className="text-success" />
            : <CircleDashedIcon weight="duotone" />}
          {step.label}
          {step.done ? null : <StatusBadge tone="outline">待选</StatusBadge>}
        </span>
      ))}
    </div>
  )
}
