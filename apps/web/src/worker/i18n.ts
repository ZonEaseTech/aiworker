import type { CapabilityTemplate, LocalReviewVerdict, LocalSessionStatus, LocalTurnStatus, VerticalSoul } from '@zonease/aiworker-shared'

export const supportedLocales = ['en', 'zh-CN', 'ja', 'de'] as const
export type SupportedLocale = typeof supportedLocales[number]

type StatusKey = LocalSessionStatus | LocalTurnStatus | LocalReviewVerdict | 'draft'

interface StaticMessages {
  accessibility: {
    artifactSettings: string
    businessArtifactPreview: string
    closeDialog: string
    closeSettings: string
    collapseSessionDetail: string
    expandSessionDetail: string
    gridView: string
    languageSwitcher: string
    listView: string
    moreCreationOptions: string
    openSettings: string
    projectFilters: string
    refreshWorkspace: string
    searchProjects: string
    selectedSoul: string
    soulCatalog: string
    soulProjectCreator: string
    soulProjectsAndArtifacts: string
    viewMode: string
    workspace: string
  }
  app: {
    brand: string
    loading: string
    subtitle: string
    workspacePill: string
  }
  artifact: {
    defaultHint: string
    empty: string
    label: string
    loading: string
    memoryCandidates: (count: number) => string
    noSession: string
    pending: string
    review: string
    reviewCount: (count: number) => string
  }
  common: {
    available: string
    comingSoon: string
    interface: string
    notInstalled: string
    templates: string
    workspace: string
  }
  create: {
    businessContext: string
    capabilityTemplate: string
    creatingSession: string
    footer: string
    newProject: string
    projectName: string
    projectPlaceholders: Record<'default' | 'devops' | 'hr' | 'pm' | 'qa', string>
    soul: string
    submit: string
  }
  languageOptions: Record<SupportedLocale, string>
  navigation: {
    createTabs: {
      project: string
      template: string
    }
    projectTabs: {
      recent: string
      thisSoul: string
    }
    topTabs: {
      artifacts: string
      connectors: string
      domainSystems: string
      examples: string
      projects: string
      templates: string
    }
  }
  projects: {
    empty: {
      detail: (soulName: string) => string
      title: string
    }
    searchPlaceholder: string
  }
  workspace: {
    accept: string
    accepted: string
    artifactCount: (count: number) => string
    byokNeedsKey: string
    byokReady: (provider: string, model: string) => string
    configure: string
    continueSession: string
    createSession: string
    createSessionHint: (templateName: string) => string
    createWorker: string
    createWorkerHint: string
    createWorkspace: string
    createWorkspaceHint: string
    engineLoading: string
    engineMissing: (engineId: string) => string
    engineNotInstalled: (engineName: string) => string
    engineReadyDetail: (engineName: string) => string
    engineRole: string
    engineStarting: string
    eventCount: (count: number) => string
    eventStream: string
    executionReady: string
    followUpInput: string
    followUpPlaceholder: string
    memoryCandidates: string
    noEvents: string
    noMemoryCandidates: string
    noSelectionDetail: string
    noSelectionTitle: string
    noTurns: string
    operatorRole: string
    proposed: string
    reject: string
    rejected: string
    requestReview: string
    requestingReview: string
    reviewRubric: string
    reviewWaiting: string
    sendTurn: string
    sendingTurn: string
    backToSoulHome: string
    backToWorkerHome: string
    backToWorkspace: string
    currentSession: string
    currentWorker: string
    currentWorkspace: string
    newWorkspace: string
    noWorker: string
    noWorkspaceSessions: string
    otherWorkspaces: string
    selectedCapability: string
    selectedWorkspace: string
    sessionDetail: string
    latest: string
    soulCatalog: string
    turnCount: (count: number) => string
    turnHistory: string
    updated: (when: string) => string
    workspaceNavigation: string
    workspaceSessions: string
    workspaceKicker: string
    workspaceList: string
    workspaceTitle: (soulName: string) => string
    workerEngine: string
    workerId: string
    workerList: string
    workerListHint: string
    workerName: string
    workerSoul: string
    workerStatus: string
  }
  relativeTime: {
    daysAgo: (days: number) => string
    hoursAgo: (hours: number) => string
    minutesAgo: (minutes: number) => string
    now: string
  }
  settings: {
    about: {
      executionMode: string
      hint: string
      selectedEngine: string
      title: string
      updated: string
      version: string
    }
    appearance: {
      dark: string
      hint: string
      light: string
      system: string
      title: string
    }
    autosave: {
      failed: string
      saved: string
      saving: string
    }
    byok: {
      apiKeyRef: string
      baseUrl: string
      hint: string
      model: string
      provider: string
      title: string
    }
    connectors: {
      configured: string
      hint: string
      notConfigured: string
      title: string
    }
    dialog: {
      kicker: string
      subtitle: string
      title: string
    }
    engine: {
      availableCount: (count: number) => string
      hint: string
      testing: string
      test: string
      rescan: string
      title: string
    }
    externalMcp: {
      hint: string
      placeholder: string
      title: string
    }
    language: {
      hint: string
      title: string
    }
    localMcp: {
      hint: string
      title: string
      toggle: string
    }
    nav: {
      about: string
      aboutDetail: string
      appearance: string
      appearanceDetail: string
      connectors: string
      connectorsDetail: string
      execution: string
      executionDetail: string
      externalMcp: string
      externalMcpDetail: string
      language: string
      languageDetail: string
      localMcp: string
      localMcpDetail: string
      soulPacks: string
      soulPacksDetail: string
    }
    soulPacks: {
      hint: string
      title: string
    }
  }
  statuses: Record<StatusKey, string>
}

interface BuiltinSoulCopy {
  description: string
  domain: string
  name: string
}

interface BuiltinTemplateCopy {
  description: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  reviewRubric: readonly string[]
}

