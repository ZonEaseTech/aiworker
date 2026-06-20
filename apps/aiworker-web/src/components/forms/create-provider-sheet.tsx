import { useState } from 'react'

import { ProviderFormContent } from '@/components/forms/metadata-form-content'
import {
  buildProviderPayload,
  emptyProviderForm,
  remediationFromCaughtError,
  validateProviderForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataFormSheet } from '@/components/forms/metadata-form-sheet'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function CreateProviderSheet() {
  const { createMetadata, isLive } = useAdminData()
  const sheet = useMetadataFormSheet()
  const [values, setValues] = useState(emptyProviderForm)
  const [validationError, setValidationError] = useState<string | null>(null)

  async function submit(): Promise<boolean> {
    const error = validateProviderForm(values)
    setValidationError(error)
    if (error)
      return false
    sheet.setSubmitting(true)
    sheet.setRemediation(null)
    try {
      await createMetadata('/api/providers', buildProviderPayload(values))
      setValues(emptyProviderForm)
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
      title="新建后台 AI 账号 Provider"
      description="登记一个后台 AI 账号（Provider）。这里只保存密钥引用（secret:// 引用），绝不保存真实密钥。"
      triggerLabel="新建账号"
      submitLabel="保存账号"
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
      <ProviderFormContent error={validationError} onChange={setValues} values={values} />
    </MetadataFormSheet>
  )
}
