import type { AssignmentSummary } from '@/lib/admin-data'
import { PencilSimpleIcon } from '@phosphor-icons/react'

import { AssignmentFormContent } from '@/components/forms/metadata-form-content'
import {
  assignmentFormFromSummary,
  buildAssignmentPayload,
  emptyAssignmentForm,
  validateAssignmentForm,
} from '@/components/forms/metadata-form-helpers'
import { MetadataFormSheet, useMetadataForm } from '@/components/forms/metadata-form-sheet'
import { Button } from '@/components/ui/button'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export interface CreateAssignmentSheetProps {
  /** When provided, the sheet opens in edit mode, prefilled with this assignment's values. */
  editTarget?: AssignmentSummary
}

export function CreateAssignmentSheet({ editTarget }: CreateAssignmentSheetProps = {}) {
  const { createMetadata, data, isLive } = useAdminData()
  const isEdit = Boolean(editTarget)
  const { onOpenChange, setValues, sheet, submit, validationError, values } = useMetadataForm({
    buildPayload: buildAssignmentPayload,
    createMetadata,
    emptyForm: emptyAssignmentForm,
    endpoint: '/api/assignments',
    initialValues: editTarget ? assignmentFormFromSummary(editTarget) : emptyAssignmentForm,
    isEdit,
    validate: validateAssignmentForm,
  })

  return (
    <MetadataFormSheet
      title={isEdit ? `编辑员工开通 Assignment ${editTarget!.id}` : '新建员工开通 Assignment'}
      description={isEdit
        ? '编辑这条员工 Assignment：可更换设备 Environment、后台账号 Provider 或能力模板 Soul；Assignment ID 不变即按原记录更新。保存后该 Assignment 会回到草稿状态，需要重新走开通流程。字段写入后由 AIWorker CLI 代写到控制面。'
        : '为一名员工创建 Assignment：选择已有的设备 Environment、后台账号 Provider 和能力模板 Soul。字段写入后由 AIWorker CLI 代写到控制面。'}
      triggerLabel={isEdit ? `编辑开通 ${editTarget!.id}` : '新建开通'}
      submitLabel={isEdit ? '保存修改' : '保存开通'}
      trigger={isEdit
        ? (
            <Button size="sm" variant="ghost" aria-label={`编辑员工开通 ${editTarget!.id}`}>
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
