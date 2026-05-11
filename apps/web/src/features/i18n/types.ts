import type { LocalReviewVerdict, LocalSessionStatus, LocalTurnStatus } from '@zonease/aiworker-shared'

export const supportedLocales = ['en', 'zh-CN', 'ja', 'de'] as const
export type SupportedLocale = typeof supportedLocales[number]

export type StatusKey = LocalSessionStatus | LocalTurnStatus | LocalReviewVerdict | 'draft'

export interface StaticMessages {
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
    createSessionPlaceholder: string
    createSessionPrompt: (workspaceName: string) => string
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
    followUpInput: string
    followUpPlaceholder: string
    memoryCandidates: string
    noEvents: string
    noMemoryCandidates: string
    noOtherWorkspaces: string
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
    newSession: string
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

export interface BuiltinSoulCopy {
  description: string
  domain: string
  name: string
}

export interface BuiltinTemplateCopy {
  description: string
  inputHints: readonly string[]
  name: string
  outputKind: string
  reviewRubric: readonly string[]
}