const en = {
  accessibility: {
    artifactSettings: 'Open artifact settings',
    businessArtifactPreview: 'Business artifact preview',
    closeDialog: 'Close dialog',
    closeSettings: 'Close settings',
    collapseSessionDetail: 'Collapse session detail',
    expandSessionDetail: 'Expand session detail',
    gridView: 'Grid view',
    languageSwitcher: 'Workspace language',
    listView: 'List view',
    moreCreationOptions: 'More project creation options',
    openSettings: 'Open settings',
    projectFilters: 'Project filters',
    refreshWorkspace: 'Refresh workspace',
    searchProjects: 'Search projects',
    selectedSoul: 'Selected Soul',
    soulCatalog: 'Soul catalog',
    soulProjectCreator: 'Soul project creator',
    soulProjectsAndArtifacts: 'Soul projects and artifacts',
    viewMode: 'View mode',
    workspace: 'Workspace',
  },
  app: {
    brand: 'AIWorker',
    loading: 'Loading Soul workspace...',
    subtitle: 'Soul, capability template, project, artifact',
    workspacePill: 'Soul Workspace',
  },
  artifact: {
    defaultHint: 'Select or create a project to inspect its artifact.',
    empty: 'Artifacts appear here after a session turn.',
    label: 'Artifact',
    loading: 'Loading artifact...',
    memoryCandidates: count => `${count} memory candidates`,
    noSession: 'No session',
    pending: 'artifact pending',
    review: 'Review',
    reviewCount: count => `${count} reviews in this Soul`,
  },
  common: {
    available: 'available',
    comingSoon: 'coming soon',
    interface: 'Interface',
    notInstalled: 'not installed',
    templates: 'templates',
    workspace: 'Workspace',
  },
  create: {
    businessContext: 'Business context',
    capabilityTemplate: 'Capability template',
    creatingSession: 'Creating session...',
    footer: 'Sessions stay in this Soul workspace by default.',
    newProject: 'New Soul project',
    projectName: 'Project name',
    projectPlaceholders: {
      default: 'Checkout deploy checklist',
      devops: 'Checkout deploy checklist',
      hr: 'Senior backend candidate screen',
      pm: 'Payments onboarding PRD',
      qa: 'Release 1.2 regression gate',
    },
    soul: 'Soul',
    submit: 'Create workspace session',
  },
  languageOptions: {
    'de': 'Deutsch',
    'en': 'English',
    'ja': '日本語',
    'zh-CN': '简体中文',
  },
  navigation: {
    createTabs: {
      project: 'Project',
      template: 'Template',
    },
    projectTabs: {
      recent: 'Recent',
      thisSoul: 'This Soul',
    },
    topTabs: {
      artifacts: 'Artifacts',
      connectors: 'Connectors',
      domainSystems: 'Domain systems',
      examples: 'Examples',
      projects: 'Projects',
      templates: 'Templates',
    },
  },
  projects: {
    empty: {
      detail: soulName => `Create a ${soulName} project to generate the first business artifact.`,
      title: 'No projects yet',
    },
    searchPlaceholder: 'Search projects...',
  },
  workspace: {
    accept: 'Accept',
    accepted: 'Accepted',
    artifactCount: count => `${count} artifacts`,
    byokNeedsKey: 'BYOK needs a provider, model, and API key reference before session turns can run.',
    byokReady: (provider, model) => `${provider} ${model} is configured for session turns.`,
    configure: 'Configure',
    continueSession: 'Continue session',
    createSession: 'Create session',
    createSessionHint: templateName => `Start a ${templateName} session in this workspace.`,
    createWorker: 'Create worker',
    createWorkerHint: 'Bind a Soul to a worker before creating workspaces.',
    createWorkspace: 'Create workspace',
    createWorkspaceHint: 'Create a worker-scoped workspace. Sessions are created inside a workspace.',
    engineLoading: 'Checking execution settings...',
    engineMissing: engineId => `${engineId} is not known in local settings.`,
    engineNotInstalled: engineName => `${engineName} is selected but not installed on PATH.`,
    engineReadyDetail: engineName => `${engineName} is ready for session turns.`,
    engineRole: 'AIWorker Engine',
    engineStarting: 'Engine is starting the session turn.',
    eventCount: count => `${count} events`,
    eventStream: 'Session events',
    executionReady: 'Execution',
    followUpInput: 'Follow-up turn',
    followUpPlaceholder: 'Ask the selected Soul to refine the artifact, add evidence, or address review gaps...',
    memoryCandidates: 'Memory candidates',
    noEvents: 'Events appear after a session turn starts.',
    noMemoryCandidates: 'No memory candidates for this workspace yet.',
    noSelectionDetail: 'Create or select a workspace to inspect the session, artifact, review, and memory candidates.',
    noSelectionTitle: 'No workspace selected',
    noTurns: 'No turns recorded for this session.',
    operatorRole: 'Operator',
    proposed: 'Proposed',
    reject: 'Reject',
    rejected: 'Rejected',
    requestReview: 'Request review',
    requestingReview: 'Requesting review...',
    reviewRubric: 'Review rubric',
    reviewWaiting: 'Generate an artifact before requesting review.',
    sendTurn: 'Send turn',
    sendingTurn: 'Sending turn...',
    backToSoulHome: 'Back to Soul home',
    backToWorkerHome: 'Back to worker',
    backToWorkspace: 'Back to workspace',
    currentSession: 'Current session',
    currentWorker: 'Current worker',
    currentWorkspace: 'Current workspace',
    newWorkspace: 'New workspace',
    noWorker: 'No worker',
    noWorkspaceSessions: 'No sessions in this workspace yet.',
    otherWorkspaces: 'Other workspaces',
    selectedCapability: 'Selected capability',
    selectedWorkspace: 'Selected workspace',
    sessionDetail: 'Session',
    latest: 'Latest',
    soulCatalog: 'Soul catalog',
    turnCount: count => `${count} turns`,
    turnHistory: 'Turn history',
    updated: when => `Updated ${when}`,
    workspaceNavigation: 'Workspace navigation',
    workspaceSessions: 'Workspace sessions',
    workspaceKicker: 'WORKER WORKSPACE',
    workspaceList: 'Workspaces',
    workspaceTitle: soulName => `${soulName} workspaces`,
    workerEngine: 'Default engine',
    workerId: 'Worker ID',
    workerList: 'Workers',
    workerListHint: 'Select a worker first, then manage its workspaces.',
    workerName: 'Worker name',
    workerSoul: 'Soul binding',
    workerStatus: 'Worker status',
  },
  relativeTime: {
    daysAgo: days => `${days}d ago`,
    hoursAgo: hours => `${hours}h ago`,
    minutesAgo: minutes => `${minutes}m ago`,
    now: 'now',
  },
  settings: {
    about: {
      executionMode: 'Execution mode',
      hint: 'Runtime details are read from the workspace daemon.',
      selectedEngine: 'Selected engine',
      title: 'Local workspace runtime',
      updated: 'Updated',
      version: 'Version',
    },
    appearance: {
      dark: 'Dark',
      hint: 'Choose the presentation mode for this workspace UI.',
      light: 'Light',
      system: 'System',
      title: 'Appearance',
    },
    autosave: {
      failed: 'Save failed',
      saved: 'All changes saved',
      saving: 'Saving',
    },
    byok: {
      apiKeyRef: 'API key ref',
      baseUrl: 'Base URL',
      hint: 'The API key field stores a reference. Use env:NAME to resolve a key from the daemon environment.',
      model: 'Model',
      provider: 'Provider',
      title: 'BYOK provider',
    },
    connectors: {
      configured: 'Configured',
      hint: 'Enable connector entries when the team system is ready to provide evidence for Soul projects.',
      notConfigured: 'Not configured',
      title: 'Connectors',
    },
    dialog: {
      kicker: 'AIWORKER SETTINGS',
      subtitle: 'Choose how session turns execute, which team systems are available, and how the workspace presents language and appearance.',
      title: 'Configure Soul workspace',
    },
    engine: {
      availableCount: count => `${count} available`,
      hint: 'Installed state comes from the workspace daemon PATH scan. Session turns require a configured external engine or BYOK provider.',
      testing: 'Testing engine...',
      test: 'Test',
      rescan: 'Rescan',
      title: 'Local CLI engines',
    },
    externalMcp: {
      hint: 'Register command lines for external evidence tools. Secrets must stay in the external tool or environment.',
      placeholder: 'command --arg value',
      title: 'External MCP servers',
    },
    language: {
      hint: 'Saved to the workspace daemon settings record.',
      title: 'Language',
    },
    localMcp: {
      hint: 'Expose workspace context to an external engine that supports MCP.',
      title: 'AIWorker workspace MCP server',
      toggle: 'Local workspace MCP',
    },
    nav: {
      about: 'About',
      aboutDetail: 'Runtime details',
      appearance: 'Appearance',
      appearanceDetail: 'System / light / dark',
      connectors: 'Connectors',
      connectorsDetail: 'Team system access',
      execution: 'Execution',
      executionDetail: 'Local CLI / BYOK',
      externalMcp: 'External MCP',
      externalMcpDetail: 'Additional evidence tools',
      language: 'Language',
      languageDetail: 'Interface language',
      localMcp: 'Local MCP',
      localMcpDetail: 'Workspace context server',
      soulPacks: 'Soul packs',
      soulPacksDetail: 'HR / PM / QA / DevOps',
    },
    soulPacks: {
      hint: 'Built-in Souls define the available domain systems and capability templates for this workspace.',
      title: 'Soul packs',
    },
  },
  statuses: {
    active: 'Active',
    cancelled: 'Cancelled',
    completed: 'Completed',
    draft: 'Draft',
    failed: 'Failed',
    fail: 'Fail',
    needs_review: 'Needs review',
    pass: 'Pass',
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    warn: 'Warn',
  },
} satisfies StaticMessages

