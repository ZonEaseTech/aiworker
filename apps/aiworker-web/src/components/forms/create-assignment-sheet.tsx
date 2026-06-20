import { useState } from 'react'

import { AssignmentFormContent } from '@/components/forms/metadata-form-content'
import {
  buildAssignmentPayload,
  emptyAssignmentForm,
  remediationFromCaughtError,
  validateAssignmentForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataFormSheet } from '@/components/forms/metadata-form-sheet'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function CreateAssignmentSheet() {
  const { createMetadata, data, isLive } = useAdminData()
  const sheet = useMetadataFormSheet()
  const [values, setValues] = useState(emptyAssignmentForm)
  const [validationError, setValidationError] = useState<string | null>(null)

  async function submit(): Promise<boolean> {
    const error = validateAssignmentForm(values)
    setValidationError(error)
    if (error)
      return false
    sheet.setSubmitting(true)
    sheet.setRemediation(null)
    try {
      await createMetadata('/api/assignments', buildAssignmentPayload(values))
      setValues(emptyAssignmentForm)
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
      title="新建员工开通 Assignment"
      description="为一名员工创建 Assignment：选择已有的设备 Environment、后台账号 Provider 和能力模板 Soul。字段写入后由 AIWorker CLI 代写到控制面。"
      triggerLabel="新建开通"
      submitLabel="保存开通"
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
      <AssignmentFormContent
        environments={data.environments}
        error={validationError}
        onChange={setValues}
        providers={data.providerProfiles}
        souls={data.soulReleases}
        values={values}
      />
    </MetadataFormSheet>
  )
}
