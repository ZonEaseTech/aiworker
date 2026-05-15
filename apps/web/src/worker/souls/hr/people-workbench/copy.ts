import type { SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { HrLocale, LifecycleFilter, PersonLifecycle, ReviewDisplayState } from './types'

export interface HrWorkbenchCopy {
  actionLabels: Record<string, string>
  actionComposerEmpty: string
  actionMeta: (scope: SoulWorkbenchAction['scope'], outputKind: string) => string
  actionComposerDetail: (profileName: string) => string
  actionComposerTitle: string
  artifactPatches: string
  artifactPreviewDetail: string
  artifactPreviewEmpty: string
  artifactPreviewError: string
  artifactPreviewLoading: string
  artifactPreviewTitle: string
  artifactTargetLabel: string
  approveProfileRevision: string
  approvingProfileRevision: string
  commandDetail: (profileName: string, moment: string) => string
  contextLabel: string
  contextPlaceholder: string
  currentProfileEmpty: string
  currentProfileError: string
  currentProfileLoading: string
  emptyProfileBody: string
  emptyProfileTitle: string
  evidenceConnectors: string
  generate: (outputKind: string) => string
  guardrailsDetail: string
  guardrailsTitle: string
  headerFallback: string
  hideProfileList: string
  hideProfileTools: string
  humanDecisionTag: string
  latestSession: (status: string) => string
  lifecycleFilterLabel: string
  lifecycleFilters: Record<LifecycleFilter, string>
  lifecycleLabels: Record<PersonLifecycle, string>
  memoryCandidates: string
  metrics: (profiles: number, artifacts: number, lessons: number) => string[]
  metricsLabel: string
  moments: {
    artifactReady: string
    checkinNeeded: string
    inProgress: string
    intakeNeeded: string
    offboardingNeeded: string
    reviewed: string
    riskReview: string
  }
  newProfile: string
  nextLabel: string
  nextSteps: {
    captureMemory: string
    checkin: string
    completeArtifact: string
    offboarding: string
    profileSnapshot: string
    requestReview: string
    resolveRisk: string
  }
  noSessionYet: string
  noTimeline: string
  noProfilesInSection: string
  noRecentSessions: string
  openSession: (sessionTitle: string) => string
  openLatestSession: string
  openProfile: (profileName: string) => string
  profileDetailsDetail: (profileName: string) => string
  profileDetailsEmpty: string
  profileDetailsTitle: string
  profileBoardDetail: (count: number) => string
  profileBoardLabel: string
  profileBoardTitle: string
  profileListDetail: (count: number) => string
  profileListSearchLabel: string
  profileListSearchPlaceholder: string
  recentSessionsDetail: (count: number) => string
  recentSessionsTitle: string
  proposalComposerDetail: string
  proposalComposerTitle: string
  promoteProfileRevisionHint: string
  proposalOnly: string
  recommended: string
  reviewGuardrails: string[]
  reviewStatus: (state: ReviewDisplayState) => string
  selectProfileFirst: string
  sessionLoops: string
  showProfileList: string
  showProfileTools: string
  sourceCards: (artifacts: number, sessions: number, reviews: number) => Array<{ count: number, detail: string, label: string }>
  sourcesDetail: string
  sourcesTitle: string
  suggestedToolsTitle: string
  status: {
    evidenceMissing: string
    evidenceReady: string
  }
  timelineLabels: {
    artifact: string
    memory: string
    profile: string
    review: string
    session: string
  }
  timelineLessonCount: (count: number) => string
  timelineReviewCount: (count: number) => string
  timelineTitle: string
  timelineUpdated: (updatedAt: string) => string
  workbenchPanelControlsLabel: string
  workbenchTitle: string
}

const enHrCopy: HrWorkbenchCopy = {
  actionLabels: {},
  actionComposerEmpty: 'Select a profile',
  actionMeta: (scope, outputKind) => `${scope} / ${outputKind}`,
  actionComposerDetail: profileName => `Prepare the next reviewable profile action for ${profileName}.`,
  actionComposerTitle: 'Profile Actions',
  artifactPatches: 'artifact proposals',
  artifactPreviewDetail: 'Latest reviewable change proposal rendered from the workspace file.',
  artifactPreviewEmpty: 'No proposed change yet.',
  artifactPreviewError: 'Proposed change preview is unavailable.',
  artifactPreviewLoading: 'Loading proposed change...',
  artifactPreviewTitle: 'Proposed Change',
  artifactTargetLabel: 'Artifact proposal target',
  approveProfileRevision: 'Approve Profile Revision',
  approvingProfileRevision: 'Approving Profile Revision',
  commandDetail: (profileName, moment) => `${profileName}: ${moment}. Keep evidence, next step, review, and memory status connected.`,
  contextLabel: 'Context for the next profile proposal',
  contextPlaceholder: 'Describe this person, lifecycle moment, evidence, open questions, or the next HR artifact...',
  currentProfileEmpty: 'No accepted profile summary yet. Approve a proposed change to update README.md.',
  currentProfileError: 'Current profile summary is unavailable.',
  currentProfileLoading: 'Loading current profile summary...',
  emptyProfileBody: 'Create a profile workspace to start connecting evidence, next steps, review, and memory.',
  emptyProfileTitle: 'No people profiles yet',
  evidenceConnectors: 'Evidence connectors',
  generate: outputKind => `Generate ${outputKind}`,
  guardrailsDetail: 'Review before memory',
  guardrailsTitle: 'Review guardrails',
  headerFallback: 'People Profiles',
  hideProfileList: 'Hide Profile List',
  hideProfileTools: 'Hide Profile Tools',
  humanDecisionTag: 'human decision',
  latestSession: status => `Latest session ${status}.`,
  lifecycleFilterLabel: 'Lifecycle filters',
  lifecycleFilters: {
    all: 'All people',
    alumni: 'Alumni',
    attention: 'Needs attention',
    candidate: 'Candidates',
    employee: 'Employees',
  },
  lifecycleLabels: {
    alumni: 'Alumni',
    candidate: 'Candidate',
    employee: 'Employee',
  },
  memoryCandidates: 'memory candidates',
  metrics: (profiles, artifacts, lessons) => [`${profiles} profiles`, `${artifacts} artifacts`, `${lessons} lessons`],
  metricsLabel: 'HR workbench metrics',
  moments: {
    artifactReady: 'Artifact ready for review',
    checkinNeeded: 'Check-in needed',
    inProgress: 'Session in progress',
    intakeNeeded: 'Profile intake needed',
    offboardingNeeded: 'Offboarding notes needed',
    reviewed: 'Reviewed',
    riskReview: 'Risk review needed',
  },
  newProfile: 'New profile',
  nextLabel: 'Next',
  nextSteps: {
    captureMemory: 'Capture lesson candidate',
    checkin: 'Prepare check-in',
    completeArtifact: 'Complete proposal',
    offboarding: 'Prepare offboarding summary',
    profileSnapshot: 'Summarize profile',
    requestReview: 'Request review',
    resolveRisk: 'Resolve risk',
  },
  noSessionYet: 'No session yet',
  noTimeline: 'Select or create a profile to build the timeline.',
  noProfilesInSection: 'No profiles in this section.',
  noRecentSessions: 'No agent sessions for this profile yet.',
  openSession: sessionTitle => `Open ${sessionTitle} session`,
  openLatestSession: 'Open latest session',
  openProfile: profileName => `Open ${profileName} profile`,
  profileDetailsDetail: profileName => `${profileName} accepted README profile, evidence, proposed changes, and review state.`,
  profileDetailsEmpty: 'Select a people profile to inspect its accepted README profile and proposed changes.',
  profileDetailsTitle: 'Current Profile Summary',
  profileBoardDetail: count => `${count} visible profiles`,
  profileBoardLabel: 'People Profiles',
  profileBoardTitle: 'People Profiles',
  profileListDetail: count => `${count} visible profiles`,
  profileListSearchLabel: 'Search people profiles',
  profileListSearchPlaceholder: 'Search people...',
  recentSessionsDetail: count => `${count} profile sessions`,
  recentSessionsTitle: 'Recent Sessions',
  proposalComposerDetail: 'Agent output remains a reviewable proposal tied to this profile.',
  proposalComposerTitle: 'Proposal Composer',
  promoteProfileRevisionHint: 'Review accepts this proposal into README.md and records a git revision.',
  proposalOnly: 'Agent output remains a proposal until review.',
  recommended: 'Recommended',
  reviewGuardrails: [
    'Evidence is tied to role-related or lifecycle-relevant criteria and source references.',
    'Missing, weak, and conflicting signals are visible.',
    'Sensitive details are not promoted into durable memory without review.',
    'Hiring and employment decisions remain explicitly human-owned.',
  ],
  reviewStatus: (state) => {
    if (state === 'pass')
      return 'reviewed'
    if (state === 'warn')
      return 'review warnings'
    if (state === 'fail')
      return 'review failed'
    return 'needs review'
  },
  selectProfileFirst: 'Select a profile card before generating a proposal.',
  sessionLoops: 'session loops',
  showProfileList: 'Show Profile List',
  showProfileTools: 'Show Profile Tools',
  sourceCards: (artifacts, sessions, reviews) => [
    { count: artifacts, detail: 'reviewable outputs', label: 'Artifact evidence' },
    { count: sessions, detail: 'profile work loops', label: 'Session context' },
    { count: reviews, detail: 'human checks', label: 'Review records' },
  ],
  sourcesDetail: 'Selected profile inventory',
  sourcesTitle: 'Profile sources',
  suggestedToolsTitle: 'Suggested Profile Actions',
  status: {
    evidenceMissing: 'needs evidence',
    evidenceReady: 'evidence ready',
  },
  timelineLabels: {
    artifact: 'Artifact',
    memory: 'Memory',
    profile: 'Profile',
    review: 'Review',
    session: 'Session',
  },
  timelineLessonCount: count => `${count} memory candidates`,
  timelineReviewCount: count => `${count} review records`,
  timelineTitle: 'Profile timeline',
  timelineUpdated: updatedAt => `Updated ${updatedAt}`,
  workbenchPanelControlsLabel: 'Workbench panel controls',
  workbenchTitle: 'People Workbench',
}

const zhHrCopy: HrWorkbenchCopy = {
  actionLabels: {
    'build-evidence-matrix': '构建证据矩阵',
    'check-risky-wording': '检查风险表述',
    'draft-interview-kit': '生成面试提纲',
    'draft-onboarding-plan': '生成入职计划',
    'extract-evidence': '抽取人员证据',
    'prepare-next-step': '准备下一步触点',
    'prepare-offboarding-summary': '准备离职交接',
    'summarize-profile': '生成人员档案',
  },
  actionComposerEmpty: '选择一个人员档案',
  actionMeta: (scope, outputKind) => `${zhScope(scope)} / ${outputKind}`,
  actionComposerDetail: profileName => `为 ${profileName} 准备下一步档案操作。`,
  actionComposerTitle: '档案操作',
  artifactPatches: '产物提案',
  artifactPreviewDetail: '从 workspace 文件渲染最近一份可 review 的档案变更提案。',
  artifactPreviewEmpty: '还没有可预览的变更提案。',
  artifactPreviewError: '变更提案预览暂不可用。',
  artifactPreviewLoading: '正在加载变更提案...',
  artifactPreviewTitle: '变更提案',
  artifactTargetLabel: '产物提案目标',
  approveProfileRevision: '批准档案修订',
  approvingProfileRevision: '正在批准档案修订',
  commandDetail: (profileName, moment) => `${profileName}：${moment}。证据、下一步、review 和 memory 状态保持在同一个闭环里。`,
  contextLabel: '下一份人员提案上下文',
  contextPlaceholder: '描述这个人、生命周期节点、证据、开放问题，或下一份 HR 产物目标...',
  currentProfileEmpty: '还没有已接受的档案摘要。批准一份变更提案后会更新 README.md。',
  currentProfileError: '当前档案摘要暂不可用。',
  currentProfileLoading: '正在加载当前档案摘要...',
  emptyProfileBody: '创建人员档案工作区后，再把证据、下一步、review 和 memory 串起来。',
  emptyProfileTitle: '还没有人员档案',
  evidenceConnectors: '证据连接器',
  generate: outputKind => `生成 ${outputKind}`,
  guardrailsDetail: '先复核，再沉淀组织记忆',
  guardrailsTitle: 'Review 护栏',
  headerFallback: '人员档案',
  hideProfileList: '隐藏 Profile List',
  hideProfileTools: '隐藏 Profile Tools',
  humanDecisionTag: '人类决策',
  latestSession: status => `最近 session ${status}。`,
  lifecycleFilterLabel: '生命周期筛选',
  lifecycleFilters: {
    all: '全部人员',
    alumni: '离职 / Alumni',
    attention: '需要关注',
    candidate: '候选人',
    employee: '在职员工',
  },
  lifecycleLabels: {
    alumni: '离职',
    candidate: '候选人',
    employee: '在职',
  },
  memoryCandidates: 'memory 候选',
  metrics: (profiles, artifacts, lessons) => [`${profiles} 个人员档案`, `${artifacts} 个产物`, `${lessons} 条 lesson`],
  metricsLabel: 'HR 工作台指标',
  moments: {
    artifactReady: '产物可 review',
    checkinNeeded: '需要 check-in',
    inProgress: 'session 进行中',
    intakeNeeded: '需要补齐档案',
    offboardingNeeded: '需要离职交接记录',
    reviewed: '已 review',
    riskReview: '需要风险复核',
  },
  newProfile: '新建人员档案',
  nextLabel: '下一步',
  nextSteps: {
    captureMemory: '沉淀 lesson 候选',
    checkin: '准备 check-in',
    completeArtifact: '补齐产物提案',
    offboarding: '准备离职交接',
    profileSnapshot: '生成人员档案',
    requestReview: '请求 review',
    resolveRisk: '处理风险',
  },
  noSessionYet: '还没有 session',
  noTimeline: '选择或创建人员档案后开始形成时间线。',
  noProfilesInSection: '这个分组里还没有人员档案。',
  noRecentSessions: '这个人员档案还没有 agent session。',
  openSession: sessionTitle => `打开 ${sessionTitle} session`,
  openLatestSession: '打开最近 session',
  openProfile: profileName => `打开 ${profileName} 档案`,
  profileDetailsDetail: profileName => `${profileName} 的已接受 README 档案、证据、变更提案和 review 状态。`,
  profileDetailsEmpty: '选择一个人员档案后查看已接受 README 档案和变更提案。',
  profileDetailsTitle: '当前档案摘要',
  profileBoardDetail: count => `${count} 个可见档案`,
  profileBoardLabel: '人员档案',
  profileBoardTitle: '人员档案',
  profileListDetail: count => `${count} 个可见档案`,
  profileListSearchLabel: '搜索人员档案',
  profileListSearchPlaceholder: '搜索人员...',
  recentSessionsDetail: count => `${count} 个 profile session`,
  recentSessionsTitle: 'Recent Sessions',
  proposalComposerDetail: 'Agent 输出只作为绑定此档案的可 review 提案。',
  proposalComposerTitle: '产物提案',
  promoteProfileRevisionHint: 'Review 通过后会把这份提案写入 README.md，并记录 git 修订。',
  proposalOnly: 'Agent 输出在 review 前都只是提案。',
  recommended: '建议',
  reviewGuardrails: [
    '证据必须绑定岗位相关或生命周期相关标准和来源引用。',
    '缺失、薄弱和冲突信号必须保持可见。',
    '敏感信息未经 review 不进入 durable memory。',
    '招聘和雇佣决策必须明确由人类负责。',
  ],
  reviewStatus: (state) => {
    if (state === 'pass')
      return '已 review'
    if (state === 'warn')
      return 'review 有警告'
    if (state === 'fail')
      return 'review 未通过'
    return '待 review'
  },
  selectProfileFirst: '先选择一个人员档案卡片，再生成提案。',
  sessionLoops: 'session 循环',
  showProfileList: '显示 Profile List',
  showProfileTools: '显示 Profile Tools',
  sourceCards: (artifacts, sessions, reviews) => [
    { count: artifacts, detail: '可 review 的输出', label: '产物证据' },
    { count: sessions, detail: '人员工作循环', label: 'Session 上下文' },
    { count: reviews, detail: '人工质量检查', label: 'Review 记录' },
  ],
  sourcesDetail: '所选人员证据库存',
  sourcesTitle: '档案来源',
  suggestedToolsTitle: '建议档案操作',
  status: {
    evidenceMissing: '需要证据',
    evidenceReady: '证据就绪',
  },
  timelineLabels: {
    artifact: '产物',
    memory: 'Memory',
    profile: '档案',
    review: 'Review',
    session: 'Session',
  },
  timelineLessonCount: count => `${count} 条 memory 候选`,
  timelineReviewCount: count => `${count} 条 review 记录`,
  timelineTitle: '档案时间线',
  timelineUpdated: updatedAt => `更新于 ${updatedAt}`,
  workbenchPanelControlsLabel: '工作台面板控制',
  workbenchTitle: 'People Workbench',
}

export function getHrPeopleWorkbenchCopy(locale: HrLocale): HrWorkbenchCopy {
  if (locale === 'zh-CN')
    return zhHrCopy
  return enHrCopy
}

function zhScope(scope: SoulWorkbenchAction['scope']): string {
  switch (scope) {
    case 'alumni':
      return '离职'
    case 'artifact':
      return '产物'
    case 'candidate':
      return '候选人'
    case 'employee':
      return '员工'
    case 'interview':
      return '面试'
    case 'lifecycle':
      return '生命周期'
    case 'person':
      return '人员'
    case 'pool':
      return '候选池'
    case 'role':
      return '岗位'
  }
}
