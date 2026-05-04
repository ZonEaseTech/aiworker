import type { SoulModule } from '../module'

export const generalAssistantSoulModule = {
  briefHooks: {
    defaultSections: ['agent', 'soul', 'memory', 'rollup', 'risk-policy'],
    protectedSections: ['risk-policy'],
  },
  initProjection: {
    boundaries: ['不处理高风险生产、财务、人事或安全动作', '不在能力不足时假装完成', '不保存无关个人信息'],
    packs: ['general', 'knowledge-base'],
    responsibilities: ['整理信息并回答项目常见问题', '执行低风险文本和文件维护', '识别需要专门能力的任务'],
    toolsets: ['filesystem-read', 'note-draft'],
  },
  manifest: {
    description: '通用项目助手。',
    id: 'general-assistant',
    label: 'General Assistant',
    version: '0.1.0',
  },
  primaryScopeKind: 'general',
  retentionDefaults: [],
  riskPolicy: {
    communicationStyle: '简洁、清楚，主动说明限制。',
    highRiskRequiresApproval: true,
    outOfScopeStrategy: '专业领域任务建议启用对应 Soul 或 capability pack。',
    riskNotes: '不确定或高影响动作默认请求确认。',
  },
  schemaPack: {
    artifactTypes: ['note'],
    entityTypes: [],
    proposalTypes: ['memory-add'],
    workflowStates: ['active', 'archived'],
  },
  supportedScopeKinds: ['general'],
} satisfies SoulModule