const zhCN = {
  accessibility: {
    artifactSettings: '打开产物设置',
    businessArtifactPreview: '业务产物预览',
    closeDialog: '关闭对话框',
    closeSettings: '关闭设置',
    collapseSessionDetail: '收起会话详情',
    expandSessionDetail: '展开会话详情',
    gridView: '网格视图',
    languageSwitcher: '工作区语言',
    listView: '列表视图',
    moreCreationOptions: '更多项目创建选项',
    openSettings: '打开设置',
    projectFilters: '项目筛选',
    refreshWorkspace: '刷新工作区',
    searchProjects: '搜索项目',
    selectedSoul: '已选 Soul',
    soulCatalog: 'Soul 目录',
    soulProjectCreator: 'Soul 项目创建器',
    soulProjectsAndArtifacts: 'Soul 项目与产物',
    viewMode: '视图模式',
    workspace: '工作区',
  },
  app: {
    brand: 'AIWorker',
    loading: '正在加载 Soul 工作区...',
    subtitle: 'Soul、能力模板、项目、产物',
    workspacePill: 'Soul 工作区',
  },
  artifact: {
    defaultHint: '选择或创建项目以查看业务产物。',
    empty: '项目运行后，产物会显示在这里。',
    label: '产物',
    loading: '正在加载产物...',
    memoryCandidates: count => `${count} 条记忆候选`,
    noSession: '暂无会话',
    pending: '产物待生成',
    review: '评审',
    reviewCount: count => `此 Soul 中有 ${count} 条评审`,
  },
  common: {
    available: '可用',
    comingSoon: '即将推出',
    interface: '界面',
    notInstalled: '未安装',
    templates: '个模板',
    workspace: '工作区',
  },
  create: {
    businessContext: '业务上下文',
    capabilityTemplate: '能力模板',
    creatingSession: '正在创建会话...',
    footer: '会话默认保留在当前 Soul 工作区内。',
    newProject: '新建 Soul 项目',
    projectName: '项目名称',
    projectPlaceholders: {
      default: '结账发布检查清单',
      devops: '结账发布检查清单',
      hr: '高级后端候选人初筛',
      pm: '支付入门 PRD',
      qa: '1.2 版本回归门禁',
    },
    soul: 'Soul',
    submit: '创建工作区会话',
  },
  languageOptions: en.languageOptions,
  navigation: {
    createTabs: {
      project: '项目',
      template: '模板',
    },
    projectTabs: {
      recent: '最近',
      thisSoul: '当前 Soul',
    },
    topTabs: {
      artifacts: '产物',
      connectors: '连接器',
      domainSystems: '领域系统',
      examples: '示例',
      projects: '项目',
      templates: '模板',
    },
  },
  projects: {
    empty: {
      detail: soulName => `创建一个 ${soulName} 项目，生成第一份业务产物。`,
      title: '还没有项目',
    },
    searchPlaceholder: '搜索项目...',
  },
  workspace: {
    accept: '采纳',
    accepted: '已采纳',
    artifactCount: count => `${count} 个产物`,
    byokNeedsKey: 'BYOK 需要提供方、模型和 API key 引用后才能运行 session turn。',
    byokReady: (provider, model) => `${provider} ${model} 已可用于 session turn。`,
    configure: '配置',
    continueSession: '继续会话',
    createSession: '创建会话',
    createSessionHint: templateName => `在此工作区中启动一个 ${templateName} 会话。`,
    createWorker: '创建 worker',
    createWorkerHint: '先将 Soul 绑定到 worker，再创建工作区。',
    createWorkspace: '创建工作区',
    createWorkspaceHint: '创建归属当前 worker 的工作区；会话在工作区内创建。',
    engineLoading: '正在检查执行设置...',
    engineMissing: engineId => `本地设置中没有 ${engineId}。`,
    engineNotInstalled: engineName => `已选择 ${engineName}，但 PATH 中未安装。`,
    engineReadyDetail: engineName => `${engineName} 可用于 session turn。`,
    engineRole: 'AIWorker 引擎',
    engineStarting: '引擎正在启动本轮会话。',
    eventCount: count => `${count} 条事件`,
    eventStream: '会话事件',
    executionReady: '执行',
    followUpInput: '后续 turn',
    followUpPlaceholder: '让当前 Soul 细化产物、补充证据或处理评审缺口...',
    memoryCandidates: '记忆候选',
    noEvents: 'session turn 启动后会显示事件。',
    noMemoryCandidates: '此工作区还没有记忆候选。',
    noSelectionDetail: '创建或选择一个工作区，查看会话、产物、评审和记忆候选。',
    noSelectionTitle: '未选择工作区',
    noTurns: '此会话还没有 turn 记录。',
    operatorRole: '操作者',
    proposed: '待定',
    reject: '拒绝',
    rejected: '已拒绝',
    requestReview: '请求评审',
    requestingReview: '正在请求评审...',
    reviewRubric: '评审准则',
    reviewWaiting: '先生成产物，然后再请求评审。',
    sendTurn: '发送 turn',
    sendingTurn: '正在发送 turn...',
    backToSoulHome: '返回 Soul 首页',
    backToWorkerHome: '返回 worker',
    backToWorkspace: '返回工作区',
    currentSession: '当前会话',
    currentWorker: '当前 worker',
    currentWorkspace: '当前工作区',
    newWorkspace: '新建工作区',
    noWorker: '暂无 worker',
    noWorkspaceSessions: '此工作区还没有会话。',
    otherWorkspaces: '其他工作区',
    selectedCapability: '已选能力',
    selectedWorkspace: '已选工作区',
    sessionDetail: '会话',
    latest: '最新',
    soulCatalog: 'Soul 目录',
    turnCount: count => `${count} 轮 turn`,
    turnHistory: 'Turn 历史',
    updated: when => `更新于 ${when}`,
    workspaceNavigation: '工作区导航',
    workspaceSessions: '工作区会话',
    workspaceKicker: 'WORKER 工作区',
    workspaceList: '工作区',
    workspaceTitle: soulName => `${soulName} 工作区`,
    workerEngine: '默认引擎',
    workerId: 'Worker ID',
    workerList: 'Worker 列表',
    workerListHint: '先选择 worker，再管理它的工作区。',
    workerName: 'Worker 名称',
    workerSoul: 'Soul 绑定',
    workerStatus: 'Worker 状态',
  },
  relativeTime: {
    daysAgo: days => `${days} 天前`,
    hoursAgo: hours => `${hours} 小时前`,
    minutesAgo: minutes => `${minutes} 分钟前`,
    now: '刚刚',
  },
  settings: {
    about: {
      executionMode: '执行模式',
      hint: '运行时详情来自工作区 daemon。',
      selectedEngine: '已选引擎',
      title: '本地工作区运行时',
      updated: '更新时间',
      version: '版本',
    },
    appearance: {
      dark: '深色',
      hint: '选择此工作区界面的呈现模式。',
      light: '浅色',
      system: '跟随系统',
      title: '外观',
    },
    autosave: {
      failed: '保存失败',
      saved: '所有更改已保存',
      saving: '正在保存',
    },
    byok: {
      apiKeyRef: 'API key 引用',
      baseUrl: 'Base URL',
      hint: 'API key 字段只保存引用。使用 env:NAME 从 daemon 环境解析密钥。',
      model: '模型',
      provider: '提供方',
      title: 'BYOK 提供方',
    },
    connectors: {
      configured: '已配置',
      hint: '当团队系统准备好为 Soul 项目提供证据时，再启用对应连接器。',
      notConfigured: '未配置',
      title: '连接器',
    },
    dialog: {
      kicker: 'AIWORKER 设置',
      subtitle: '选择会话 turn 执行方式、可用团队系统，以及工作区语言和外观。',
      title: '配置 Soul 工作区',
    },
    engine: {
      availableCount: count => `${count} 个可用`,
      hint: '安装状态来自工作区 daemon 的 PATH 扫描。会话 turn 需要配置外部引擎或 BYOK 提供方。',
      testing: '正在测试引擎...',
      test: '测试',
      rescan: '重新扫描',
      title: '本地 CLI 引擎',
    },
    externalMcp: {
      hint: '登记外部证据工具的命令行。密钥必须保留在外部工具或环境中。',
      placeholder: 'command --arg value',
      title: '外部 MCP 服务器',
    },
    language: {
      hint: '保存到工作区 daemon 的设置记录中。',
      title: '语言',
    },
    localMcp: {
      hint: '向支持 MCP 的外部引擎暴露工作区上下文。',
      title: 'AIWorker 工作区 MCP 服务器',
      toggle: '本地工作区 MCP',
    },
    nav: {
      about: '关于',
      aboutDetail: '运行时详情',
      appearance: '外观',
      appearanceDetail: '系统 / 浅色 / 深色',
      connectors: '连接器',
      connectorsDetail: '团队系统访问',
      execution: '执行',
      executionDetail: '本地 CLI / BYOK',
      externalMcp: '外部 MCP',
      externalMcpDetail: '额外证据工具',
      language: '语言',
      languageDetail: '界面语言',
      localMcp: '本地 MCP',
      localMcpDetail: '工作区上下文服务器',
      soulPacks: 'Soul 包',
      soulPacksDetail: 'HR / PM / QA / DevOps',
    },
    soulPacks: {
      hint: '内置 Souls 定义当前工作区可用的领域系统和能力模板。',
      title: 'Soul 包',
    },
  },
  statuses: {
    active: '活跃',
    cancelled: '已取消',
    completed: '已完成',
    draft: '草稿',
    failed: '失败',
    fail: '失败',
    needs_review: '待评审',
    pass: '通过',
    queued: '排队中',
    running: '运行中',
    succeeded: '成功',
    warn: '警告',
  },
} satisfies StaticMessages

