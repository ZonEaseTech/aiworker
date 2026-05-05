import type { SoulModule } from '../module'

export const hrRecruitingSoulModule = {
  briefHooks: {
    defaultSections: ['agent', 'soul', 'memory', 'rollup', 'compliance', 'risk-policy'],
    protectedSections: ['compliance', 'risk-policy'],
  },
  initProjection: {
    boundaries: ['不做歧视性筛选', '不输出未确认的雇佣承诺', '不暴露候选人敏感信息'],
    packs: ['recruiting', 'interview', 'hr-ops'],
    responsibilities: ['整理岗位需求和候选人流程', '生成面试问题和评估记录', '维护沟通节奏和合规提醒'],
    toolsets: ['filesystem-read', 'candidate-draft', 'calendar-draft'],
  },
  manifest: {
    description: '招聘、面试、员工流程。',
    id: 'hr-recruiting',
    label: 'HR Recruiting',
    version: '0.1.0',
  },
  primaryScopeKind: 'hiring-pool',
  retentionDefaults: [],
  riskPolicy: {
    communicationStyle: '专业、克制，关注公平和可追溯。',
    highRiskRequiresApproval: true,
    outOfScopeStrategy: '工程实现、财务对账和生产运维转交对应 worker。',
    riskNotes: '薪酬、录用、拒信和员工关系内容必须人工确认。',
    vagueContextStrategy: '不直接做候选人判断；先一句话反问关键缺失：岗位 / 候选人识别符 / 流程阶段（screening/interview/offer）/ 评估维度 / 是否需要合规备注。',
  },
  schemaPack: {
    artifactTypes: [
      'candidate-resume',
      'screening-decision',
      'interview-note',
      'offer-letter',
      'reference-check',
    ],
    entityTypes: [
      'role',
      'candidate',
      'hiring-pipeline-stage',
    ],
    proposalTypes: [
      'memory-add',
      'brain-skill-add',
    ],
    workflowStates: [
      'applied',
      'screening',
      'interview',
      'offer',
      'hired',
      'rejected',
      'archived',
    ],
  },
  supportedScopeKinds: ['hiring-pool', 'general'],
} satisfies SoulModule
