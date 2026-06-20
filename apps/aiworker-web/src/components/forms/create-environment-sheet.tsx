import { useState } from 'react'

import { EnvironmentFormContent } from '@/components/forms/metadata-form-content'
import {
  buildEnvironmentPayload,
  emptyEnvironmentForm,
  remediationFromCaughtError,
  validateEnvironmentForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataFormSheet } from '@/components/forms/metadata-form-sheet'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function CreateEnvironmentSheet() {
  const { createMetadata, data, isLive } = useAdminData()
  const sheet = useMetadataFormSheet()
  const [values, setValues] = useState(emptyEnvironmentForm)
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
      title="新建员工设备 Environment"
      description="登记一台员工设备（Paseo environment），供后续开通选择。字段写入后由 AIWorker CLI 代写到控制面。"
      triggerLabel="新建设备"
      submitLabel="保存设备"
      open={sheet.open}
      onOpenChange={(next) => {
        sheet.setOpen(next)
        if (!next) {
          sheet.reset()
          setValidationError(null)
        }
      }}
      onSubmit={submit}
      submitting={sheet.submitting}
      submitDisabled={!isLive}
      disabledReason={isLive ? undefined : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再创建。'}
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