const ja = {
  accessibility: {
    artifactSettings: '成果物設定を開く',
    businessArtifactPreview: '業務成果物プレビュー',
    closeDialog: 'ダイアログを閉じる',
    closeSettings: '設定を閉じる',
    collapseSessionDetail: 'セッション詳細を折りたたむ',
    expandSessionDetail: 'セッション詳細を展開',
    gridView: 'グリッド表示',
    languageSwitcher: 'ワークスペースの言語',
    listView: 'リスト表示',
    moreCreationOptions: 'プロジェクト作成オプションをさらに表示',
    openSettings: '設定を開く',
    projectFilters: 'プロジェクトフィルター',
    refreshWorkspace: 'ワークスペースを更新',
    searchProjects: 'プロジェクトを検索',
    selectedSoul: '選択中の Soul',
    soulCatalog: 'Soul カタログ',
    soulProjectCreator: 'Soul プロジェクト作成',
    soulProjectsAndArtifacts: 'Soul プロジェクトと成果物',
    viewMode: '表示モード',
    workspace: 'ワークスペース',
  },
  app: {
    brand: 'AIWorker',
    loading: 'Soul ワークスペースを読み込み中...',
    subtitle: 'Soul、能力テンプレート、プロジェクト、成果物',
    workspacePill: 'Soul ワークスペース',
  },
  artifact: {
    defaultHint: '成果物を確認するには、プロジェクトを選択または作成してください。',
    empty: 'プロジェクト実行後、成果物がここに表示されます。',
    label: '成果物',
    loading: '成果物を読み込み中...',
    memoryCandidates: count => `メモリー候補 ${count} 件`,
    noSession: 'セッションなし',
    pending: '成果物待ち',
    review: 'レビュー',
    reviewCount: count => `この Soul のレビュー ${count} 件`,
  },
  common: {
    available: '利用可能',
    comingSoon: '近日対応',
    interface: 'インターフェース',
    notInstalled: '未インストール',
    templates: 'テンプレート',
    workspace: 'ワークスペース',
  },
  create: {
    businessContext: '業務コンテキスト',
    capabilityTemplate: '能力テンプレート',
    creatingSession: 'セッションを作成中...',
    footer: 'セッションは既定でこの Soul ワークスペース内に保持されます。',
    newProject: '新しい Soul プロジェクト',
    projectName: 'プロジェクト名',
    projectPlaceholders: {
      default: 'チェックアウト配備チェックリスト',
      devops: 'チェックアウト配備チェックリスト',
      hr: 'シニアバックエンド候補者スクリーニング',
      pm: '決済オンボーディング PRD',
      qa: 'リリース 1.2 回帰ゲート',
    },
    soul: 'Soul',
    submit: 'ワークスペースセッションを作成',
  },
  languageOptions: en.languageOptions,
  navigation: {
    createTabs: {
      project: 'プロジェクト',
      template: 'テンプレート',
    },
    projectTabs: {
      recent: '最近',
      thisSoul: 'この Soul',
    },
    topTabs: {
      artifacts: '成果物',
      connectors: 'コネクター',
      domainSystems: 'ドメインシステム',
      examples: '例',
      projects: 'プロジェクト',
      templates: 'テンプレート',
    },
  },
  projects: {
    empty: {
      detail: soulName => `${soulName} プロジェクトを作成して、最初の業務成果物を生成します。`,
      title: 'プロジェクトはまだありません',
    },
    searchPlaceholder: 'プロジェクトを検索...',
  },
  workspace: {
    accept: '承認',
    accepted: '承認済み',
    artifactCount: count => `成果物 ${count} 件`,
    byokNeedsKey: 'BYOK にはプロバイダー、モデル、API キー参照が必要です。',
    byokReady: (provider, model) => `${provider} ${model} はセッションターンで利用できます。`,
    configure: '設定',
    continueSession: 'セッションを続ける',
    createSession: 'セッションを作成',
    createSessionHint: templateName => `このワークスペースで ${templateName} セッションを開始します。`,
    createWorker: 'worker を作成',
    createWorkerHint: 'ワークスペース作成前に Soul を worker にバインドします。',
    createWorkspace: 'ワークスペースを作成',
    createWorkspaceHint: '現在の worker に属するワークスペースを作成します。セッションはワークスペース内で作成します。',
    engineLoading: '実行設定を確認中...',
    engineMissing: engineId => `${engineId} はローカル設定にありません。`,
    engineNotInstalled: engineName => `${engineName} が選択されていますが PATH にありません。`,
    engineReadyDetail: engineName => `${engineName} はセッションターンで利用できます。`,
    engineRole: 'AIWorker エンジン',
    engineStarting: 'エンジンがセッションターンを開始しています。',
    eventCount: count => `イベント ${count} 件`,
    eventStream: 'セッションイベント',
    executionReady: '実行',
    followUpInput: 'フォローアップターン',
    followUpPlaceholder: '成果物の改善、証拠追加、レビューギャップ対応を依頼...',
    memoryCandidates: 'メモリー候補',
    noEvents: 'セッションターン開始後にイベントが表示されます。',
    noMemoryCandidates: 'このワークスペースにはまだメモリー候補がありません。',
    noSelectionDetail: 'ワークスペースを作成または選択して、セッション、成果物、レビュー、メモリー候補を確認します。',
    noSelectionTitle: 'ワークスペース未選択',
    noTurns: 'このセッションにはターンがありません。',
    operatorRole: 'オペレーター',
    proposed: '提案中',
    reject: '却下',
    rejected: '却下済み',
    requestReview: 'レビューを依頼',
    requestingReview: 'レビュー依頼中...',
    reviewRubric: 'レビュー基準',
    reviewWaiting: 'レビュー依頼の前に成果物を生成してください。',
    sendTurn: 'ターン送信',
    sendingTurn: '送信中...',
    backToSoulHome: 'Soul ホームに戻る',
    backToWorkerHome: 'worker に戻る',
    backToWorkspace: 'ワークスペースに戻る',
    currentSession: '現在のセッション',
    currentWorker: '現在の worker',
    currentWorkspace: '現在のワークスペース',
    newWorkspace: '新規ワークスペース',
    noWorker: 'worker なし',
    noWorkspaceSessions: 'このワークスペースにはまだセッションがありません。',
    otherWorkspaces: '他のワークスペース',
    selectedCapability: '選択中の能力',
    selectedWorkspace: '選択中のワークスペース',
    sessionDetail: 'セッション',
    latest: '最新',
    soulCatalog: 'Soul カタログ',
    turnCount: count => `ターン ${count} 件`,
    turnHistory: 'ターン履歴',
    updated: when => `更新 ${when}`,
    workspaceNavigation: 'ワークスペースナビゲーション',
    workspaceSessions: 'ワークスペースセッション',
    workspaceKicker: 'WORKER ワークスペース',
    workspaceList: 'ワークスペース',
    workspaceTitle: soulName => `${soulName} ワークスペース`,
    workerEngine: '既定エンジン',
    workerId: 'Worker ID',
    workerList: 'Worker 一覧',
    workerListHint: '先に worker を選択してからワークスペースを管理します。',
    workerName: 'Worker 名',
    workerSoul: 'Soul バインド',
    workerStatus: 'Worker ステータス',
  },
  relativeTime: {
    daysAgo: days => `${days}日前`,
    hoursAgo: hours => `${hours}時間前`,
    minutesAgo: minutes => `${minutes}分前`,
    now: '今',
  },
  settings: {
    about: {
      executionMode: '実行モード',
      hint: '実行時の詳細はワークスペース daemon から読み取られます。',
      selectedEngine: '選択中のエンジン',
      title: 'ローカルワークスペース実行環境',
      updated: '更新日時',
      version: 'バージョン',
    },
    appearance: {
      dark: 'ダーク',
      hint: 'このワークスペース UI の表示モードを選択します。',
      light: 'ライト',
      system: 'システム',
      title: '外観',
    },
    autosave: {
      failed: '保存に失敗しました',
      saved: 'すべての変更を保存しました',
      saving: '保存中',
    },
    byok: {
      apiKeyRef: 'API キー参照',
      baseUrl: 'Base URL',
      hint: 'API キーフィールドには参照のみを保存します。env:NAME で daemon 環境からキーを解決します。',
      model: 'モデル',
      provider: 'プロバイダー',
      title: 'BYOK プロバイダー',
    },
    connectors: {
      configured: '設定済み',
      hint: 'チームシステムが Soul プロジェクトの証拠を提供できる状態になったら、コネクターを有効にします。',
      notConfigured: '未設定',
      title: 'コネクター',
    },
    dialog: {
      kicker: 'AIWORKER 設定',
      subtitle: 'セッションターンの実行方法、利用可能なチームシステム、ワークスペースの言語と外観を選択します。',
      title: 'Soul ワークスペースを設定',
    },
    engine: {
      availableCount: count => `${count} 件利用可能`,
      hint: 'インストール状態はワークスペース daemon の PATH スキャンから取得します。セッションターンには外部エンジンまたは BYOK プロバイダーが必要です。',
      testing: 'エンジンをテスト中...',
      test: 'テスト',
      rescan: '再スキャン',
      title: 'ローカル CLI エンジン',
    },
    externalMcp: {
      hint: '外部証拠ツールのコマンドラインを登録します。シークレットは外部ツールまたは環境に保持してください。',
      placeholder: 'command --arg value',
      title: '外部 MCP サーバー',
    },
    language: {
      hint: 'ワークスペース daemon の設定レコードに保存されます。',
      title: '言語',
    },
    localMcp: {
      hint: 'MCP 対応の外部エンジンへワークスペースコンテキストを公開します。',
      title: 'AIWorker ワークスペース MCP サーバー',
      toggle: 'ローカルワークスペース MCP',
    },
    nav: {
      about: '概要',
      aboutDetail: '実行時の詳細',
      appearance: '外観',
      appearanceDetail: 'システム / ライト / ダーク',
      connectors: 'コネクター',
      connectorsDetail: 'チームシステムアクセス',
      execution: '実行',
      executionDetail: 'ローカル CLI / BYOK',
      externalMcp: '外部 MCP',
      externalMcpDetail: '追加の証拠ツール',
      language: '言語',
      languageDetail: 'インターフェース言語',
      localMcp: 'ローカル MCP',
      localMcpDetail: 'ワークスペースコンテキストサーバー',
      soulPacks: 'Soul パック',
      soulPacksDetail: 'HR / PM / QA / DevOps',
    },
    soulPacks: {
      hint: '内蔵 Souls は、このワークスペースで利用できるドメインシステムと能力テンプレートを定義します。',
      title: 'Soul パック',
    },
  },
  statuses: {
    active: 'アクティブ',
    cancelled: 'キャンセル済み',
    completed: '完了',
    draft: '下書き',
    failed: '失敗',
    fail: '失敗',
    needs_review: 'レビュー待ち',
    pass: '合格',
    queued: '待機中',
    running: '実行中',
    succeeded: '成功',
    warn: '警告',
  },
} satisfies StaticMessages

