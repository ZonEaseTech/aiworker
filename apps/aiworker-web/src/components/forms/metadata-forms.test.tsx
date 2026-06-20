import type { SoulCatalogEntry } from '@/lib/admin-api-client'
import type { AssignmentSummary, PaseoEnvironmentSummary, ProviderProfileSummary, SoulReleaseSummary } from '@/lib/admin-data'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { CreateAssignmentSheet } from '@/components/forms/create-assignment-sheet'
import { CreateEnvironmentSheet } from '@/components/forms/create-environment-sheet'
import { CreateProviderSheet } from '@/components/forms/create-provider-sheet'
import {
  AssignmentFormContent,
  EnvironmentFormContent,
  ProviderFormContent,
  SoulFormContent,
} from '@/components/forms/metadata-form-content'
import {
  assignmentFormFromSummary,
  buildAssignmentPayload,
  buildEnvironmentPayload,
  buildPlanPreviewPayload,
  buildProviderPayload,
  buildSoulPayload,
  emptyAssignmentForm,
  emptyEnvironmentForm,
  emptyProviderForm,
  emptySoulForm,
  environmentFormFromSummary,
  isValidSecretRef,
  providerFormFromSummary,
  validateAssignmentForm,
  validateEnvironmentForm,
  validateProviderForm,
  validateSoulForm,
} from '@/components/forms/metadata-form-helpers'

const environments: PaseoEnvironmentSummary[] = [
  {
    id: 'env-alice',
    ownerEmail: 'alice@example.com',
    targetRef: 'aissh:prod-1',
    paseoHome: '/home/alice/.paseo',
    daemonEndpoint: '127.0.0.1:42057',
    endpointKind: 'tcp',
    isolation: 'os-user',
    providerProfileIds: ['codex-default'],
    status: 'ready',
  },
]

const providers: ProviderProfileSummary[] = [
  {
    id: 'codex-default',
    label: 'Codex 默认配置',
    provider: 'codex',
    secretRef: 'secret://providers/codex/default',
    status: 'ready',
  },
]

const souls: SoulReleaseSummary[] = [
  {
    id: 'aiworker-freeform@0.0.0',
    displayName: 'AIWorker Freeform',
    version: '0.0.0',
    descriptorRef: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    workspaceTemplateRoot: 'souls/aiworker-freeform/dist/workspace-template',
    fileCount: 9,
    updatedAt: '2026-06-14 07:10 UTC',
    status: 'published',
    summary: '通用企业 AI 工作者。',
  },
]

const catalog: SoulCatalogEntry[] = [
  {
    descriptorRef: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    displayName: 'AIWorker Freeform',
    id: 'aiworker-freeform',
    soulReleaseRef: 'aiworker-freeform@0.0.0',
    version: '0.0.0',
  },
]

describe('metadata form validation', () => {
  test('assignment form requires user, environment, provider and soul', () => {
    expect(validateAssignmentForm(emptyAssignmentForm)).toBe('请填写员工邮箱。')
    expect(validateAssignmentForm({ ...emptyAssignmentForm, user: 'a@b.com' })).toBe('请选择员工设备（Paseo environment）。')
    expect(validateAssignmentForm({
      assignmentId: '',
      environment: 'env-alice',
      provider: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@0.0.0',
      user: 'a@b.com',
    })).toBeNull()
  })

  test('environment form requires id, owner and target', () => {
    expect(validateEnvironmentForm(emptyEnvironmentForm)).toContain('设备 ID')
    expect(validateEnvironmentForm({ environment: 'env-x', provider: '', target: '', user: '' })).toContain('负责人邮箱')
    expect(validateEnvironmentForm({ environment: 'env-x', provider: '', target: 'aissh:x', user: 'o@e.com' })).toBeNull()
  })

  test('soul form requires a descriptor selection', () => {
    expect(validateSoulForm(emptySoulForm)).toContain('能力模板')
    expect(validateSoulForm({ soul: 'souls/x/dist/soul.descriptor.json' })).toBeNull()
  })
})

describe('provider secretRef enforcement', () => {
  test('only accepts secret:// references', () => {
    expect(isValidSecretRef('secret://providers/codex/default')).toBe(true)
    expect(isValidSecretRef('sk-live-1234')).toBe(false)
    expect(isValidSecretRef('')).toBe(false)
  })

  test('provider form rejects a non secret:// ref', () => {
    expect(validateProviderForm({ ...emptyProviderForm, provider: 'p', providerKind: 'codex', secretRef: 'sk-1234' }))
      .toContain('secret://')
    expect(validateProviderForm({ ...emptyProviderForm, provider: 'p', providerKind: 'codex', secretRef: 'secret://x' }))
      .toBeNull()
  })

  test('provider payload keeps the secret reference and omits empty optionals', () => {
    const payload = buildProviderPayload({
      baseUrl: '',
      cliCommand: '',
      model: '',
      paseoProviderId: '',
      provider: 'codex-default',
      providerKind: 'codex',
      secretRef: 'secret://providers/codex/default',
    })
    expect(payload).toEqual({
      provider: 'codex-default',
      providerKind: 'codex',
      secretRef: 'secret://providers/codex/default',
    })
  })
})

