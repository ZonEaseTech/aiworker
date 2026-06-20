import type { CreateAssignmentFormValues } from '@/components/forms/metadata-form-helpers'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { useState } from 'react'

import { CreateEnvironmentSheet } from '@/components/forms/create-environment-sheet'
import { CreateProviderSheet } from '@/components/forms/create-provider-sheet'
import { AssignmentFormContent } from '@/components/forms/metadata-form-content'
import {
  buildAssignmentPayload,
  buildPlanPreviewPayload,
  emptyAssignmentForm,
  remediationFromCaughtError,
  validateAssignmentForm,
} from '@/components/forms/metadata-form-helpers'
import { RegisterSoulSheet } from '@/components/forms/register-soul-sheet'
import { RemediationAlert } from '@/components/remediation-alert'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { submitAdminMutation } from '@/lib/admin-api-client'
import { useAdminData } from '@/lib/admin-data-context'

interface PlanPreviewResult {
  plan?: unknown
}

interface CreateAssignmentResult {
  assignment?: { assignmentId?: string }
}

export interface ProvisioningWizardProps {
  onAssignmentCreated?: (assignmentId: string) => void
}

export function ProvisioningWizard({ onAssignmentCreated }: ProvisioningWizardProps) {
  const { createMetadata, data, isLive } = useAdminData()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<CreateAssignmentFormValues>(emptyAssignmentForm)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [remediation, setRemediation] = useState<AdminRemediation | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [creating, setCreating] = useState(false)

  function reset() {
    setValues(emptyAssignmentForm)
    setValidationError(null)
    setRemediation(null)
    setPreviewReady(false)
    setPreviewing(false)
    setCreating(false)
  }

  async function previewPlan() {
    const error = validateAssignmentForm(values)
    setValidationError(error)
    if (error)
      return
    setPreviewing(true)
    setRemediation(null)
    try {
      await submitAdminMutation<PlanPreviewResult>('/api/plan', buildPlanPreviewPayload(values, data.soulReleases))
      setPreviewReady(true)
    }
    catch (caught) {
      setPreviewReady(false)
      setRemediation(remediationFromCaughtError(caught))
    }
    finally {
      setPreviewing(false)
    }
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
      reset()
      setOpen(false)
      if (assignmentId)
        onAssignmentCreated?.(assignmentId)
    }
    catch (caught) {
      setRemediation(remediationFromCaughtError(caught))
    }
    finally {
      setCreating(false)
    }
  }

  const submitDisabled = !isLive
  const disabledReason = isLive
    ? undefined
    : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再开通。'

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
        <Button size="sm" aria-label="开通新员工，打开开通向导">
          开通新员工
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>开通新员工</SheetTitle>
          <SheetDescription>
            按步骤为新员工创建 Assignment：选择设备 Environment、后台账号 Provider、能力模板 Soul，预览 plan，再创建。创建后回到本页完成审批、apply 和 handoff。
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">缺少依赖可直接创建：</span>
            <CreateEnvironmentSheet />
            <CreateProviderSheet />
            <RegisterSoulSheet />
          </div>
          <AssignmentFormContent
            environments={data.environments}
            error={validationError}
            onChange={(next) => {
              setValues(next)
              setPreviewReady(false)
            }}
            providers={data.providerProfiles}
            souls={data.soulReleases}
            values={values}
          />
          <PreviewButton
            disabled={submitDisabled}
            disabledReason={disabledReason}
            previewing={previewing}
            previewReady={previewReady}
            onPreview={previewPlan}
          />
          {previewReady
            ? (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs/relaxed text-foreground">
                  Plan 预览成功，可以创建 Assignment。创建后会回到本页继续审批、apply 和 handoff。
                </p>
              )
            : null}
          {remediation ? <RemediationAlert remediation={remediation} /> : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button size="sm" variant="outline" aria-label="取消并关闭开通向导">
              取消
            </Button>
          </SheetClose>
          <CreateButton
            creating={creating}
            disabled={submitDisabled}
            disabledReason={disabledReason}
            onCreate={createAssignment}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PreviewButton({
  disabled,
  disabledReason,
  onPreview,
  previewReady,
  previewing,
}: {
  disabled: boolean
  disabledReason?: string
  onPreview: () => Promise<void>
  previewReady: boolean
  previewing: boolean
}) {
  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || previewing}
      aria-busy={previewing ? true : undefined}
      aria-label={previewing ? '预览 plan，处理中' : '预览 plan'}
      onClick={() => {
        void onPreview()
      }}
    >
      {previewing ? '预览中…' : previewReady ? '重新预览 plan' : '预览 plan'}
    </Button>
  )

  if (disabled && disabledReason)
    return wrapDisabledReason(button, disabledReason)
  return button
}

function CreateButton({
  creating,
  disabled,
  disabledReason,
  onCreate,
}: {
  creating: boolean
  disabled: boolean
  disabledReason?: string
  onCreate: () => Promise<void>
}) {
  const button = (
    <Button
      size="sm"
      disabled={disabled || creating}
      aria-busy={creating ? true : undefined}
      aria-label={creating ? '创建 Assignment，处理中' : '创建 Assignment'}
      onClick={() => {
        void onCreate()
      }}
    >
      {creating ? '创建中…' : '创建 Assignment'}
    </Button>
  )

  if (disabled && disabledReason)
    return wrapDisabledReason(button, disabledReason)
  return button
}

function wrapDisabledReason(button: React.ReactNode, reason: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={reason}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
