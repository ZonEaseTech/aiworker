import type { SoulCatalogEntry } from '@/lib/admin-api-client'
import { useEffect, useState } from 'react'

import { SoulFormContent } from '@/components/forms/metadata-form-content'
import {
  buildSoulPayload,
  emptySoulForm,
  remediationFromCaughtError,
  validateSoulForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataFormSheet } from '@/components/forms/metadata-form-sheet'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function RegisterSoulSheet() {
  const { createMetadata, isLive, loadSoulCatalog } = useAdminData()
  const sheet = useMetadataFormSheet()
  const [values, setValues] = useState(emptySoulForm)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SoulCatalogEntry[]>([])

  useEffect(() => {
    if (!sheet.open)
      return
    let active = true
    void loadSoulCatalog()
      .then((entries) => {
        if (active)
          setCatalog(entries)
      })
      .catch(() => {
        if (active)
          setCatalog([])
      })
    return () => {
      active = false
    }
  }, [sheet.open, loadSoulCatalog])

  async function submit(): Promise<boolean> {
    const error = validateSoulForm(values)
    setValidationError(error)
    if (error)
      return false
    sheet.setSubmitting(true)
    sheet.setRemediation(null)
    try {
      await createMetadata('/api/soul-releases', buildSoulPayload(values))
      setValues(emptySoulForm)
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
      title="登记能力模板 Soul"
      description="把服务器上已构建的 Soul descriptor 登记成可分配的 Soul release。选项来自服务器扫描的 souls/*/dist，无需手填本机路径。"
      triggerLabel="登记模板"
      submitLabel="登记模板"
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
      disabledReason={isLive ? undefined : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再登记。'}
      remediation={sheet.remediation ?? (isLive ? null : adminRemediation('control_plane_dir_required'))}
    >
      <SoulFormContent catalog={catalog} error={validationError} onChange={setValues} values={values} />
    </MetadataFormSheet>
  )
}