describe('metadata payload builders', () => {
  test('assignment payload omits empty assignmentId and trims', () => {
    expect(buildAssignmentPayload({
      assignmentId: '  ',
      environment: ' env-alice ',
      provider: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@0.0.0',
      user: 'alice@example.com',
    })).toEqual({
      environment: 'env-alice',
      provider: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@0.0.0',
      user: 'alice@example.com',
    })
  })

  test('soul payload passes the descriptor path through', () => {
    expect(buildSoulPayload({ soul: ' souls/x/dist/soul.descriptor.json ' }))
      .toEqual({ soul: 'souls/x/dist/soul.descriptor.json' })
  })

  test('plan preview resolves the selected release ref to a descriptor path for --soul', () => {
    const payload = buildPlanPreviewPayload(
      {
        assignmentId: '',
        environment: 'env-alice',
        provider: 'codex-default',
        soulReleaseRef: 'aiworker-freeform@0.0.0',
        user: 'alice@example.com',
      },
      souls,
    )
    // plan --soul wants a descriptor PATH, never a release ref.
    expect(payload.soul).toBe('souls/aiworker-freeform/dist/soul.descriptor.json')
    expect(payload.soul).not.toBe('aiworker-freeform@0.0.0')
    expect(payload).toEqual({
      environment: 'env-alice',
      provider: 'codex-default',
      soul: 'souls/aiworker-freeform/dist/soul.descriptor.json',
      user: 'alice@example.com',
    })
  })
})

describe('metadata form content rendering', () => {
  test('assignment form renders Chinese labels and protocol nouns', () => {
    const markup = renderToStaticMarkup(
      <AssignmentFormContent
        environments={environments}
        error={null}
        onChange={() => {}}
        providers={providers}
        souls={souls}
        values={emptyAssignmentForm}
      />,
    )
    expect(markup).toContain('员工邮箱')
    expect(markup).toContain('员工设备 Environment')
    expect(markup).toContain('后台 AI 账号 Provider')
    expect(markup).toContain('能力模板 Soul')
    expect(markup).toContain('aria-label="选择员工设备 Environment"')
    expect(markup).not.toContain('aria-label="Select')
  })

  test('provider form labels the secret reference and flags invalid input', () => {
    const markup = renderToStaticMarkup(
      <ProviderFormContent
        error={null}
        onChange={() => {}}
        values={{ ...emptyProviderForm, secretRef: 'sk-not-a-ref' }}
      />,
    )
    expect(markup).toContain('这里填写的是密钥“引用”，不是密钥本身')
    expect(markup).toContain('必须以 secret:// 开头')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('密钥引用必须以 secret:// 开头')
  })

  test('soul form lists catalog options from the server scan', () => {
    const markup = renderToStaticMarkup(
      <SoulFormContent catalog={catalog} error={null} onChange={() => {}} values={emptySoulForm} />,
    )
    expect(markup).toContain('能力模板 Soul descriptor')
    expect(markup).toContain('选项来自服务器端扫描的 souls/*/dist')
    expect(markup).toContain('无需手填本机文件路径')
  })

  test('environment form renders Chinese aria-labels for inputs', () => {
    const markup = renderToStaticMarkup(
      <EnvironmentFormContent error={null} onChange={() => {}} providers={providers} values={emptyEnvironmentForm} />,
    )
    expect(markup).toContain('aria-label="设备 ID，environment id"')
    expect(markup).toContain('设备连接地址 target')
  })

  test('form error surfaces validation message', () => {
    const markup = renderToStaticMarkup(
      <AssignmentFormContent
        environments={environments}
        error="请填写员工邮箱。"
        onChange={() => {}}
        providers={providers}
        souls={souls}
        values={emptyAssignmentForm}
      />,
    )
    expect(markup).toContain('请填写员工邮箱。')
  })
})

const multiProviderEnvironment: PaseoEnvironmentSummary = {
  ...environments[0]!,
  providerProfileIds: ['codex-default', 'claude-ops'],
}

const fullProvider: ProviderProfileSummary = {
  id: 'codex-default',
  label: 'Codex 默认配置',
  provider: 'codex',
  secretRef: 'secret://providers/codex/default',
  baseUrl: 'https://api.example.com',
  model: 'gpt-5-codex',
  cliCommand: 'codex',
  paseoProviderId: 'paseo-codex-default',
  status: 'reference_only',
}

