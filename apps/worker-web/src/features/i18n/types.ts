import type { LocalEngineInvocationStatus, LocalSessionStatus } from '@zonease/aiworker-soul-descriptor'

export const supportedLocales = ['en', 'zh-CN', 'ja', 'de'] as const
export type SupportedLocale = typeof supportedLocales[number]

export type StatusKey = LocalSessionStatus | LocalEngineInvocationStatus | 'draft'

export interface StaticMessages {
  accessibility: {
    artifactSettings: string
    sessionOutputPreview: string
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
    noSession: string
    pending: string
  }
  common: {
    available: string
    comingSoon: string
    interface: string
    notInstalled: string
    workspace: string
  }
  create: {
    sessionContext: string
    creatingSession: string
    footer: string
    newProject: string
    projectName: string
    projectPlaceholders: { default: string }
    soul: string
    submit: string
  }
  languageOptions: Record<SupportedLocale, string>
  navigation: {
    createTabs: {
      project: string
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
    artifactCount: (count: number) => string
    byokNeedsKey: string
    byokReady: (provider: string, model: string) => string
    configure: string
    continueSession: string
    createSession: string
    createSessionPlaceholder: string
    createSessionPrompt: (workspaceName: string) => string
    addSourceMaterials: string
    attachedSourceMaterials: string
    closeSourceMaterialPreview: string
    createWorker: string
    createWorkerHint: string
    createWorkspace: string
    createWorkspaceHint: string
    appApiRoute: (routePrefix: string) => string
    appPermissionSummary: (appId: string, count: number) => string
    appRoute: (label: string, path: string) => string
    developerDetails: string
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
    hideDeveloperDetails: string
    mountedSlotCount: (count: number) => string
    noEvents: string
    noOtherWorkspaces: string
    noSelectionDetail: string
    noSelectionTitle: string
    noInvocations: string
    operatorRole: string
    sendInvocation: string
    sendingInvocation: string
    backToWorker: string
    backToWorkspace: string
    currentSession: string
    currentWorker: string
    currentWorkspace: string
    newSession: string
    newWorkspace: string
    noWorker: string
    noWorkspaceSessions: string
    otherWorkspaces: string
    selectedWorkspace: string
    sessionDetail: string
    latest: string
    materialReadError: string
    soulCatalog: string
    previewSourceMaterial: (name: string) => string
    removeSourceMaterial: (name: string) => string
    invocationCount: (count: number) => string
    invocationHistory: string
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
      pending: string
      placeholder: string
      title: string
    }
    language: {
      hint: string
      title: string
    }
    localMcp: {
      hint: string
      pending: string
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
      apiRoute: (routePrefix: string) => string
      connectorStatus: (connectorId: string, status: string) => string
      connectorsTitle: string
      archiveApp: (name: string) => string
      disabledConnector: string
      empty: string
      enableApp: (name: string) => string
      enabledConnector: string
      hint: string
      permissionsTitle: string
      permissionCount: (count: number) => string
      title: string
      unavailableConnector: string
      updating: string
    }
  }
  statuses: Record<StatusKey, string>
  workerConfig: {
    viewEdit: string
    view: string
    addSkill: string
    addEntryFile: string
    editorTitle: (assetId: string) => string
    sourceBaseline: string
    sourceOverlay: string
    contentLabel: string
    readonlyHint: string
    save: string
    saving: string
    resetToBaseline: string
    cancel: string
    addNamePlaceholder: string
    addContentPlaceholder: string
    add: string
    loadFailed: string
  }
}

export interface BuiltinSoulCopy {
  description: string
  name: string
}