const de = {
  accessibility: {
    artifactSettings: 'Artefakteinstellungen öffnen',
    businessArtifactPreview: 'Vorschau des Geschäftsartefakts',
    closeDialog: 'Dialog schließen',
    closeSettings: 'Einstellungen schließen',
    collapseSessionDetail: 'Sessiondetails einklappen',
    expandSessionDetail: 'Sessiondetails ausklappen',
    gridView: 'Rasteransicht',
    languageSwitcher: 'Sprache des Workspace',
    listView: 'Listenansicht',
    moreCreationOptions: 'Weitere Optionen zur Projekterstellung',
    openSettings: 'Einstellungen öffnen',
    projectFilters: 'Projektfilter',
    refreshWorkspace: 'Workspace aktualisieren',
    searchProjects: 'Projekte suchen',
    selectedSoul: 'Ausgewählte Soul',
    soulCatalog: 'Soul-Katalog',
    soulProjectCreator: 'Soul-Projekt erstellen',
    soulProjectsAndArtifacts: 'Soul-Projekte und Artefakte',
    viewMode: 'Ansichtsmodus',
    workspace: 'Workspace',
  },
  app: {
    brand: 'AIWorker',
    loading: 'Soul-Workspace wird geladen...',
    subtitle: 'Soul, Fähigkeitentemplate, Projekt, Artefakt',
    workspacePill: 'Soul-Workspace',
  },
  artifact: {
    defaultHint: 'Wähle oder erstelle ein Projekt, um das Artefakt zu prüfen.',
    empty: 'Artefakte erscheinen hier nach einem Session-Turn.',
    label: 'Artefakt',
    loading: 'Artefakt wird geladen...',
    memoryCandidates: count => `${count} Memory-Kandidaten`,
    noSession: 'Keine Session',
    pending: 'Artefakt ausstehend',
    review: 'Review',
    reviewCount: count => `${count} Reviews in dieser Soul`,
  },
  common: {
    available: 'verfügbar',
    comingSoon: 'bald verfügbar',
    interface: 'Oberfläche',
    notInstalled: 'nicht installiert',
    templates: 'Templates',
    workspace: 'Workspace',
  },
  create: {
    businessContext: 'Geschäftskontext',
    capabilityTemplate: 'Fähigkeitentemplate',
    creatingSession: 'Session wird erstellt...',
    footer: 'Sessions bleiben standardmäßig in diesem Soul-Workspace.',
    newProject: 'Neues Soul-Projekt',
    projectName: 'Projektname',
    projectPlaceholders: {
      default: 'Deployment-Checkliste für Checkout',
      devops: 'Deployment-Checkliste für Checkout',
      hr: 'Screening für Senior-Backend-Kandidat',
      pm: 'PRD für Payments-Onboarding',
      qa: 'Release-1.2-Regressionsgate',
    },
    soul: 'Soul',
    submit: 'Workspace-Session erstellen',
  },
  languageOptions: en.languageOptions,
  navigation: {
    createTabs: {
      project: 'Projekt',
      template: 'Template',
    },
    projectTabs: {
      recent: 'Aktuell',
      thisSoul: 'Diese Soul',
    },
    topTabs: {
      artifacts: 'Artefakte',
      connectors: 'Konnektoren',
      domainSystems: 'Domänensysteme',
      examples: 'Beispiele',
      projects: 'Projekte',
      templates: 'Templates',
    },
  },
  projects: {
    empty: {
      detail: soulName => `Erstelle ein ${soulName}-Projekt, um das erste Geschäftsartefakt zu erzeugen.`,
      title: 'Noch keine Projekte',
    },
    searchPlaceholder: 'Projekte suchen...',
  },
  workspace: {
    accept: 'Annehmen',
    accepted: 'Angenommen',
    artifactCount: count => `${count} Artefakte`,
    byokNeedsKey: 'BYOK benötigt Provider, Modell und API-Key-Referenz, bevor Session-Turns laufen können.',
    byokReady: (provider, model) => `${provider} ${model} ist für Session-Turns konfiguriert.`,
    configure: 'Konfigurieren',
    continueSession: 'Session fortsetzen',
    createSession: 'Session erstellen',
    createSessionHint: templateName => `Startet eine ${templateName}-Session in diesem Workspace.`,
    createWorker: 'Worker erstellen',
    createWorkerHint: 'Binde zuerst eine Soul an einen Worker, bevor du Workspaces erstellst.',
    createWorkspace: 'Workspace erstellen',
    createWorkspaceHint: 'Erstellt einen Workspace für den aktuellen Worker. Sessions werden im Workspace erstellt.',
    engineLoading: 'Ausführungseinstellungen werden geprüft...',
    engineMissing: engineId => `${engineId} ist in den lokalen Einstellungen unbekannt.`,
    engineNotInstalled: engineName => `${engineName} ist ausgewählt, aber nicht im PATH installiert.`,
    engineReadyDetail: engineName => `${engineName} ist für Session-Turns bereit.`,
    engineRole: 'AIWorker Engine',
    engineStarting: 'Engine startet den Session-Turn.',
    eventCount: count => `${count} Events`,
    eventStream: 'Session-Events',
    executionReady: 'Ausführung',
    followUpInput: 'Follow-up-Turn',
    followUpPlaceholder: 'Artefakt verfeinern, Evidenz ergänzen oder Review-Lücken bearbeiten...',
    memoryCandidates: 'Memory-Kandidaten',
    noEvents: 'Events erscheinen nach dem Start eines Session-Turns.',
    noMemoryCandidates: 'Noch keine Memory-Kandidaten für diesen Workspace.',
    noSelectionDetail: 'Erstelle oder wähle einen Workspace, um Session, Artefakt, Review und Memory-Kandidaten zu prüfen.',
    noSelectionTitle: 'Kein Workspace ausgewählt',
    noTurns: 'Für diese Session sind keine Turns erfasst.',
    operatorRole: 'Operator',
    proposed: 'Vorgeschlagen',
    reject: 'Ablehnen',
    rejected: 'Abgelehnt',
    requestReview: 'Review anfordern',
    requestingReview: 'Review wird angefordert...',
    reviewRubric: 'Review-Rubrik',
    reviewWaiting: 'Erzeuge zuerst ein Artefakt, bevor du Review anforderst.',
    sendTurn: 'Turn senden',
    sendingTurn: 'Turn wird gesendet...',
    backToSoulHome: 'Zur Soul-Startseite',
    backToWorkerHome: 'Zurück zum Worker',
    backToWorkspace: 'Zurück zum Workspace',
    currentSession: 'Aktuelle Session',
    currentWorker: 'Aktueller Worker',
    currentWorkspace: 'Aktueller Workspace',
    newWorkspace: 'Neuer Workspace',
    noWorker: 'Kein Worker',
    noWorkspaceSessions: 'In diesem Workspace gibt es noch keine Sessions.',
    otherWorkspaces: 'Andere Workspaces',
    selectedCapability: 'Ausgewählte Capability',
    selectedWorkspace: 'Ausgewählter Workspace',
    sessionDetail: 'Session',
    latest: 'Neueste',
    soulCatalog: 'Soul-Katalog',
    turnCount: count => `${count} Turns`,
    turnHistory: 'Turn-Verlauf',
    updated: when => `Aktualisiert ${when}`,
    workspaceNavigation: 'Workspace-Navigation',
    workspaceSessions: 'Workspace-Sessions',
    workspaceKicker: 'WORKER WORKSPACE',
    workspaceList: 'Workspaces',
    workspaceTitle: soulName => `${soulName}-Workspaces`,
    workerEngine: 'Standard-Engine',
    workerId: 'Worker ID',
    workerList: 'Worker',
    workerListHint: 'Wähle zuerst einen Worker und verwalte dann seine Workspaces.',
    workerName: 'Worker-Name',
    workerSoul: 'Soul-Bindung',
    workerStatus: 'Worker-Status',
  },
  relativeTime: {
    daysAgo: days => `vor ${days} T.`,
    hoursAgo: hours => `vor ${hours} Std.`,
    minutesAgo: minutes => `vor ${minutes} Min.`,
    now: 'jetzt',
  },
  settings: {
    about: {
      executionMode: 'Ausführungsmodus',
      hint: 'Runtime-Details werden aus dem Workspace-daemon gelesen.',
      selectedEngine: 'Ausgewählte Engine',
      title: 'Lokale Workspace-Runtime',
      updated: 'Aktualisiert',
      version: 'Version',
    },
    appearance: {
      dark: 'Dunkel',
      hint: 'Wähle den Darstellungsmodus für diese Workspace-Oberfläche.',
      light: 'Hell',
      system: 'System',
      title: 'Darstellung',
    },
    autosave: {
      failed: 'Speichern fehlgeschlagen',
      saved: 'Alle Änderungen gespeichert',
      saving: 'Speichern',
    },
    byok: {
      apiKeyRef: 'API-Key-Referenz',
      baseUrl: 'Base URL',
      hint: 'Das API-Key-Feld speichert nur eine Referenz. Verwende env:NAME, um einen Key aus der daemon-Umgebung aufzulösen.',
      model: 'Modell',
      provider: 'Provider',
      title: 'BYOK-Provider',
    },
    connectors: {
      configured: 'Konfiguriert',
      hint: 'Aktiviere Konnektoren, wenn das Teamsystem Evidenz für Soul-Projekte bereitstellen kann.',
      notConfigured: 'Nicht konfiguriert',
      title: 'Konnektoren',
    },
    dialog: {
      kicker: 'AIWORKER EINSTELLUNGEN',
      subtitle: 'Wähle, wie Session-Turns ausgeführt werden, welche Teamsysteme verfügbar sind und welche Sprache und Darstellung der Workspace nutzt.',
      title: 'Soul-Workspace konfigurieren',
    },
    engine: {
      availableCount: count => `${count} verfügbar`,
      hint: 'Der Installationsstatus kommt aus dem PATH-Scan des Workspace-daemon. Session-Turns benötigen eine konfigurierte externe Engine oder einen BYOK-Provider.',
      testing: 'Engine wird getestet...',
      test: 'Test',
      rescan: 'Neu scannen',
      title: 'Lokale CLI-Engines',
    },
    externalMcp: {
      hint: 'Registriere Befehlszeilen für externe Evidenztools. Secrets müssen im externen Tool oder in der Umgebung bleiben.',
      placeholder: 'command --arg value',
      title: 'Externe MCP-Server',
    },
    language: {
      hint: 'Wird im Einstellungsdatensatz des Workspace-daemon gespeichert.',
      title: 'Sprache',
    },
    localMcp: {
      hint: 'Workspace-Kontext für eine externe Engine bereitstellen, die MCP unterstützt.',
      title: 'AIWorker Workspace-MCP-Server',
      toggle: 'Lokaler Workspace-MCP',
    },
    nav: {
      about: 'Info',
      aboutDetail: 'Runtime-Details',
      appearance: 'Darstellung',
      appearanceDetail: 'System / hell / dunkel',
      connectors: 'Konnektoren',
      connectorsDetail: 'Teamsystemzugriff',
      execution: 'Ausführung',
      executionDetail: 'Lokale CLI / BYOK',
      externalMcp: 'Externes MCP',
      externalMcpDetail: 'Zusätzliche Evidenztools',
      language: 'Sprache',
      languageDetail: 'Oberflächensprache',
      localMcp: 'Lokales MCP',
      localMcpDetail: 'Workspace-Kontextserver',
      soulPacks: 'Soul-Packs',
      soulPacksDetail: 'HR / PM / QA / DevOps',
    },
    soulPacks: {
      hint: 'Integrierte Souls definieren die verfügbaren Domänensysteme und Fähigkeitentemplates für diesen Workspace.',
      title: 'Soul-Packs',
    },
  },
  statuses: {
    active: 'Aktiv',
    cancelled: 'Abgebrochen',
    completed: 'Abgeschlossen',
    draft: 'Entwurf',
    failed: 'Fehlgeschlagen',
    fail: 'Fehlgeschlagen',
    needs_review: 'Review offen',
    pass: 'Bestanden',
    queued: 'In Warteschlange',
    running: 'Läuft',
    succeeded: 'Erfolgreich',
    warn: 'Warnung',
  },
} satisfies StaticMessages