const assignmentSummary: AssignmentSummary = {
  id: 'asn-alice-freeform',
  assignedEmail: 'alice@example.com',
  team: 'example.com',
  status: 'ready',
  environmentId: 'env-alice',
  soulReleaseId: 'aiworker-freeform@0.0.0',
  providerProfileId: 'codex-default',
  workspaceRef: '/home/alice/projects/freeform',
  receiptId: 'rcpt-1',
  handoffKind: 'paseo-daemon',
  handoffLabel: '员工可通过 Paseo 客户端打开 AIWorker。',
  updatedAt: '2026-06-14 07:34 UTC',
  nextStep: '把使用入口发给员工。',
  audit: [],
}

describe('metadata edit prefill mapping', () => {
  test('environment summary maps to form values, collapsing providers to the first id', () => {
    expect(environmentFormFromSummary(multiProviderEnvironment)).toEqual({
      environment: 'env-alice',
      provider: 'codex-default',
      target: 'aissh:prod-1',
      user: 'alice@example.com',
    })
  })

  test('provider summary round-trips baseUrl and model into the edit form', () => {
    const values = providerFormFromSummary(fullProvider)
    expect(values).toEqual({
      baseUrl: 'https://api.example.com',
      cliCommand: 'codex',
      model: 'gpt-5-codex',
      paseoProviderId: 'paseo-codex-default',
      provider: 'codex-default',
      providerKind: 'codex',
      secretRef: 'secret://providers/codex/default',
    })
    // The resubmitted payload preserves baseUrl/model so a replace-by-id update is not lossy.
    expect(buildProviderPayload(values)).toMatchObject({
      baseUrl: 'https://api.example.com',
      model: 'gpt-5-codex',
      secretRef: 'secret://providers/codex/default',
    })
  })

  test('assignment summary maps to form values keyed by the original id', () => {
    expect(assignmentFormFromSummary(assignmentSummary)).toEqual({
      assignmentId: 'asn-alice-freeform',
      environment: 'env-alice',
      provider: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@0.0.0',
      user: 'alice@example.com',
    })
  })

  test('assignment edit payload carries the original assignmentId so it updates instead of creating', () => {
    const payload = buildAssignmentPayload(assignmentFormFromSummary(assignmentSummary))
    expect(payload).toMatchObject({
      assignmentId: 'asn-alice-freeform',
      environment: 'env-alice',
      provider: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@0.0.0',
      user: 'alice@example.com',
    })
  })

  test('environment edit payload keeps the original environment id', () => {
    const payload = buildEnvironmentPayload(environmentFormFromSummary(multiProviderEnvironment))
    expect(payload).toMatchObject({ environment: 'env-alice', provider: 'codex-default', target: 'aissh:prod-1' })
  })

  test('prefilled provider form renders the existing secret reference and optional fields', () => {
    const markup = renderToStaticMarkup(
      <ProviderFormContent error={null} onChange={() => {}} values={providerFormFromSummary(fullProvider)} />,
    )
    expect(markup).toContain('value="secret://providers/codex/default"')
    expect(markup).toContain('value="https://api.example.com"')
    expect(markup).toContain('value="gpt-5-codex"')
    // A valid secret:// ref must not be flagged invalid when prefilled.
    expect(markup).not.toContain('aria-invalid="true"')
  })

  test('prefilled environment form renders the existing target and owner', () => {
    const markup = renderToStaticMarkup(
      <EnvironmentFormContent
        error={null}
        onChange={() => {}}
        providers={providers}
        values={environmentFormFromSummary(multiProviderEnvironment)}
      />,
    )
    expect(markup).toContain('value="env-alice"')
    expect(markup).toContain('value="aissh:prod-1"')
    expect(markup).toContain('value="alice@example.com"')
  })
})

describe('metadata edit triggers expose Chinese aria-labels', () => {
  test('provider edit trigger labels the entity being edited', () => {
    const markup = renderToStaticMarkup(<CreateProviderSheet editTarget={fullProvider} />)
    expect(markup).toContain('编辑后台 AI 账号 codex-default')
    expect(markup).not.toContain('aria-label="Edit')
  })

  test('environment edit trigger labels the entity being edited', () => {
    const markup = renderToStaticMarkup(<CreateEnvironmentSheet editTarget={multiProviderEnvironment} />)
    expect(markup).toContain('编辑员工设备 env-alice')
  })

  test('assignment edit trigger labels the entity being edited', () => {
    const markup = renderToStaticMarkup(<CreateAssignmentSheet editTarget={assignmentSummary} />)
    expect(markup).toContain('编辑员工开通 asn-alice-freeform')
  })
})
