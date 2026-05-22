import type { HrLocale, HrWorkbenchAction, LifecycleFilter, PersonLifecycle, ReviewDisplayState } from './types'

export interface HrWorkbenchCopy {
  actionLabels: Record<string, string>
  actionComposerEmpty: string
  actionMeta: (scope: HrWorkbenchAction['scope'], outputKind: string) => string
  actionComposerDetail: (profileName: string) => string
  actionComposerTitle: string
  acceptedExternalSectionsTitle: string
  artifactPatches: string
  artifactPreviewEmpty: string
  artifactTargetLabel: string
  approveProfileRevision: string
  approvingProfileRevision: string
  backToReadingRoom: string
  baseSectionEmpty: string
  changedSectionsTitle: string
  collapseProfileTools: string
  commandDetail: (profileName: string, moment: string) => string
  contextLabel: string
  contextPlaceholder: string
  addCandidateMaterials: string
  attachedCandidateMaterialsLabel: string
  candidateMaterialLabel: string
  composerSafetyDetail: string
  currentReadmeTitle: string
  currentProfileEmpty: string
  currentProfileError: string
  currentProfileLoading: string
  createProfileCancel: string
  createProfileDialogDescription: string
  createProfileDialogTitle: string
  createProfileLifecycleLabel: string
  createProfileNameLabel: string
  createProfileNamePlaceholder: string
  createProfileSubmit: string
  createProfileSummaryLabel: string
  createProfileSummaryPlaceholder: string
  emptyProfileBody: string
  emptyProfileTitle: string
  evidenceConnectors: string
  expandProfileTools: string
  generate: (outputKind: string) => string
  headerFallback: string
  hideProfileList: string
  hideProfileTools: string
  humanDecisionTag: string
  identitySnapshotTitle: string
  latestSession: (status: string) => string
  lifecycleFilterLabel: string
  lifecycleFilters: Record<LifecycleFilter, string>
  lifecycleLabels: Record<PersonLifecycle, string>
  limitedActionsHidden: (count: number) => string
  memoryCandidates: string
  metrics: (profiles: number, artifacts: number, profileUpdates: number) => string[]
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
  noProfilesInSection: string
  noRecentSessions: string
  openCandidateMaterialPicker: string
  openSession: (sessionTitle: string) => string
  openLatestSession: string
  openProfile: (profileName: string) => string
  openSessionTools: string
  otherProfileNotesTitle: string
  profileDetailsDetail: (profileName: string) => string
  profileDetailsEmpty: string
  profileDetailsTitle: string
  profileHeaderDetail: (moment: string, nextStep: string) => string
  profileHeaderTitle: (profileName: string) => string
  profileReadingRoomDetail: (profileName: string) => string
  profileReadingRoomFallback: string
  profilePatchAddedLabel: string
  profilePatchBlockedTitle: string
  profilePatchBlockedStripDetail: (artifactTitle: string) => string
  profilePatchBlockers: (count: number) => string
  profilePatchChangedLabel: string
  profilePatchChangedSections: (count: number) => string
  profilePatchNoChanges: string
  profilePatchReadyTitle: string
  profilePatchReviewDetail: (artifactTitle: string) => string
  profilePatchReviewTitle: string
  profilePatchSectionAction: (sectionTitle: string) => string
  profilePatchSectionBadge: (sectionTitle: string, statusLabel: string) => string
  profilePatchStripDetail: (artifactTitle: string) => string
  profileSelectionBody: string
  profileSelectionTitle: string
  profileBoardDetail: (count: number) => string
  profileBoardLabel: string
  profileBoardTitle: string
  profileListDetail: (count: number) => string
  profileListFilterLabel: string
  profileListFilterPlaceholder: string
  profileToolsRailLabel: string
  recentSessionsDetail: (count: number) => string
  recentSessionsTitle: string
  draftComposerDetail: string
  draftComposerTitle: string
  draftTypeLabel: (templateId: string, outputKind: string, fallback: string) => string
  draftTypeSelectLabel: string
  proposedReadmeTitle: string
  draftOnly: string
  recommended: string
  removeCandidateMaterial: (fileName: string) => string
  previewCandidateMaterial: (fileName: string) => string
  closeCandidateMaterialPreview: (fileName: string) => string
  reviewGuardrails: string[]
  revisionBlocked: string
  revisionComparisonTitle: string
  revisionCurrentTitle: string
  revisionDraftTitle: string
  revisionReady: string
  revisionStatusTitle: string
  reviewProfilePatch: string
  reviewProfilePatchShort: string
  reviewStatus: (state: ReviewDisplayState) => string
  runSectionDraft: string
  selectProfileFirst: string
  sessionLoops: string
  showProfileList: string
  showProfileTools: string
  sourceCards: (artifacts: number, sessions: number, profileUpdates: number) => Array<{ count: number, label: string }>
  sourcesTitle: string
  suggestedToolsTitle: string
  status: {
    evidenceMissing: string
    evidenceReady: string
  }
  workbenchPanelControlsLabel: string
  workbenchTitle: string
  generateProfileDraft: string
  generatingProfileDraft: string
  materialReadError: string
  profileComposerTitle: (profileName: string) => string
}

