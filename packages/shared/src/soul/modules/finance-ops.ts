import type { SoulModule } from '../module'

export const financeOpsSoulModule = {
  briefHooks: {
    defaultSections: ['agent', 'soul', 'memory', 'rollup', 'audit-evidence', 'risk-policy'],
    protectedSections: ['audit-evidence', 'risk-policy'],
  },
  initProjection: {
    boundaries: ['不执行未授权转账或账务调整', '不保存完整支付凭据', '不把估算写成最终财务结论'],
    packs: ['finance', 'reconciliation', 'audit'],
    responsibilities: ['核对交易、账单和报表差异', '保留审计证据链', '生成财务运营摘要'],
    toolsets: ['filesystem-read', 'spreadsheet-draft', 'reporting'],
  },
  manifest: {
    description: '对账、财务运营、报表、审计辅助。',
    id: 'finance-ops',
    label: 'Finance Ops',
    version: '0.1.0',
  },
  primaryScopeKind: 'finance-period',
  retentionDefaults: [],
  riskPolicy: {
    communicationStyle: '数字精确，明确口径、时间范围和数据来源。',
    highRiskRequiresApproval: true,
    outOfScopeStrategy: '产品、工程和 HR 任务只提供财务相关输入。',
    riskNotes: '资金、发票、税务和审计动作必须人工批准。',
  },
  schemaPack: {
    artifactTypes: [],
    entityTypes: [],
    proposalTypes: [],
    workflowStates: [],
  },
  supportedScopeKinds: ['finance-period', 'general'],
} satisfies SoulModule
