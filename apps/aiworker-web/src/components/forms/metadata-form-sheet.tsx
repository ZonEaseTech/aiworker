import type { AdminRemediation } from '@/lib/admin-remediation'
import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { remediationFromCaughtError } from '@/components/forms/metadata-form-helpers'
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

export interface MetadataFormSheetProps {
  children: React.ReactNode
  description: string
  disabledReason?: string
  onOpenChange?: (open: boolean) => void
  onSubmit: () => Promise<boolean> | boolean
  open: boolean
  remediation?: AdminRemediation | null
  submitDisabled?: boolean
  submitLabel: string
  submitting?: boolean
  title: string
  /**
   * Optional custom trigger (e.g. an inline "编辑" button). When omitted the default
   * "新建" create button is rendered. The edit and create flows share this same Sheet.
   */
  trigger?: React.ReactNode
  triggerLabel: string
}

export function MetadataFormSheet({
  children,
  description,
  disabledReason,
  onOpenChange,
  onSubmit,
  open,
  remediation,
  submitDisabled = false,
  submitLabel,
  submitting = false,
  title,
  trigger,
  triggerLabel,
}: MetadataFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" aria-label={triggerLabel}>
            <PlusIcon data-icon="inline-start" weight="duotone" />
            {triggerLabel}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6">
          {children}
          {remediation ? <RemediationAlert remediation={remediation} /> : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button size="sm" variant="outline" aria-label="取消并关闭表单">
              取消
            </Button>
          </SheetClose>
          <SubmitButton
            disabled={submitDisabled}
            disabledReason={disabledReason}
            label={submitLabel}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function SubmitButton({
  disabled,
  disabledReason,
  label,
  onSubmit,
  submitting,
}: {
  disabled: boolean
  disabledReason?: string
  label: string
  onSubmit: () => Promise<boolean> | boolean
  submitting: boolean
}) {
  const button = (
    <Button
      size="sm"
      disabled={disabled || submitting}
      aria-busy={submitting ? true : undefined}
      aria-label={submitting ? `${label}，处理中` : label}
      onClick={() => {
        void onSubmit()
      }}
    >
      {submitting ? '提交中…' : label}
    </Button>
  )

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={disabledReason}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}

export function useMetadataFormSheet() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [remediation, setRemediation] = useState<AdminRemediation | null>(null)

  return {
    open,
    remediation,
    reset() {
      setRemediation(null)
      setSubmitting(false)
    },
    setOpen,
    setRemediation,
    setSubmitting,
    submitting,
  }
}

export interface UseMetadataFormOptions<TValues> {
  emptyForm: TValues
  endpoint: string
  /** When true (edit mode) the form keeps its values after a successful save. */
  isEdit: boolean
  initialValues: TValues
  buildPayload: (values: TValues) => unknown
  createMetadata: (path: string, body: unknown) => Promise<unknown>
  validate: (values: TValues) => string | null
}

/**
 * Shared state + submit + open/close wiring for the create/edit metadata sheets.
 *
 * `onOpenChange` is intentionally recreated per render so it closes over the
 * latest `initialValues` (edit-mode prefill must not go stale).
 */
export function useMetadataForm<TValues>(options: UseMetadataFormOptions<TValues>) {
  const { buildPayload, createMetadata, emptyForm, endpoint, initialValues, isEdit, validate } = options
  const sheet = useMetadataFormSheet()
  const [values, setValues] = useState(initialValues)
  const [validationError, setValidationError] = useState<string | null>(null)

  async function submit(): Promise<boolean> {
    const error = validate(values)
    setValidationError(error)
    if (error)
      return false
    sheet.setSubmitting(true)
    sheet.setRemediation(null)
    try {
      await createMetadata(endpoint, buildPayload(values))
      if (!isEdit)
        setValues(emptyForm)
      sheet.setOpen(false)
      return true
    }
    catch (caught) {
      sheet.setRemediation(remediationFromCaughtError(caught))
      return false
    }
    finally {
      sheet.setSubmitting(false)
    }
  }

  function onOpenChange(next: boolean) {
    sheet.setOpen(next)
    if (next) {
      setValues(initialValues)
      setValidationError(null)
    }
    else {
      sheet.reset()
      setValidationError(null)
    }
  }

  return { onOpenChange, setValues, sheet, submit, validationError, values }
}
