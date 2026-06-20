import type {
  CreateAssignmentFormValues,
  CreateEnvironmentFormValues,
  CreateProviderFormValues,
  RegisterSoulFormValues,
} from '@/components/forms/metadata-form-helpers'
import type { SoulCatalogEntry } from '@/lib/admin-api-client'
import type { PaseoEnvironmentSummary, ProviderProfileSummary, SoulReleaseSummary } from '@/lib/admin-data'

import { isValidSecretRef } from '@/components/forms/metadata-form-helpers'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface AssignmentFormContentProps {
  environments: PaseoEnvironmentSummary[]
  error: string | null
  onChange: (values: CreateAssignmentFormValues) => void
  providers: ProviderProfileSummary[]
  souls: SoulReleaseSummary[]
  values: CreateAssignmentFormValues
}

export function AssignmentFormContent({ environments, error, onChange, providers, souls, values }: AssignmentFormContentProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="assignment-user">员工邮箱</FieldLabel>
        <Input
          id="assignment-user"
          value={values.user}
          onChange={event => onChange({ ...values, user: event.target.value })}
          placeholder="alice@example.com"
          aria-label="员工邮箱"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="assignment-environment">员工设备 Environment</FieldLabel>
        <Select value={values.environment} onValueChange={value => onChange({ ...values, environment: value })}>
          <SelectTrigger id="assignment-environment" aria-label="选择员工设备 Environment">
            <SelectValue placeholder="选择已有的 Paseo environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {environments.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.id}
                  {' · '}
                  {item.ownerEmail}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>从已有 Paseo environment 中选择；缺少设备时先去“设备与账号”创建。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="assignment-provider">后台 AI 账号 Provider</FieldLabel>
        <Select value={values.provider} onValueChange={value => onChange({ ...values, provider: value })}>
          <SelectTrigger id="assignment-provider" aria-label="选择后台 AI 账号 Provider">
            <SelectValue placeholder="选择已有的 Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {providers.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.id}
                  {' · '}
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>从已有 Provider 中选择；缺少账号时先去“设备与账号”创建。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="assignment-soul">能力模板 Soul</FieldLabel>
        <Select value={values.soulReleaseRef} onValueChange={value => onChange({ ...values, soulReleaseRef: value })}>
          <SelectTrigger id="assignment-soul" aria-label="选择能力模板 Soul">
            <SelectValue placeholder="选择已登记的 Soul release" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {souls.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.displayName}
                  {' · '}
                  {item.version}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>从已登记的 Soul release 中选择；缺少模板时先去“能力模板”登记。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="assignment-id">Assignment ID（可选）</FieldLabel>
        <Input
          id="assignment-id"
          value={values.assignmentId}
          onChange={event => onChange({ ...values, assignmentId: event.target.value })}
          placeholder="留空将自动生成"
          aria-label="Assignment ID，可选"
        />
      </Field>
      <FieldError>{error}</FieldError>
    </FieldGroup>
  )
}

export interface EnvironmentFormContentProps {
  error: string | null
  onChange: (values: CreateEnvironmentFormValues) => void
  providers: ProviderProfileSummary[]
  values: CreateEnvironmentFormValues
}

export function EnvironmentFormContent({ error, onChange, providers, values }: EnvironmentFormContentProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="environment-id">设备 ID（environment id）</FieldLabel>
        <Input
          id="environment-id"
          value={values.environment}
          onChange={event => onChange({ ...values, environment: event.target.value })}
          placeholder="env-alice-prod-1"
          aria-label="设备 ID，environment id"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="environment-user">负责人邮箱</FieldLabel>
        <Input
          id="environment-user"
          value={values.user}
          onChange={event => onChange({ ...values, user: event.target.value })}
          placeholder="ops-admin@example.com"
          aria-label="设备负责人邮箱"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="environment-target">设备连接地址 target</FieldLabel>
        <Input
          id="environment-target"
          value={values.target}
          onChange={event => onChange({ ...values, target: event.target.value })}
          placeholder="aissh:prod-ops-1"
          aria-label="设备连接地址 target"
        />
        <FieldDescription>aissh / container 等连接引用，供技术支持在目标机器上定位 Paseo。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="environment-provider">关联 Provider</FieldLabel>
        <Select value={values.provider} onValueChange={value => onChange({ ...values, provider: value })}>
          <SelectTrigger id="environment-provider" aria-label="关联后台 AI 账号 Provider">
            <SelectValue placeholder="选择已有的 Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {providers.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.id}
                  {' · '}
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>开通时 CLI 要求设备绑定后台 AI 账号，请选择已有 Provider；缺少账号时先去“设备与账号”创建。</FieldDescription>
      </Field>
      <FieldError>{error}</FieldError>
    </FieldGroup>
  )
}