const enHrCopy: HrWorkbenchCopy = {
  actionLabels: {},
  actionComposerEmpty: 'Select a profile',
  actionMeta: (scope, outputKind) => `${scope} / ${outputKind}`,
  actionComposerDetail: profileName => `Choose the next profile step for ${profileName}.`,
  actionComposerTitle: 'Next Profile Step',
  acceptedExternalSectionsTitle: 'Accepted External Sections',
  artifactPatches: 'README patches',
  artifactPreviewEmpty: 'No README patch yet.',
  artifactTargetLabel: 'README patch source',
  approveProfileRevision: 'Approve into README',
  approvingProfileRevision: 'Approving README patch',
  backToReadingRoom: 'Back to Reading Room',
  baseSectionEmpty: 'No accepted content in this section yet.',
  changedSectionsTitle: 'Changed sections',
  collapseProfileTools: 'Collapse Profile Workbench',
  commandDetail: (profileName, moment) => `${profileName}: ${moment}. Keep evidence, next step, and README update status connected.`,
  contextLabel: 'Context for the next profile draft',
  contextPlaceholder: 'Describe this person, lifecycle moment, evidence, open questions, or the next HR artifact...',
  addCandidateMaterials: 'Add candidate material files',
  attachedCandidateMaterialsLabel: 'Attached candidate materials',
  candidateMaterialLabel: 'Candidate material',
  composerSafetyDetail: 'Generates a profile draft and will not directly modify the official profile.',
  currentReadmeTitle: 'Current README',
  currentProfileEmpty: 'No accepted profile summary yet. Approve a proposed change to update README.md.',
  currentProfileError: 'Current profile summary is unavailable.',
  currentProfileLoading: 'Loading current profile summary...',
  createProfileCancel: 'Cancel',
  createProfileDialogDescription: 'Create a local profile draft, then attach evidence or start a focused profile draft from the composer.',
  createProfileDialogTitle: 'Create profile',
  createProfileLifecycleLabel: 'Lifecycle category',
  createProfileNameLabel: 'Profile name',
  createProfileNamePlaceholder: 'Ada Chen',
  createProfileSubmit: 'Create profile',
  createProfileSummaryLabel: 'Starting note',
  createProfileSummaryPlaceholder: 'Role, evidence gap, lifecycle moment, or the first question to resolve...',
  emptyProfileBody: 'Create a profile workspace to start connecting evidence, next steps, and accepted profile updates.',
  emptyProfileTitle: 'No people profiles yet',
  evidenceConnectors: 'Evidence connectors',
  expandProfileTools: 'Expand Profile Workbench',
  generate: outputKind => `Generate ${outputKind}`,
  headerFallback: 'People Profiles',
  hideProfileList: 'Hide Profile List',
  hideProfileTools: 'Hide Profile Workbench',
  humanDecisionTag: 'human decision',
  identitySnapshotTitle: 'Profile baseline',
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
  limitedActionsHidden: count => `+${count} more actions`,
  memoryCandidates: 'profile updates',
  metrics: (profiles, artifacts, profileUpdates) => [`${profiles} profiles`, `${artifacts} artifacts`, `${profileUpdates} profile updates`],
  metricsLabel: 'HR workbench metrics',
  moments: {
    artifactReady: 'Artifact ready for profile update',
    checkinNeeded: 'Check-in needed',
    inProgress: 'Session in progress',
    intakeNeeded: 'Profile intake needed',
    offboardingNeeded: 'Offboarding notes needed',
    reviewed: 'Profile updated',
    riskReview: 'Risk check needed',
  },
  newProfile: 'New profile',
  nextLabel: 'Next',
  nextSteps: {
    captureMemory: 'Capture profile update',
    checkin: 'Prepare check-in',
    completeArtifact: 'Complete artifact',
    offboarding: 'Prepare offboarding summary',
    profileSnapshot: 'Summarize profile',
    requestReview: 'Review README patch',
    resolveRisk: 'Resolve risk',
  },
  noSessionYet: 'No session yet',
  noProfilesInSection: 'No profiles in this section.',
  noRecentSessions: 'No agent sessions for this profile yet.',
  openCandidateMaterialPicker: 'Open candidate material file picker',
  openSession: sessionTitle => `Open ${sessionTitle} session`,
  openLatestSession: 'Open latest session',
  openProfile: profileName => `Open ${profileName} profile`,
  openSessionTools: 'Open Session Tools',
  otherProfileNotesTitle: 'Other Profile Notes',
  profileDetailsDetail: profileName => `${profileName} accepted README profile baseline.`,
  profileDetailsEmpty: 'Select a people profile to inspect its accepted README profile baseline.',
  profileDetailsTitle: 'Current Profile Summary',
  profileHeaderDetail: (moment, nextStep) => `${moment} · ${nextStep}`,
  profileHeaderTitle: profileName => `${profileName} People Profile`,
  profileReadingRoomDetail: profileName => `${profileName} accepted README profile baseline.`,
  profileReadingRoomFallback: 'Showing the accepted README as written.',
  profilePatchAddedLabel: 'Added',
  profilePatchBlockedTitle: 'Profile patch blocked',
  profilePatchBlockedStripDetail: artifactTitle => `${artifactTitle} needs an accepted README draft before it can be written.`,
  profilePatchBlockers: count => `${count} blocker${count === 1 ? '' : 's'}`,
  profilePatchChangedLabel: 'Changed',
  profilePatchChangedSections: count => `${count} section${count === 1 ? '' : 's'} changed`,
  profilePatchNoChanges: 'No README section changes detected.',
  profilePatchReadyTitle: 'Profile patch ready',
  profilePatchReviewDetail: artifactTitle => `Inspect ${artifactTitle} as a README patch before accepting it.`,
  profilePatchReviewTitle: 'Profile Patch',
  profilePatchSectionAction: sectionTitle => `Run profile action for ${sectionTitle}`,
  profilePatchSectionBadge: (sectionTitle, statusLabel) => `${sectionTitle} patch: ${statusLabel}`,
  profilePatchStripDetail: artifactTitle => `${artifactTitle} can be inspected as a README patch.`,
  profileSelectionBody: 'Pick a profile from the list to read its accepted README, inspect the latest draft, or prepare one focused next step.',
  profileSelectionTitle: 'Select a people profile',
  profileBoardDetail: count => `${count} visible profiles`,
  profileBoardLabel: 'People Profiles',
  profileBoardTitle: 'People Profiles',
  profileListDetail: count => `${count} visible profiles`,
  profileListFilterLabel: 'Filter people profiles',
  profileListFilterPlaceholder: 'Filter profiles...',
  profileToolsRailLabel: 'Collapsed Profile Workbench',
  recentSessionsDetail: count => `${count} profile sessions`,
  recentSessionsTitle: 'Recent Sessions',
  draftComposerDetail: 'Agent output stays tied to this profile as a README draft.',
  draftComposerTitle: 'Profile Draft Composer',
  draftTypeLabel: (_templateId, outputKind, fallback) => {
    if (outputKind === 'profile-update-draft')
      return 'Candidate profile draft'
    if (outputKind === 'candidate-screen' || outputKind === 'evidence-matrix')
      return 'Evidence organization'
    if (outputKind === 'interview-brief')
      return 'Interview brief'
    if (outputKind === 'hiring-risk')
      return 'Risk check'
    return fallback
  },
  draftTypeSelectLabel: 'Draft type',
  proposedReadmeTitle: 'Proposed README',
  draftOnly: 'Agent output stays as a profile draft until accepted in the HR app.',
  recommended: 'Recommended',
  removeCandidateMaterial: fileName => `Remove ${fileName}`,
  previewCandidateMaterial: fileName => `Preview ${fileName}`,
  closeCandidateMaterialPreview: fileName => `Close preview for ${fileName}`,
  reviewGuardrails: [
    'Evidence is tied to role-related or lifecycle-relevant criteria and source references.',
    'Missing, weak, and conflicting signals are visible.',
    'Sensitive details are not written into README.md without acceptance.',
    'Hiring and employment decisions remain explicitly human-owned.',
  ],
  revisionBlocked: 'Revision blocked',
  revisionComparisonTitle: 'Profile revision comparison',
  revisionCurrentTitle: 'Current accepted profile',
  revisionDraftTitle: 'Accepted draft',
  revisionReady: 'Ready to approve',
  revisionStatusTitle: 'Revision status',
  reviewProfilePatch: 'Inspect profile patch',
  reviewProfilePatchShort: 'Inspect',
  reviewStatus: (state) => {
    if (state === 'accepted')
      return 'profile updated'
    if (state === 'ready')
      return 'README patch ready'
    if (state === 'risk')
      return 'risk check needed'
    return 'needs evidence'
  },
  runSectionDraft: 'Run section draft',
  selectProfileFirst: 'Select a profile card before generating a draft.',
  sessionLoops: 'session loops',
  showProfileList: 'Show Profile List',
  showProfileTools: 'Show Profile Workbench',
  sourceCards: (artifacts, sessions, profileUpdates) => [
    { count: artifacts, label: 'Artifact evidence' },
    { count: sessions, label: 'Session context' },
    { count: profileUpdates, label: 'Profile updates' },
  ],
  sourcesTitle: 'Profile sources',
  suggestedToolsTitle: 'Next action',
  status: {
    evidenceMissing: 'needs evidence',
    evidenceReady: 'evidence ready',
  },
  workbenchPanelControlsLabel: 'Workbench panel controls',
  workbenchTitle: 'People Workbench',
  generateProfileDraft: 'Generate profile draft',
  generatingProfileDraft: 'Generating profile draft',
  materialReadError: 'Could not read one of the attached material files.',
  profileComposerTitle: profileName => `Complete ${profileName} candidate profile`,
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
  actionComposerDetail: profileName => `为 ${profileName} 选择下一步档案动作。`,
  actionComposerTitle: '下一步档案动作',
  acceptedExternalSectionsTitle: '已接受的外部章节',
  artifactPatches: 'README patch',
  artifactPreviewEmpty: '还没有可预览的 README patch。',
  artifactTargetLabel: 'README patch 来源',
  approveProfileRevision: '写入 README',
  approvingProfileRevision: '正在写入 README patch',
  backToReadingRoom: '返回 Reading Room',
  baseSectionEmpty: '这个章节还没有已接受内容。',
  changedSectionsTitle: '变更章节',
  collapseProfileTools: '收起档案工作台',
  commandDetail: (profileName, moment) => `${profileName}：${moment}。证据、下一步和 README 更新状态保持在同一个闭环里。`,
  contextLabel: '下一份人员档案草案上下文',
  contextPlaceholder: '描述这个人、生命周期节点、证据、开放问题，或下一份 HR 产物目标...',
  addCandidateMaterials: '添加候选人材料文件',
  attachedCandidateMaterialsLabel: '已添加的候选人材料',
  candidateMaterialLabel: '候选人材料',
  composerSafetyDetail: '生成档案草案，不会直接修改正式档案。',
  currentReadmeTitle: '当前 README',
  currentProfileEmpty: '还没有已接受的档案摘要。接受一份 README patch 后会更新 README.md。',
  currentProfileError: '当前档案摘要暂不可用。',
  currentProfileLoading: '正在加载当前档案摘要...',
  createProfileCancel: '取消',
  createProfileDialogDescription: '先创建一个本地人员档案草稿，再从 composer 添加证据或启动聚焦的档案草案。',
  createProfileDialogTitle: '创建人员档案',
  createProfileLifecycleLabel: '生命周期分组',
  createProfileNameLabel: '档案名称',
  createProfileNamePlaceholder: 'Ada Chen',
  createProfileSubmit: '创建档案',
  createProfileSummaryLabel: '初始备注',
  createProfileSummaryPlaceholder: '岗位、证据缺口、生命周期节点，或第一件需要澄清的问题...',
  emptyProfileBody: '创建人员档案工作区后，再把证据、下一步和已接受档案更新串起来。',
  emptyProfileTitle: '还没有人员档案',
  evidenceConnectors: '证据连接器',
  expandProfileTools: '展开档案工作台',
  generate: outputKind => `生成 ${outputKind}`,
  headerFallback: '人员档案',
  hideProfileList: '隐藏 Profile List',
  hideProfileTools: '隐藏档案工作台',
  humanDecisionTag: '人类决策',
  identitySnapshotTitle: '档案基线',
  latestSession: status => `最近 session ${status}。`,
  lifecycleFilterLabel: '生命周期筛选',
  lifecycleFilters: {
    all: '全部人员',
    alumni: '离职归档',
    attention: '需要关注',
    candidate: '候选人',
    employee: '在职员工',
  },
  lifecycleLabels: {
    alumni: '离职归档',
    candidate: '候选人',
    employee: '在职员工',
  },
  limitedActionsHidden: count => `另有 ${count} 个动作`,
  memoryCandidates: '档案更新',
  metrics: (profiles, artifacts, profileUpdates) => [`${profiles} 个人员档案`, `${artifacts} 个产物`, `${profileUpdates} 次档案更新`],
  metricsLabel: 'HR 工作台指标',
  moments: {
    artifactReady: '产物可写入档案',
    checkinNeeded: '需要 check-in',
    inProgress: 'session 进行中',
    intakeNeeded: '需要补齐档案',
    offboardingNeeded: '需要离职交接记录',
    reviewed: '档案已更新',
    riskReview: '需要风险检查',
  },
  newProfile: '新建人员档案',
  nextLabel: '下一步',
  nextSteps: {
    captureMemory: '记录档案更新',
    checkin: '准备 check-in',
    completeArtifact: '补齐产物',
    offboarding: '准备离职交接',
    profileSnapshot: '生成人员档案',
    requestReview: '复核 README patch',
    resolveRisk: '处理风险',
  },
  noSessionYet: '还没有 session',
  noProfilesInSection: '这个分组里还没有人员档案。',
  noRecentSessions: '这个人员档案还没有 agent session。',
  openCandidateMaterialPicker: '打开候选人材料文件选择器',
  openSession: sessionTitle => `打开 ${sessionTitle} session`,
  openLatestSession: '打开最近 session',
  openProfile: profileName => `打开 ${profileName} 档案`,
  openSessionTools: '打开 Session 工具',
  otherProfileNotesTitle: '其他档案备注',
  profileDetailsDetail: profileName => `${profileName} 的已接受 README 档案基线。`,
  profileDetailsEmpty: '选择一个人员档案后查看已接受 README 档案基线。',
  profileDetailsTitle: '当前档案摘要',
  profileHeaderDetail: (moment, nextStep) => `${moment} / ${nextStep}`,
  profileHeaderTitle: profileName => `${profileName} 人员档案`,
  profileReadingRoomDetail: profileName => `${profileName} 的已接受 README 档案基线。`,
  profileReadingRoomFallback: '按原始 README 展示已接受档案。',
  profilePatchAddedLabel: '新增',
  profilePatchBlockedTitle: '档案 patch 被阻止',
  profilePatchBlockedStripDetail: artifactTitle => `${artifactTitle} 还缺少可接受的 README 草案，暂不能写入。`,
  profilePatchBlockers: count => `${count} 个阻断项`,
  profilePatchChangedLabel: '变更',
  profilePatchChangedSections: count => `${count} 个章节变更`,
  profilePatchNoChanges: '没有检测到 README 章节变更。',
  profilePatchReadyTitle: '档案 patch 已就绪',
  profilePatchReviewDetail: artifactTitle => `先检查 ${artifactTitle} 的 README patch，再决定是否接受。`,
  profilePatchReviewTitle: '档案 Patch',
  profilePatchSectionAction: sectionTitle => `为 ${sectionTitle} 运行档案动作`,
  profilePatchSectionBadge: (sectionTitle, statusLabel) => `${sectionTitle} patch：${statusLabel}`,
  profilePatchStripDetail: artifactTitle => `${artifactTitle} 可作为 README patch 复核。`,
  profileSelectionBody: '从左侧选择一个人员档案后，再阅读已接受 README、检查最近草案，或准备一个聚焦的下一步动作。',
  profileSelectionTitle: '选择一个人员档案',
  profileBoardDetail: count => `${count} 个可见档案`,
  profileBoardLabel: '人员档案',
  profileBoardTitle: '人员档案',
  profileListDetail: count => `${count} 个可见档案`,
  profileListFilterLabel: '筛选人员档案',
  profileListFilterPlaceholder: '筛选档案...',
  profileToolsRailLabel: '已收起的档案工作台',
  recentSessionsDetail: count => `${count} 个 profile session`,
  recentSessionsTitle: 'Recent Sessions',
  draftComposerDetail: 'Agent 输出作为绑定此档案的 README 草案。',
  draftComposerTitle: '档案草案',
  draftTypeLabel: (_templateId, outputKind, fallback) => {
    if (outputKind === 'profile-update-draft')
      return '候选人档案草案'
    if (outputKind === 'candidate-screen' || outputKind === 'evidence-matrix')
      return '证据整理'
    if (outputKind === 'interview-brief')
      return '面试提纲'
    if (outputKind === 'hiring-risk')
      return '风险检查'
    return fallback
  },
  draftTypeSelectLabel: '草案类型',
  proposedReadmeTitle: '拟写入 README',
  draftOnly: 'Agent 输出会作为档案草案，直到在 HR app 中接受。',
  recommended: '建议',
  removeCandidateMaterial: fileName => `移除 ${fileName}`,
  previewCandidateMaterial: fileName => `预览 ${fileName}`,
  closeCandidateMaterialPreview: fileName => `关闭 ${fileName} 预览`,
  reviewGuardrails: [
    '证据必须绑定岗位相关或生命周期相关标准和来源引用。',
    '缺失、薄弱和冲突信号必须保持可见。',
    '敏感信息未经接受不写入 README.md。',
    '招聘和雇佣决策必须明确由人类负责。',
  ],
  revisionBlocked: '修订被阻止',
  revisionComparisonTitle: '档案修订对比',
  revisionCurrentTitle: '当前已接受档案',
  revisionDraftTitle: '待接受草案',
  revisionReady: '可批准',
  revisionStatusTitle: '修订状态',
  reviewProfilePatch: '检查 profile patch',
  reviewProfilePatchShort: '检查',
  reviewStatus: (state) => {
    if (state === 'accepted')
      return '档案已更新'
    if (state === 'ready')
      return 'README patch 待复核'
    if (state === 'risk')
      return '需要风险检查'
    return '需要证据'
  },
  runSectionDraft: '运行章节草案',
  selectProfileFirst: '先选择一个人员档案卡片，再生成草案。',
  sessionLoops: 'session 循环',
  showProfileList: '显示 Profile List',
  showProfileTools: '显示档案工作台',
  sourceCards: (artifacts, sessions, profileUpdates) => [
    { count: artifacts, label: '产物证据' },
    { count: sessions, label: 'Session 上下文' },
    { count: profileUpdates, label: '档案更新' },
  ],
  sourcesTitle: '档案来源',
  suggestedToolsTitle: '下一步动作',
  status: {
    evidenceMissing: '需要证据',
    evidenceReady: '证据就绪',
  },
  workbenchPanelControlsLabel: '工作台面板控制',
  workbenchTitle: 'People Workbench',
  generateProfileDraft: '生成档案草案',
  generatingProfileDraft: '正在生成档案草案',
  materialReadError: '无法读取其中一个候选人材料文件。',
  profileComposerTitle: profileName => `补全 ${profileName} 的候选人档案`,
}

export function getHrPeopleWorkbenchCopy(locale: HrLocale): HrWorkbenchCopy {
  if (locale === 'zh-CN')
    return zhHrCopy
  return enHrCopy
}

function zhScope(scope: HrWorkbenchAction['scope']): string {
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
