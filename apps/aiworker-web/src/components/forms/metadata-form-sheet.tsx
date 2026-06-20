import type { AdminRemediation } from '@/lib/admin-remediation'
import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'

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
  triggerLabel,
}: MetadataFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm" aria-label={triggerLabel}>
          <PlusIcon data-icon="inline-start" weight="duotone" />
          {triggerLabel}
        </Button>
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
