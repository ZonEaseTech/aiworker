import type { PaseoEnvironmentSummary } from '@/lib/admin-data'
import { PencilSimpleIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { EnvironmentFormContent } from '@/components/forms/metadata-form-content'
import {
  buildEnvironmentPayload,
  emptyEnvironmentForm,
  environmentFormFromSummary,
  remediationFromCaughtError,
  validateEnvironmentForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataFormSheet } from '@/components/forms/metadata-form-sheet'
import { Button } from '@/components/ui/button'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export interface CreateEnvironmentSheetProps {
  /** When provided, the sheet opens in edit mode, prefilled with this environment's values. */
  editTarget?: PaseoEnvironmentSummary
}

export function CreateEnvironmentSheet({ editTarget }: CreateEnvironmentSheetProps = {}) {
  const { createMetadata, data, isLive } = useAdminData()
  const sheet = useMetadataFormSheet()
  const isEdit = Boolean(editTarget)
  const initialValues = editTarget ? environmentFormFromSummary(editTarget) : emptyEnvironmentForm
  const [values, setValues] = useState(initialValues)
  const [validationError, setValidationError] = useState<string | null>(null)

  async function submit(): Promise<boolean> {
    const error = validateEnvironmentForm(values)
    setValidationError(error)
    if (error)
      return false
    sheet.setSubmitting(true)
    sheet.setRemediation(null)
    try {
      await createMetadata('/api/environments', buildEnvironmentPayload(values))
      if (!isEdit)
        setValues(emptyEnvironmentForm)
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

  return (
    <MetadataFormSheet
      title={isEdit ? `编辑员工设备 Environment ${editTarget!.id}` : '新建员工设备 Environment'}
      description={isEdit
        ? '编辑这台员工设备（Paseo environment）的登记信息；设备 ID 不变即按原记录更新。字段写入后由 AIWorker CLI 代写到控制面。'
        : '登记一台员工设备（Paseo environment），供后续开通选择。字段写入后由 AIWorker CLI 代写到控制面。'}
      triggerLabel={isEdit ? `编辑设备 ${editTarget!.id}` : '新建设备'}
      submitLabel={isEdit ? '保存修改' : '保存设备'}
      trigger={isEdit
        ? (
            <Button size="sm" variant="ghost" aria-label={`编辑员工设备 ${editTarget!.id}`}>
              <PencilSimpleIcon data-icon="inline-start" weight="duotone" />
              编辑
            </Button>
          )
        : undefined}
      open={sheet.open}
      onOpenChange={(next) => {
        sheet.setOpen(next)
        if (next) {
          setValues(initialValues)
          setValidationError(null)
        }
        else {
          sheet.reset()
          setValidationError(null)
        }
      }}
      onSubmit={submit}
      submitting={sheet.submitting}
      submitDisabled={!isLive}
      disabledReason={isLive ? undefined : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再保存。'}
      remediation={sheet.remediation ?? (isLive ? null : adminRemediation('control_plane_dir_required'))}
    >
      <EnvironmentFormContent
        error={validationError}
        onChange={setValues}
        providers={data.providerProfiles}
        values={values}
      />
    </MetadataFormSheet>
  )
}
