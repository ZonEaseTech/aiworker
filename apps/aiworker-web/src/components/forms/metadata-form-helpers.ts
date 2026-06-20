import type {
  AssignmentSummary,
  PaseoEnvironmentSummary,
  ProviderProfileSummary,
  SoulReleaseSummary,
} from '@/lib/admin-data'
import type { AdminRemediation } from '@/lib/admin-remediation'
import { AdminApiError } from '@/lib/admin-api-client'
import { adminRemediation } from '@/lib/admin-remediation'

export interface CreateAssignmentFormValues {
  assignmentId: string
  environment: string
  provider: string
  soulReleaseRef: string
  user: string
}

export interface CreateEnvironmentFormValues {
  environment: string
  provider: string
  target: string
  user: string
}

export interface CreateProviderFormValues {
  baseUrl: string
  cliCommand: string
  model: string
  paseoProviderId: string
  provider: string
  providerKind: string
  secretRef: string
}

export interface RegisterSoulFormValues {
  soul: string
}

export const emptyAssignmentForm: CreateAssignmentFormValues = {
  assignmentId: '',
  environment: '',
  provider: '',
  soulReleaseRef: '',
  user: '',
}

export const emptyEnvironmentForm: CreateEnvironmentFormValues = {
  environment: '',
  provider: '',
  target: '',
  user: '',
}

export const emptyProviderForm: CreateProviderFormValues = {
  baseUrl: '',
  cliCommand: '',
  model: '',
  paseoProviderId: '',
  provider: '',
  providerKind: '',
  secretRef: '',
}

export const emptySoulForm: RegisterSoulFormValues = {
  soul: '',
}

/**
 * Prefill the environment form from an existing snapshot record.
 *
 * The control plane stores `providerProfileIds` as an array, while the create/edit
 * form only models a single `provider`. We prefill the first associated provider; a
 * multi-provider environment cannot fully round-trip through this form by construction.
 */
export function environmentFormFromSummary(environment: PaseoEnvironmentSummary): CreateEnvironmentFormValues {
  return {
    environment: environment.id,
    provider: environment.providerProfileIds[0] ?? '',
    target: environment.targetRef,
    user: environment.ownerEmail,
  }
}

export function providerFormFromSummary(provider: ProviderProfileSummary): CreateProviderFormValues {
  return {
    baseUrl: provider.baseUrl ?? '',
    cliCommand: provider.cliCommand ?? '',
    model: provider.model ?? '',
    paseoProviderId: provider.paseoProviderId ?? '',
    provider: provider.id,
    providerKind: provider.provider,
    secretRef: provider.secretRef,
  }
}

export function assignmentFormFromSummary(assignment: AssignmentSummary): CreateAssignmentFormValues {
  return {
    assignmentId: assignment.id,
    environment: assignment.environmentId,
    provider: assignment.providerProfileId,
    soulReleaseRef: assignment.soulReleaseId,
    user: assignment.assignedEmail,
  }
}

export const secretRefPrefix = 'secret://'

export function isValidSecretRef(value: string): boolean {
  return value.trim().startsWith(secretRefPrefix)
}

export function validateAssignmentForm(values: CreateAssignmentFormValues): string | null {
  if (!values.user.trim())
    return '请填写员工邮箱。'
  if (!values.environment.trim())
    return '请选择员工设备（Paseo environment）。'
  if (!values.provider.trim())
    return '请选择后台 AI 账号（Provider）。'
  if (!values.soulReleaseRef.trim())
    return '请选择能力模板（Soul）。'
  return null
}

export function validateEnvironmentForm(values: CreateEnvironmentFormValues): string | null {
  if (!values.environment.trim())
    return '请填写设备 ID（environment id）。'
  if (!values.user.trim())
    return '请填写负责人邮箱。'
  if (!values.target.trim())
    return '请填写设备连接地址（target）。'
  if (!values.provider.trim())
    return '请选择关联 Provider。'
  return null
}

export function validateProviderForm(values: CreateProviderFormValues): string | null {
  if (!values.provider.trim())
    return '请填写后台账号 ID（provider id）。'
  if (!values.providerKind.trim())
    return '请填写 Provider 类型（如 codex / claude）。'
  if (!values.secretRef.trim())
    return '请填写密钥引用（secret:// 引用，不是密钥本身）。'
  if (!isValidSecretRef(values.secretRef))
    return '密钥引用必须以 secret:// 开头；这里只接受引用，绝不要粘贴真实密钥。'
  return null
}

export function validateSoulForm(values: RegisterSoulFormValues): string | null {
  if (!values.soul.trim())
    return '请选择要登记的能力模板（Soul descriptor）。'
  return null
}

export function buildAssignmentPayload(values: CreateAssignmentFormValues) {
  return {
    ...(values.assignmentId.trim() ? { assignmentId: values.assignmentId.trim() } : {}),
    environment: values.environment.trim(),
    provider: values.provider.trim(),
    soulReleaseRef: values.soulReleaseRef.trim(),
    user: values.user.trim(),
  }
}

export function buildEnvironmentPayload(values: CreateEnvironmentFormValues) {
  return {
    environment: values.environment.trim(),
    provider: values.provider.trim(),
    target: values.target.trim(),
    user: values.user.trim(),
  }
}

export function buildProviderPayload(values: CreateProviderFormValues) {
  return {
    ...(values.baseUrl.trim() ? { baseUrl: values.baseUrl.trim() } : {}),
    ...(values.cliCommand.trim() ? { cliCommand: values.cliCommand.trim() } : {}),
    ...(values.model.trim() ? { model: values.model.trim() } : {}),
    ...(values.paseoProviderId.trim() ? { paseoProviderId: values.paseoProviderId.trim() } : {}),
    provider: values.provider.trim(),
    providerKind: values.providerKind.trim(),
    secretRef: values.secretRef.trim(),
  }
}

export function buildSoulPayload(values: RegisterSoulFormValues) {
  return {
    soul: values.soul.trim(),
  }
}

/**
 * Build the read-only `/api/plan` preview payload.
 *
 * `plan --soul` expects a built descriptor PATH (e.g. souls/x/dist/soul.descriptor.json),
 * not a release ref (e.g. x@1.0.0). The assignment form stores a release ref in
 * `soulReleaseRef`, so we resolve it back to the registered release's descriptorRef.
 */
export function buildPlanPreviewPayload(
  values: CreateAssignmentFormValues,
  soulReleases: SoulReleaseSummary[],
) {
  const release = soulReleases.find(item => item.id === values.soulReleaseRef.trim())
  return {
    environment: values.environment.trim(),
    provider: values.provider.trim(),
    soul: (release?.descriptorRef ?? values.soulReleaseRef).trim(),
    user: values.user.trim(),
  }
}

export function remediationFromCaughtError(error: unknown): AdminRemediation {
  if (error instanceof AdminApiError)
    return error.remediation
  return adminRemediation('unknown_admin_error')
}
