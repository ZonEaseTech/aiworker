export type ComponentCatalogStatus = 'deprecated' | 'experimental' | 'implemented' | 'planned'

export type ComponentCatalogFamily
  = | 'data-display'
    | 'feedback'
    | 'forms'
    | 'foundation'
    | 'layout'
    | 'navigation'
    | 'overlays'
    | 'primitives'
    | 'soul-shells'
    | 'workbench'

export interface ComponentCatalogItem {
  description: string
  family: ComponentCatalogFamily
  name: string
  owner: 'host-soul-shared'
  source?: string
  status: ComponentCatalogStatus
}

export interface ComponentMigrationCandidate {
  candidate: string
  reason: string
  source: string
  target: string
}

export interface ComponentGovernanceRule {
  appliesTo: string[]
  description: string
  id: string
  requiredEvidence: string[]
}

export const componentGovernanceRules: ComponentGovernanceRule[] = [
  {
    appliesTo: [
      'apps/web',
      'apps/aiworker-*',
      'packages/component',
    ],
    description: 'Non-trivial Host Web or Soul App UI work must check the shared component library before adding app-local UI.',
    id: 'component-library-preflight',
    requiredEvidence: [
      'checked packages/component primitives or patterns',
      'reason app-local UI is still needed',
      'componentMigrationQueue entry for reusable gaps',
      'bun run ui:check for local style or component changes',
    ],
  },
]

export const componentCatalog: ComponentCatalogItem[] = [
  {
    description: 'Package-owned shared style entrypoint.',
    family: 'foundation',
    name: 'styles.css',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Shared button primitive with tone and icon support.',
    family: 'primitives',
    name: 'Button',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Tokenized text input primitive.',
    family: 'primitives',
    name: 'Input',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Accessible binary switch primitive.',
    family: 'primitives',
    name: 'Switch',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Form field shell with label, help and validation slots.',
    family: 'forms',
    name: 'Field',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Accessible dialog wrapper for shared modal surfaces.',
    family: 'overlays',
    name: 'Dialog',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Headless dropdown wrapper.',
    family: 'overlays',
    name: 'DropdownMenu',
    owner: 'host-soul-shared',
    status: 'planned',
  },
  {
    description: 'Headless tooltip wrapper.',
    family: 'overlays',
    name: 'Tooltip',
    owner: 'host-soul-shared',
    status: 'planned',
  },
  {
    description: 'Shared navigation item button.',
    family: 'navigation',
    name: 'NavItemButton',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic collapsible grouped-list shell.',
    family: 'data-display',
    name: 'StudioCollapsibleGroup',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic status pill with tone and optional detail.',
    family: 'data-display',
    name: 'StatusPill',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Host-mounted worker studio shell layout.',
    family: 'layout',
    name: 'WorkerStudioLayout',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic settings sidebar/content shell.',
    family: 'layout',
    name: 'SettingsShell',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic segmented control for mutually exclusive choices.',
    family: 'forms',
    name: 'SegmentedControl',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic progress/status card promoted from session progress UI.',
    family: 'workbench',
    name: 'ProgressCard',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic session message and tool-result shells.',
    family: 'workbench',
    name: 'MessageFlow',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Shared controlled session composer shell with file/image attachments, image preview and action bar.',
    family: 'workbench',
    name: 'SessionComposer',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Shared composer action bar with attachment trigger, template select and submit affordance.',
    family: 'workbench',
    name: 'SessionComposerActionBar',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Shared normalized session timeline renderer with parser-led activity rows and markdown assistant prose.',
    family: 'workbench',
    name: 'SessionTimeline',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Shared generic session detail section shell.',
    family: 'workbench',
    name: 'SessionDetailPanel',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic profile reader frame without HR semantics.',
    family: 'soul-shells',
    name: 'ProfileReaderShell',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic artifact preview frame without artifact semantics.',
    family: 'soul-shells',
    name: 'ArtifactPreviewFrame',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
  {
    description: 'Generic review panel shell without verdict semantics.',
    family: 'soul-shells',
    name: 'ReviewPanelShell',
    owner: 'host-soul-shared',
    status: 'implemented',
  },
]

export const componentMigrationQueue: ComponentMigrationCandidate[] = [
  {
    candidate: 'settings shell, nav item, segmented control and action controls',
    reason: 'Generic settings UI structure should not live only in Host Web.',
    source: 'apps/web/src/features/settings/components/settings-dialog.tsx',
    target: 'packages/component/src/patterns/settings.tsx',
  },
  {
    candidate: 'session progress card',
    reason: 'Reusable progress/status card can serve Host and Soul workbenches.',
    source: 'apps/web/src/worker/session-progress-panel.tsx',
    target: 'packages/component/src/patterns/progress.tsx',
  },
  {
    candidate: 'profile reader frame',
    reason: 'Profile reading layout is reusable while HR owns profile parsing and labels.',
    source: 'apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx',
    target: 'packages/component/src/patterns/profile.tsx',
  },
]