const messagesByLocale: Record<SupportedLocale, StaticMessages> = {
  de,
  en,
  ja,
  'zh-CN': zhCN,
}

const builtinSoulCopy: Record<SupportedLocale, Record<string, BuiltinSoulCopy>> = {
  'en': {
    devops: { description: 'Operations workspace for deploy readiness, incident review, runbook upkeep, and capacity summaries.', domain: 'devops-sre', name: 'DevOps' },
    finance: { description: 'Financial evidence review and month-end control workflows.', domain: 'finance-ops', name: 'Finance' },
    hr: { description: 'Recruiting workspace for candidate evidence, interview planning, role rubrics, and hiring risk.', domain: 'hr-recruiting', name: 'HR' },
    legal: { description: 'Contract, policy, and risk review workflows.', domain: 'legal-ops', name: 'Legal' },
    ops: { description: 'General operations triage, process notes, and team playbooks.', domain: 'business-ops', name: 'Ops' },
    pm: { description: 'Product workspace for PRDs, decisions, roadmap slices, and stakeholder status.', domain: 'product-management', name: 'PM' },
    qa: { description: 'Quality workspace for test planning, regression evidence, defect triage, and release gates.', domain: 'quality-assurance', name: 'QA' },
  },
  'zh-CN': {
    devops: { description: '面向发布准备、事故复盘、运行手册维护和容量总结的运维工作区。', domain: 'DevOps / SRE', name: 'DevOps' },
    finance: { description: '面向财务证据审查和月结控制流程的工作区。', domain: '财务运营', name: '财务' },
    hr: { description: '面向候选人证据、面试计划、岗位 rubric 和招聘风险的招聘工作区。', domain: '招聘', name: 'HR' },
    legal: { description: '面向合同、政策和风险审查流程的工作区。', domain: '法务运营', name: '法务' },
    ops: { description: '面向通用运营分诊、流程记录和团队 playbook 的工作区。', domain: '业务运营', name: '运营' },
    pm: { description: '面向 PRD、决策、路线图切片和干系人状态的产品工作区。', domain: '产品管理', name: 'PM' },
    qa: { description: '面向测试计划、回归证据、缺陷分诊和发布门禁的质量工作区。', domain: '质量保障', name: 'QA' },
  },
  'ja': {
    devops: { description: '配備準備、インシデントレビュー、Runbook 更新、容量サマリーのための運用ワークスペース。', domain: 'DevOps / SRE', name: 'DevOps' },
    finance: { description: '財務証拠レビューと月次締め管理ワークフロー。', domain: '財務オペレーション', name: 'Finance' },
    hr: { description: '候補者証拠、面接計画、職務ルーブリック、採用リスクのための採用ワークスペース。', domain: '採用', name: 'HR' },
    legal: { description: '契約、ポリシー、リスクレビューのワークフロー。', domain: '法務オペレーション', name: 'Legal' },
    ops: { description: '一般的な運用トリアージ、プロセスノート、チームプレイブック。', domain: '業務オペレーション', name: 'Ops' },
    pm: { description: 'PRD、意思決定、ロードマップ切片、ステークホルダー状況のためのプロダクトワークスペース。', domain: 'プロダクト管理', name: 'PM' },
    qa: { description: 'テスト計画、回帰証拠、不具合トリアージ、リリースゲートのための品質ワークスペース。', domain: '品質保証', name: 'QA' },
  },
  'de': {
    devops: { description: 'Operations-Workspace für Deployment-Readiness, Incident Review, Runbook-Pflege und Kapazitätssummaries.', domain: 'DevOps / SRE', name: 'DevOps' },
    finance: { description: 'Workflows für Finanz-Evidenzprüfung und Monatsabschlusskontrollen.', domain: 'Finance Ops', name: 'Finance' },
    hr: { description: 'Recruiting-Workspace für Kandidatenevidenz, Interviewplanung, Rollenrubriken und Hiring-Risiken.', domain: 'Recruiting', name: 'HR' },
    legal: { description: 'Workflows für Vertrags-, Policy- und Risikoprüfung.', domain: 'Legal Ops', name: 'Legal' },
    ops: { description: 'Allgemeine Operations-Triage, Prozessnotizen und Team-Playbooks.', domain: 'Business Ops', name: 'Ops' },
    pm: { description: 'Produkt-Workspace für PRDs, Entscheidungen, Roadmap-Slices und Stakeholder-Status.', domain: 'Produktmanagement', name: 'PM' },
    qa: { description: 'Qualitäts-Workspace für Testplanung, Regressionsevidenz, Defect Triage und Release Gates.', domain: 'Qualitätssicherung', name: 'QA' },
  },
}

