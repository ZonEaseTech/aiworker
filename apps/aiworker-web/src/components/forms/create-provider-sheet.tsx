import type { ProviderProfileSummary } from '@/lib/admin-data'
import { PencilSimpleIcon } from '@phosphor-icons/react'

import { ProviderFormContent } from '@/components/forms/metadata-form-content'
import {
  buildProviderPayload,
  emptyProviderForm,
  providerFormFromSummary,
  validateProviderForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataForm } from '@/components/forms/metadata-form-sheet'
import { Button } from '@/components/ui/button'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export interface CreateProviderSheetProps {
  /** When provided, the sheet opens in edit mode, prefilled with this provider's values. */
  editTarget?: ProviderProfileSummary
}

export function CreateProviderSheet({ editTarget }: CreateProviderSheetProps = {}) {
  const { createMetadata, isLive } = useAdminData()
  const isEdit = Boolean(editTarget)
  const { onOpenChange, setValues, sheet, submit, validationError, values } = useMetadataForm({
    buildPayload: buildProviderPayload,
    createMetadata,
    emptyForm: emptyProviderForm,
    endpoint: '/api/providers',
    initialValues: editTarget ? providerFormFromSummary(editTarget) : emptyProviderForm,
    isEdit,
    validate: validateProviderForm,
  })

  return (
    <MetadataFormSheet
      title={isEdit ? `编辑后台 AI 账号 Provider ${editTarget!.id}` : '新建后台 AI 账号 Provider'}
      description={isEdit
        ? '编辑这个后台 AI 账号（Provider）的登记信息；账号 ID 不变即按原记录更新。这里只保存密钥引用（secret:// 引用），绝不保存真实密钥。'
        : '登记一个后台 AI 账号（Provider）。这里只保存密钥引用（secret:// 引用），绝不保存真实密钥。'}
      triggerLabel={isEdit ? `编辑账号 ${editTarget!.id}` : '新建账号'}
      submitLabel={isEdit ? '保存修改' : '保存账号'}
      trigger={isEdit
        ? (
            <Button size="sm" variant="ghost" aria-label={`编辑后台 AI 账号 ${editTarget!.id}`}>
              <PencilSimpleIcon data-icon="inline-start" weight="duotone" />
              编辑
            </Button>
          )
        : undefined}
      open={sheet.open}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      submitting={sheet.submitting}
      submitDisabled={!isLive}
      disabledReason={isLive ? undefined : '当前为演示模式，操作不会保存。请技术支持连接真实数据目录后再保存。'}
      remediation={sheet.remediation ?? (isLive ? null : adminRemediation('control_plane_dir_required'))}
    >
      <ProviderFormContent error={validationError} onChange={setValues} values={values} />
    </MetadataFormSheet>
  )
}