export interface ProviderFormContentProps {
  error: string | null
  onChange: (values: CreateProviderFormValues) => void
  values: CreateProviderFormValues
}

export function ProviderFormContent({ error, onChange, values }: ProviderFormContentProps) {
  const secretRefTouched = values.secretRef.trim().length > 0
  const secretRefInvalid = secretRefTouched && !isValidSecretRef(values.secretRef)

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="provider-id">后台账号 ID（provider id）</FieldLabel>
        <Input
          id="provider-id"
          value={values.provider}
          onChange={event => onChange({ ...values, provider: event.target.value })}
          placeholder="codex-default"
          aria-label="后台账号 ID，provider id"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-kind">Provider 类型</FieldLabel>
        <Input
          id="provider-kind"
          value={values.providerKind}
          onChange={event => onChange({ ...values, providerKind: event.target.value })}
          placeholder="codex / claude / opencode / acp"
          aria-label="Provider 类型"
        />
      </Field>
      <Field data-invalid={secretRefInvalid ? true : undefined}>
        <FieldLabel htmlFor="provider-secret-ref">密钥引用 secretRef</FieldLabel>
        <Input
          id="provider-secret-ref"
          value={values.secretRef}
          onChange={event => onChange({ ...values, secretRef: event.target.value })}
          placeholder="secret://providers/codex/default"
          aria-label="密钥引用，必须以 secret:// 开头，这里是引用不是密钥本身"
          aria-invalid={secretRefInvalid ? true : undefined}
        />
        <FieldDescription>这里填写的是密钥“引用”，不是密钥本身。必须以 secret:// 开头；AIWorker 只保存引用，绝不保存真实密钥。</FieldDescription>
        {secretRefInvalid ? <FieldError>密钥引用必须以 secret:// 开头；不要直接粘贴 API Key 或令牌。</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-cli">CLI 命令（可选）</FieldLabel>
        <Input
          id="provider-cli"
          value={values.cliCommand}
          onChange={event => onChange({ ...values, cliCommand: event.target.value })}
          placeholder="claude"
          aria-label="Provider CLI 命令，可选"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-paseo-id">Paseo Provider ID（可选）</FieldLabel>
        <Input
          id="provider-paseo-id"
          value={values.paseoProviderId}
          onChange={event => onChange({ ...values, paseoProviderId: event.target.value })}
          placeholder="paseo-codex-default"
          aria-label="Paseo Provider ID，可选"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-base-url">Base URL（可选）</FieldLabel>
        <Input
          id="provider-base-url"
          value={values.baseUrl}
          onChange={event => onChange({ ...values, baseUrl: event.target.value })}
          placeholder="https://api.example.com"
          aria-label="Provider Base URL，可选"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-model">模型（可选）</FieldLabel>
        <Input
          id="provider-model"
          value={values.model}
          onChange={event => onChange({ ...values, model: event.target.value })}
          placeholder="gpt-5-codex"
          aria-label="Provider 模型，可选"
        />
      </Field>
      <FieldError>{error}</FieldError>
    </FieldGroup>
  )
}

export interface SoulFormContentProps {
  catalog: SoulCatalogEntry[]
  error: string | null
  onChange: (values: RegisterSoulFormValues) => void
  values: RegisterSoulFormValues
}

export function SoulFormContent({ catalog, error, onChange, values }: SoulFormContentProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="soul-descriptor">能力模板 Soul descriptor</FieldLabel>
        <Select value={values.soul} onValueChange={value => onChange({ ...values, soul: value })}>
          <SelectTrigger id="soul-descriptor" aria-label="选择要登记的能力模板 Soul descriptor">
            <SelectValue placeholder={catalog.length ? '选择服务器上的 Soul descriptor' : '服务器上没有可登记的 Soul'} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {catalog.map(item => (
                <SelectItem key={item.descriptorRef} value={item.descriptorRef}>
                  {item.displayName}
                  {' · '}
                  {item.version}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>选项来自服务器端扫描的 souls/*/dist；无需手填本机文件路径。</FieldDescription>
      </Field>
      <FieldError>{error}</FieldError>
    </FieldGroup>
  )
}