const builtinTemplateCopy: Record<SupportedLocale, Record<string, BuiltinTemplateCopy>> = {
  'en': {
    'candidate-screen': templateCopy('Candidate Screen', 'candidate-screen', 'Screen a candidate against a role and identify strengths, gaps, and follow-ups.', ['Role requirements', 'Resume or profile', 'Relevant notes'], ['Output cites the supplied context and labels missing evidence.', 'Risks and assumptions are separated from confirmed facts.', 'No protected-class inference.']),
    'interview-brief': templateCopy('Interview Brief', 'interview-brief', 'Prepare a structured interviewer brief with evidence-backed questions.', ['Role stage', 'Candidate packet', 'Interview goals'], ['Output cites the supplied context and labels missing evidence.', 'Next action is concrete, owned, and useful for a human reviewer.', 'Questions target missing signal.']),
    'role-rubric': templateCopy('Role Rubric', 'role-rubric', 'Turn role expectations into a hiring rubric and scoring guide.', ['Role description', 'Level expectations', 'Team constraints'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Criteria are observable and role-related.', 'Risks and assumptions are separated from confirmed facts.']),
    'hiring-risk': templateCopy('Hiring Risk', 'hiring-risk', 'Summarize hiring risks, uncertainty, and decision guardrails.', ['Candidate evidence', 'Scorecard notes', 'Decision constraints'], ['Output cites the supplied context and labels missing evidence.', 'Risks and assumptions are separated from confirmed facts.', 'Decision remains human-owned.']),
    'prd-draft': templateCopy('PRD Draft', 'prd-draft', 'Draft a PRD from goals, user evidence, constraints, and success metrics.', ['Problem statement', 'User evidence', 'Constraints'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Scope and non-goals are explicit.', 'Risks and assumptions are separated from confirmed facts.']),
    'decision-record': templateCopy('Decision Record', 'decision-record', 'Capture options, tradeoffs, decision, and follow-up owners.', ['Decision context', 'Options considered', 'Stakeholder notes'], ['Output cites the supplied context and labels missing evidence.', 'Next action is concrete, owned, and useful for a human reviewer.', 'Tradeoffs are balanced.']),
    'roadmap-slice': templateCopy('Roadmap Slice', 'roadmap-slice', 'Break a goal into a sequenced roadmap slice with dependencies.', ['Goal', 'Time horizon', 'Dependencies'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Risks and assumptions are separated from confirmed facts.', 'Milestones are inspectable.']),
    'status-report': templateCopy('Status Report', 'status-report', 'Produce a concise stakeholder status report with risks and next decisions.', ['Current status', 'Risks', 'Decisions needed'], ['Output cites the supplied context and labels missing evidence.', 'Next action is concrete, owned, and useful for a human reviewer.', 'No vague summary filler.']),
    'test-plan': templateCopy('Test Plan', 'test-plan', 'Create a test plan matched to release scope and user-facing risk.', ['Release scope', 'Acceptance criteria', 'Known risks'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Coverage maps to risk.', 'Risks and assumptions are separated from confirmed facts.']),
    'regression-matrix': templateCopy('Regression Matrix', 'regression-matrix', 'Build a regression matrix with coverage, evidence, gaps, and recommendation.', ['Changed behavior', 'Existing tests', 'Release criteria'], ['Output cites the supplied context and labels missing evidence.', 'Gaps are visible.', 'Risks and assumptions are separated from confirmed facts.']),
    'defect-triage': templateCopy('Defect Triage', 'defect-triage', 'Prioritize defects with reproduction evidence and release impact.', ['Bug reports', 'Logs/screenshots', 'Release target'], ['Output cites the supplied context and labels missing evidence.', 'Next action is concrete, owned, and useful for a human reviewer.', 'Observed failure and suspected cause are separate.']),
    'release-gate': templateCopy('Release Gate', 'release-gate', 'Summarize release readiness, blockers, residual risk, and go/no-go recommendation.', ['Test evidence', 'Known defects', 'Release policy'], ['Output cites the supplied context and labels missing evidence.', 'Risks and assumptions are separated from confirmed facts.', 'Recommendation is explicit.']),
    'deploy-checklist': templateCopy('Deploy Checklist', 'deploy-checklist', 'Prepare a deploy checklist with rollback, monitoring, and owner steps.', ['Change summary', 'Environment', 'Rollback plan'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Risks and assumptions are separated from confirmed facts.', 'Steps are operationally concrete.']),
    'incident-review': templateCopy('Incident Review', 'incident-review', 'Produce an incident review with timeline, impact, contributing factors, and actions.', ['Timeline', 'Signals', 'Impact notes'], ['Output cites the supplied context and labels missing evidence.', 'Next action is concrete, owned, and useful for a human reviewer.', 'Blameless language and source boundaries.']),
    'runbook-update': templateCopy('Runbook Update', 'runbook-update', 'Convert new operational learning into a runbook update.', ['Current runbook', 'Observed gap', 'Operational context'], ['Next action is concrete, owned, and useful for a human reviewer.', 'Procedure is repeatable.', 'Risks and assumptions are separated from confirmed facts.']),
    'capacity-summary': templateCopy('Capacity Summary', 'capacity-summary', 'Summarize capacity signals, thresholds, and scaling recommendations.', ['Metrics', 'Service context', 'Forecast horizon'], ['Output cites the supplied context and labels missing evidence.', 'Risks and assumptions are separated from confirmed facts.', 'Recommendation states confidence.']),
  },
  'zh-CN': {
    'candidate-screen': templateCopy('候选人初筛', '候选人初筛', '根据岗位评估候选人，识别优势、差距和后续动作。', ['岗位要求', '简历或候选人资料', '相关记录'], ['输出引用给定上下文并标出缺失证据。', '风险和假设与确认事实分开。', '不推断受保护类别。']),
    'interview-brief': templateCopy('面试简报', '面试简报', '生成结构化面试官简报，并提供证据支撑的问题。', ['面试阶段', '候选人材料', '面试目标'], ['输出引用给定上下文并标出缺失证据。', '下一步具体、有负责人且对人工评审有用。', '问题针对缺失信号。']),
    'role-rubric': templateCopy('岗位 Rubric', '岗位 rubric', '将岗位期望转成招聘 rubric 和评分指南。', ['岗位描述', '职级期望', '团队约束'], ['下一步具体、有负责人且对人工评审有用。', '标准可观察且与岗位相关。', '风险和假设与确认事实分开。']),
    'hiring-risk': templateCopy('招聘风险', '招聘风险', '总结招聘风险、不确定性和决策护栏。', ['候选人证据', '评分表记录', '决策约束'], ['输出引用给定上下文并标出缺失证据。', '风险和假设与确认事实分开。', '决策保持由人负责。']),
    'prd-draft': templateCopy('PRD 草案', 'PRD 草案', '基于目标、用户证据、约束和成功指标起草 PRD。', ['问题陈述', '用户证据', '约束'], ['下一步具体、有负责人且对人工评审有用。', '范围和非目标明确。', '风险和假设与确认事实分开。']),
    'decision-record': templateCopy('决策记录', '决策记录', '记录选项、权衡、决策和后续负责人。', ['决策背景', '考虑过的选项', '干系人记录'], ['输出引用给定上下文并标出缺失证据。', '下一步具体、有负责人且对人工评审有用。', '权衡保持平衡。']),
    'roadmap-slice': templateCopy('路线图切片', '路线图切片', '把目标拆成有顺序、带依赖的路线图切片。', ['目标', '时间范围', '依赖'], ['下一步具体、有负责人且对人工评审有用。', '风险和假设与确认事实分开。', '里程碑可检查。']),
    'status-report': templateCopy('状态报告', '状态报告', '生成简洁的干系人状态报告，包含风险和待决策项。', ['当前状态', '风险', '需要的决策'], ['输出引用给定上下文并标出缺失证据。', '下一步具体、有负责人且对人工评审有用。', '没有空泛总结。']),
    'test-plan': templateCopy('测试计划', '测试计划', '创建与发布范围和用户风险匹配的测试计划。', ['发布范围', '验收标准', '已知风险'], ['下一步具体、有负责人且对人工评审有用。', '覆盖映射到风险。', '风险和假设与确认事实分开。']),
    'regression-matrix': templateCopy('回归矩阵', '回归矩阵', '构建包含覆盖、证据、缺口和建议的回归矩阵。', ['变更行为', '现有测试', '发布标准'], ['输出引用给定上下文并标出缺失证据。', '缺口清晰可见。', '风险和假设与确认事实分开。']),
    'defect-triage': templateCopy('缺陷分诊', '缺陷分诊', '基于复现证据和发布影响确定缺陷优先级。', ['缺陷报告', '日志或截图', '发布目标'], ['输出引用给定上下文并标出缺失证据。', '下一步具体、有负责人且对人工评审有用。', '观察到的失败与疑似原因分开。']),
    'release-gate': templateCopy('发布门禁', '发布门禁', '总结发布准备度、阻塞项、剩余风险和 go/no-go 建议。', ['测试证据', '已知缺陷', '发布政策'], ['输出引用给定上下文并标出缺失证据。', '风险和假设与确认事实分开。', '建议明确。']),
    'deploy-checklist': templateCopy('发布检查清单', '发布检查清单', '准备包含回滚、监控和负责人步骤的发布检查清单。', ['变更摘要', '环境', '回滚计划'], ['下一步具体、有负责人且对人工评审有用。', '风险和假设与确认事实分开。', '步骤具备操作性。']),
    'incident-review': templateCopy('事故复盘', '事故复盘', '生成包含时间线、影响、促成因素和行动项的事故复盘。', ['时间线', '信号', '影响记录'], ['输出引用给定上下文并标出缺失证据。', '下一步具体、有负责人且对人工评审有用。', '语言无责备且保留来源边界。']),
    'runbook-update': templateCopy('Runbook 更新', 'runbook 更新', '把新的运维经验转成 runbook 更新。', ['当前 runbook', '观察到的缺口', '运维上下文'], ['下一步具体、有负责人且对人工评审有用。', '流程可重复执行。', '风险和假设与确认事实分开。']),
    'capacity-summary': templateCopy('容量总结', '容量总结', '总结容量信号、阈值和扩缩容建议。', ['指标', '服务上下文', '预测周期'], ['输出引用给定上下文并标出缺失证据。', '风险和假设与确认事实分开。', '建议说明信心程度。']),
  },
  'ja': {
    'candidate-screen': templateCopy('候補者スクリーニング', '候補者スクリーニング', '職務に対して候補者を評価し、強み、ギャップ、フォローアップを特定します。', ['職務要件', '履歴書またはプロフィール', '関連メモ'], ['提供されたコンテキストを引用し、不足証拠を示す。', 'リスクと仮定を確認済み事実から分ける。', '保護属性を推測しない。']),
    'interview-brief': templateCopy('面接ブリーフ', '面接ブリーフ', '証拠に基づく質問を含む構造化された面接官ブリーフを作成します。', ['選考ステージ', '候補者資料', '面接目標'], ['提供されたコンテキストを引用し、不足証拠を示す。', '次のアクションが具体的で所有者があり、レビューに役立つ。', '質問が不足シグナルを狙っている。']),
    'role-rubric': templateCopy('職務ルーブリック', '職務ルーブリック', '職務期待を採用ルーブリックと採点ガイドに変換します。', ['職務記述', 'レベル期待', 'チーム制約'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', '基準が観察可能で職務に関連している。', 'リスクと仮定を確認済み事実から分ける。']),
    'hiring-risk': templateCopy('採用リスク', '採用リスク', '採用リスク、不確実性、意思決定ガードレールを要約します。', ['候補者証拠', 'スコアカードメモ', '意思決定制約'], ['提供されたコンテキストを引用し、不足証拠を示す。', 'リスクと仮定を確認済み事実から分ける。', '意思決定は人間が所有する。']),
    'prd-draft': templateCopy('PRD ドラフト', 'PRD ドラフト', '目標、ユーザー証拠、制約、成功指標から PRD を起草します。', ['課題文', 'ユーザー証拠', '制約'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', '範囲と非目標が明確。', 'リスクと仮定を確認済み事実から分ける。']),
    'decision-record': templateCopy('意思決定記録', '意思決定記録', '選択肢、トレードオフ、決定、フォローアップ所有者を記録します。', ['意思決定背景', '検討した選択肢', 'ステークホルダーメモ'], ['提供されたコンテキストを引用し、不足証拠を示す。', '次のアクションが具体的で所有者があり、レビューに役立つ。', 'トレードオフが偏っていない。']),
    'roadmap-slice': templateCopy('ロードマップ切片', 'ロードマップ切片', '目標を依存関係付きの順序化されたロードマップ切片に分解します。', ['目標', '期間', '依存関係'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', 'リスクと仮定を確認済み事実から分ける。', 'マイルストーンが確認可能。']),
    'status-report': templateCopy('ステータスレポート', 'ステータスレポート', 'リスクと次の意思決定を含む簡潔なステークホルダーレポートを作成します。', ['現在の状況', 'リスク', '必要な意思決定'], ['提供されたコンテキストを引用し、不足証拠を示す。', '次のアクションが具体的で所有者があり、レビューに役立つ。', '曖昧な要約で埋めない。']),
    'test-plan': templateCopy('テスト計画', 'テスト計画', 'リリース範囲とユーザー影響リスクに合うテスト計画を作成します。', ['リリース範囲', '受け入れ基準', '既知リスク'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', 'カバレッジがリスクに対応している。', 'リスクと仮定を確認済み事実から分ける。']),
    'regression-matrix': templateCopy('回帰マトリクス', '回帰マトリクス', 'カバレッジ、証拠、ギャップ、推奨を含む回帰マトリクスを作成します。', ['変更された挙動', '既存テスト', 'リリース基準'], ['提供されたコンテキストを引用し、不足証拠を示す。', 'ギャップが見える。', 'リスクと仮定を確認済み事実から分ける。']),
    'defect-triage': templateCopy('不具合トリアージ', '不具合トリアージ', '再現証拠とリリース影響に基づき不具合を優先付けします。', ['不具合報告', 'ログまたはスクリーンショット', 'リリース対象'], ['提供されたコンテキストを引用し、不足証拠を示す。', '次のアクションが具体的で所有者があり、レビューに役立つ。', '観測された失敗と推定原因を分ける。']),
    'release-gate': templateCopy('リリースゲート', 'リリースゲート', 'リリース準備、ブロッカー、残存リスク、go/no-go 推奨を要約します。', ['テスト証拠', '既知不具合', 'リリースポリシー'], ['提供されたコンテキストを引用し、不足証拠を示す。', 'リスクと仮定を確認済み事実から分ける。', '推奨が明確。']),
    'deploy-checklist': templateCopy('配備チェックリスト', '配備チェックリスト', 'ロールバック、監視、所有者ステップを含む配備チェックリストを準備します。', ['変更概要', '環境', 'ロールバック計画'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', 'リスクと仮定を確認済み事実から分ける。', '手順が運用上具体的。']),
    'incident-review': templateCopy('インシデントレビュー', 'インシデントレビュー', 'タイムライン、影響、要因、アクションを含むインシデントレビューを作成します。', ['タイムライン', 'シグナル', '影響メモ'], ['提供されたコンテキストを引用し、不足証拠を示す。', '次のアクションが具体的で所有者があり、レビューに役立つ。', '非難しない表現とソース境界。']),
    'runbook-update': templateCopy('Runbook 更新', 'Runbook 更新', '新しい運用学習を Runbook 更新に変換します。', ['現在の Runbook', '観測されたギャップ', '運用コンテキスト'], ['次のアクションが具体的で所有者があり、レビューに役立つ。', '手順が再現可能。', 'リスクと仮定を確認済み事実から分ける。']),
    'capacity-summary': templateCopy('容量サマリー', '容量サマリー', '容量シグナル、しきい値、スケーリング推奨を要約します。', ['メトリクス', 'サービスコンテキスト', '予測期間'], ['提供されたコンテキストを引用し、不足証拠を示す。', 'リスクと仮定を確認済み事実から分ける。', '推奨に信頼度を示す。']),
  },
  'de': {
    'candidate-screen': templateCopy('Kandidaten-Screening', 'Kandidaten-Screening', 'Bewerte einen Kandidaten gegen eine Rolle und identifiziere Stärken, Lücken und Folgeaktionen.', ['Rollenanforderungen', 'Lebenslauf oder Profil', 'Relevante Notizen'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Keine Ableitung geschützter Merkmale.']),
    'interview-brief': templateCopy('Interview-Brief', 'Interview-Brief', 'Erstelle einen strukturierten Interviewer-Brief mit evidenzgestützten Fragen.', ['Rollenstufe', 'Kandidatenpaket', 'Interviewziele'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Fragen zielen auf fehlende Signale.']),
    'role-rubric': templateCopy('Rollenrubrik', 'Rollenrubrik', 'Wandle Rollenerwartungen in eine Hiring-Rubrik und Bewertungsanleitung um.', ['Rollenbeschreibung', 'Level-Erwartungen', 'Teamrestriktionen'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Kriterien sind beobachtbar und rollenbezogen.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.']),
    'hiring-risk': templateCopy('Hiring-Risiko', 'Hiring-Risiko', 'Fasse Hiring-Risiken, Unsicherheit und Entscheidungsleitplanken zusammen.', ['Kandidatenevidenz', 'Scorecard-Notizen', 'Entscheidungsrestriktionen'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Die Entscheidung bleibt menschlich verantwortet.']),
    'prd-draft': templateCopy('PRD-Entwurf', 'PRD-Entwurf', 'Entwirf ein PRD aus Zielen, Nutzer-Evidenz, Restriktionen und Erfolgsmetriken.', ['Problemstatement', 'Nutzer-Evidenz', 'Restriktionen'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Scope und Nicht-Ziele sind explizit.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.']),
    'decision-record': templateCopy('Entscheidungsprotokoll', 'Entscheidungsprotokoll', 'Erfasse Optionen, Abwägungen, Entscheidung und Folge-Verantwortliche.', ['Entscheidungskontext', 'Berücksichtigte Optionen', 'Stakeholder-Notizen'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Tradeoffs sind ausgewogen.']),
    'roadmap-slice': templateCopy('Roadmap-Slice', 'Roadmap-Slice', 'Zerlege ein Ziel in einen sequenzierten Roadmap-Slice mit Abhängigkeiten.', ['Ziel', 'Zeithorizont', 'Abhängigkeiten'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Meilensteine sind prüfbar.']),
    'status-report': templateCopy('Statusbericht', 'Statusbericht', 'Erstelle einen knappen Stakeholder-Status mit Risiken und nächsten Entscheidungen.', ['Aktueller Status', 'Risiken', 'Benötigte Entscheidungen'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Keine vagen Zusammenfassungsfüller.']),
    'test-plan': templateCopy('Testplan', 'Testplan', 'Erstelle einen Testplan passend zu Release-Scope und nutzerseitigem Risiko.', ['Release-Scope', 'Akzeptanzkriterien', 'Bekannte Risiken'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Coverage ist auf Risiko gemappt.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.']),
    'regression-matrix': templateCopy('Regressionsmatrix', 'Regressionsmatrix', 'Erstelle eine Regressionsmatrix mit Coverage, Evidenz, Lücken und Empfehlung.', ['Geändertes Verhalten', 'Bestehende Tests', 'Release-Kriterien'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Lücken sind sichtbar.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.']),
    'defect-triage': templateCopy('Defect Triage', 'Defect Triage', 'Priorisiere Defekte mit Reproduktions-Evidenz und Release-Auswirkung.', ['Bugreports', 'Logs/Screenshots', 'Release-Ziel'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Beobachteter Fehler und vermutete Ursache sind getrennt.']),
    'release-gate': templateCopy('Release Gate', 'Release Gate', 'Fasse Release-Readiness, Blocker, Restrisiko und Go/No-Go-Empfehlung zusammen.', ['Test-Evidenz', 'Bekannte Defekte', 'Release-Policy'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Empfehlung ist explizit.']),
    'deploy-checklist': templateCopy('Deployment-Checkliste', 'Deployment-Checkliste', 'Bereite eine Deployment-Checkliste mit Rollback, Monitoring und Owner-Schritten vor.', ['Änderungszusammenfassung', 'Umgebung', 'Rollback-Plan'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Schritte sind operativ konkret.']),
    'incident-review': templateCopy('Incident Review', 'Incident Review', 'Erstelle einen Incident Review mit Timeline, Auswirkung, beitragenden Faktoren und Aktionen.', ['Timeline', 'Signale', 'Impact-Notizen'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Blameless Sprache und Quellgrenzen.']),
    'runbook-update': templateCopy('Runbook-Update', 'Runbook-Update', 'Wandle neues operatives Lernen in ein Runbook-Update um.', ['Aktuelles Runbook', 'Beobachtete Lücke', 'Operativer Kontext'], ['Nächste Aktion ist konkret, zuständig und für menschliche Review nützlich.', 'Prozedur ist wiederholbar.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.']),
    'capacity-summary': templateCopy('Kapazitätssummary', 'Kapazitätssummary', 'Fasse Kapazitätssignale, Schwellen und Skalierungsempfehlungen zusammen.', ['Metriken', 'Servicekontext', 'Prognosehorizont'], ['Ausgabe zitiert den gelieferten Kontext und markiert fehlende Evidenz.', 'Risiken und Annahmen sind von bestätigten Fakten getrennt.', 'Empfehlung nennt Konfidenz.']),
  },
}

export function normalizeLocale(language: string | null | undefined): SupportedLocale {
  return supportedLocales.includes(language as SupportedLocale) ? language as SupportedLocale : 'en'
}

export function messagesFor(language: string | null | undefined): StaticMessages {
  return messagesByLocale[normalizeLocale(language)]
}

export function languageLabel(locale: SupportedLocale, activeLocale: SupportedLocale): string {
  return messagesByLocale[activeLocale].languageOptions[locale]
}

export function displaySoul(soul: VerticalSoul, locale: SupportedLocale): BuiltinSoulCopy {
  return builtinSoulCopy[locale][soul.id] ?? { description: soul.description, domain: soul.domain, name: soul.name }
}

export function displayTemplate(template: CapabilityTemplate, locale: SupportedLocale): BuiltinTemplateCopy {
  return builtinTemplateCopy[locale][template.id] ?? {
    description: template.description,
    inputHints: template.inputHints,
    name: template.name,
    outputKind: template.outputKind,
    reviewRubric: template.reviewRubric,
  }
}

export function formatStatus(status: string, locale: SupportedLocale): string {
  const messages = messagesByLocale[locale]
  return messages.statuses[status as StatusKey] ?? status.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function formatReviewVerdict(verdict: LocalReviewVerdict, locale: SupportedLocale): string {
  return formatStatus(verdict, locale)
}

export function formatRelativeTime(value: string, locale: SupportedLocale): string {
  const messages = messagesByLocale[locale]
  const ms = Date.now() - Date.parse(value)
  if (!Number.isFinite(ms) || ms < 0)
    return messages.relativeTime.now
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes < 60)
    return messages.relativeTime.minutesAgo(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 48)
    return messages.relativeTime.hoursAgo(hours)
  return messages.relativeTime.daysAgo(Math.floor(hours / 24))
}

function templateCopy(
  name: string,
  outputKind: string,
  description: string,
  inputHints: readonly string[],
  reviewRubric: readonly string[],
): BuiltinTemplateCopy {
  return { description, inputHints, name, outputKind, reviewRubric }
}
