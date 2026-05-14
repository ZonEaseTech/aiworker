import { soulAppManifestSchema } from './manifest'

const HR_PERSON_PROFILE_SCHEMA_HASH = '35c14e3d4c0fe9fd95c87e9bc47a210e21f99bcb1b079aa99a95bb93e820c8ab'
const HR_CANDIDATE_SCREEN_SCHEMA_HASH = 'e8bd207be63eab23073cd47e41092f1d753c38d609383206e94334dd984b309c'
const QA_REGRESSION_MATRIX_SCHEMA_HASH = '6a4f3494764431e8785a82865215eabc4c4678dfb4e447eda4d4684f341892a0'
const QA_RELEASE_GATE_SCHEMA_HASH = '0c953a3453ff235c419600073c70c1f155976f448c4567711b511d83668a09e4'

export const hrSoulAppManifest = soulAppManifestSchema.parse({
  api: {
    entry: './src/api.ts',
    routePrefix: '/api/local/apps/aiworker-hr',
  },
  artifactTypes: [
    {
      description: 'Source-backed HR lifecycle profile.',
      id: 'person-profile',
      name: 'Person Profile',
      previewRef: './src/ui/person-profile-preview.tsx',
      reviewPolicyRef: './review/person-profile.md',
      schemaRef: './schemas/person-profile.schema.json',
      schemaSha256: HR_PERSON_PROFILE_SCHEMA_HASH,
      version: '0.1.0',
    },
    {
      description: 'Role-related candidate screen with missing evidence and risks.',
      id: 'candidate-screen',
      name: 'Candidate Screen',
      previewRef: './src/ui/candidate-screen-preview.tsx',
      reviewPolicyRef: './review/candidate-screen.md',
      schemaRef: './schemas/candidate-screen.schema.json',
      schemaSha256: HR_CANDIDATE_SCREEN_SCHEMA_HASH,
      version: '0.1.0',
    },
  ],
  capabilities: [
    {
      artifactTypes: ['person-profile'],
      description: 'Create a source-backed people profile snapshot.',
      id: 'person-profile',
      name: 'Person Profile',
      outputKind: 'person-profile',
      packRefs: [],
      promptRef: './capabilities/person-profile/prompt.md',
      reviewRubricRef: './capabilities/person-profile/review.md',
      version: '0.1.0',
      workspaceTypes: ['people-profile'],
    },
    {
      artifactTypes: ['candidate-screen'],
      description: 'Screen candidate evidence against a role rubric.',
      id: 'candidate-screen',
      name: 'Candidate Screen',
      outputKind: 'candidate-screen',
      packRefs: [],
      promptRef: './capabilities/candidate-screen/prompt.md',
      reviewRubricRef: './capabilities/candidate-screen/review.md',
      version: '0.1.0',
      workspaceTypes: ['role-search', 'candidate'],
    },
  ],
  compatibility: {
    host: { minVersion: '0.12.0' },
    sdk: { minVersion: '0.1.0' },
  },
  connectors: {
    optional: [
      {
        access: ['read'],
        id: 'calendar',
        reason: 'Collect interview availability and touchpoint context.',
        scopes: ['events.read'],
      },
    ],
    required: [
      {
        access: ['read'],
        id: 'ats',
        reason: 'Read candidate packets and role evidence through the Host connector broker.',
        scopes: ['candidates.read', 'roles.read'],
      },
    ],
  },
  description: 'People operations Soul App for profiles, recruiting evidence, lifecycle touchpoints, and HR review policy.',
  exports: {
    artifact: './src/protocol/artifact.ts',
    connector: './src/protocol/connectors.ts',
    lifecycle: './src/protocol/lifecycle.ts',
    review: './src/protocol/review.ts',
    runtime: './src/protocol/runtime.ts',
    ui: './src/protocol/ui.ts',
  },
  healthcheck: {
    kind: 'protocol-handler',
    ref: 'healthcheck',
    timeoutMs: 5000,
  },
  id: 'aiworker-hr',
  memory: {
    admissionPolicy: 'manual-review',
    namespace: 'aiworker-hr',
  },
  modes: {
    hostMounted: { entry: './src/host-mounted.ts', supported: true },
    standalone: { entry: './src/standalone.ts', supported: true },
  },
  name: 'AIWorker HR',
  pack: {
    refs: [
      { id: 'hr-recruiting', ref: 'packs/hr-recruiting/SOUL.md', source: 'embedded', version: '0.1.0' },
    ],
  },
  permissions: [
    {
      action: 'read',
      kind: 'storage',
      reason: 'Read app-scoped HR domain metadata.',
      target: 'aiworker-hr',
    },
    {
      action: 'write',
      kind: 'storage',
      reason: 'Write app-scoped HR domain metadata.',
      target: 'aiworker-hr',
    },
    {
      action: 'read',
      kind: 'search',
      reason: 'Read app-owned HR search descriptors.',
      target: 'aiworker-hr',
    },
    {
      action: 'write',
      kind: 'search',
      reason: 'Publish app-owned HR search descriptors.',
      target: 'aiworker-hr',
    },
    {
      action: 'read',
      kind: 'connector',
      reason: 'Read HR evidence through Host connector broker.',
      target: 'ats',
    },
    {
      action: 'write',
      kind: 'artifact',
      reason: 'Create reviewable HR artifacts.',
      target: 'person-profile',
    },
    {
      action: 'create',
      kind: 'review',
      reason: 'Create HR review rubrics and findings.',
      target: 'hr-review',
    },
    {
      action: 'propose',
      kind: 'memory',
      reason: 'Propose reviewed HR lessons into the app namespace.',
      target: 'aiworker-hr',
    },
    {
      action: 'mount',
      kind: 'ui',
      reason: 'Mount HR workbench contributions.',
      target: 'hr-workbench',
    },
    {
      action: 'serve',
      kind: 'api',
      reason: 'Serve HR scoped API routes.',
      target: '/api/local/apps/aiworker-hr',
    },
  ],
  protocol: 'soul-app/v1',
  soul: {
    description: 'HR Soul for people operations, recruiting, onboarding, offboarding, and sensitive evidence review.',
    domain: 'hr-people-ops',
    id: 'hr',
    name: 'HR',
    version: '0.1.0',
  },
  storage: {
    migrations: [
      { id: 'hr-initial', path: './migrations/0001_hr.sql' },
    ],
    namespace: 'aiworker-hr',
  },
  ui: {
    artifactPreviews: [
      {
        entry: './src/ui/person-profile-preview.tsx',
        id: 'person-profile-preview',
        label: 'Person profile preview',
        slot: 'artifact-preview',
        target: 'person-profile',
      },
    ],
    panels: [
      {
        entry: './src/ui/profile-panel.tsx',
        id: 'hr-profile-panel',
        label: 'Profile panel',
        slot: 'panel',
        surface: {
          entry: '/surfaces/panels/hr-profile-panel',
          renderer: 'host-descriptor',
          requiredPermissions: ['storage:read:aiworker-hr'],
          scope: 'workspace',
        },
      },
    ],
    reviewPanels: [
      {
        entry: './src/ui/review-panel.tsx',
        id: 'hr-review-panel',
        label: 'HR review panel',
        slot: 'review-panel',
      },
    ],
    routes: [
      {
        entry: './src/ui/hr-route.tsx',
        id: 'hr-home',
        label: 'HR',
        path: '/hr',
        surface: {
          entry: '/surfaces/routes/hr-home',
          renderer: 'host-descriptor',
          requiredPermissions: ['ui:mount:hr-workbench'],
          scope: 'app',
        },
      },
    ],
    shell: {
      actions: [
        {
          id: 'refresh-people',
          label: 'Refresh',
          protocolAction: 'people.refresh',
          requiredPermissions: ['storage:read:aiworker-hr'],
          slot: 'refresh',
        },
        {
          id: 'toggle-evidence-drawer',
          label: 'Evidence',
          protocolAction: 'drawers.evidence.toggle',
          requiredPermissions: ['connector:read:ats'],
          slot: 'drawer-toggle',
        },
      ],
      primaryAction: {
        id: 'create-people-profile',
        label: 'New people profile',
        protocolAction: 'peopleProfiles.create',
        requiredPermissions: ['storage:write:aiworker-hr', 'search:write:aiworker-hr'],
        slot: 'primary',
      },
      search: {
        id: 'people-profile-search',
        label: 'Search people profiles',
        placeholder: 'Search people profiles',
        protocolProvider: 'peopleProfiles.search',
        requiredPermissions: ['search:read:aiworker-hr'],
      },
      settings: {
        id: 'hr-settings',
        label: 'HR settings',
        protocolAction: 'settings.open',
        requiredPermissions: ['api:serve:/api/local/apps/aiworker-hr'],
      },
    },
    workspaceWidgets: [
      {
        entry: './src/ui/people-widget.tsx',
        id: 'hr-people-widget',
        label: 'People widget',
        slot: 'workspace-widget',
        surface: {
          entry: '/frames/widgets/hr-people-widget',
          renderer: 'sandboxed-frame',
          scope: 'workspace',
        },
        target: 'people-profile',
      },
    ],
  },
  version: '0.1.0',
  workspaceTypes: [
    {
      artifactTypes: ['person-profile'],
      defaultCapabilityIds: ['person-profile'],
      description: 'Profile-centered workspace for one person lifecycle.',
      id: 'people-profile',
      name: 'People Profile',
    },
    {
      artifactTypes: ['candidate-screen'],
      defaultCapabilityIds: ['candidate-screen'],
      description: 'Recruiting role workspace with candidate evidence and review.',
      id: 'role-search',
      name: 'Role Search',
    },
    {
      artifactTypes: ['candidate-screen'],
      defaultCapabilityIds: ['candidate-screen'],
      description: 'Focused candidate packet workspace.',
      id: 'candidate',
      name: 'Candidate',
    },
  ],
})

export const qaSoulAppManifest = soulAppManifestSchema.parse({
  api: {
    entry: './src/api.ts',
    routePrefix: '/api/local/apps/aiworker-qa',
  },
  artifactTypes: [
    {
      description: 'Coverage matrix mapped to release risk.',
      id: 'regression-matrix',
      name: 'Regression Matrix',
      previewRef: './src/ui/regression-matrix-preview.tsx',
      reviewPolicyRef: './review/regression-matrix.md',
      schemaRef: './schemas/regression-matrix.schema.json',
      schemaSha256: QA_REGRESSION_MATRIX_SCHEMA_HASH,
      version: '0.1.0',
    },
    {
      description: 'Go/no-go release readiness artifact.',
      id: 'release-gate',
      name: 'Release Gate',
      previewRef: './src/ui/release-gate-preview.tsx',
      reviewPolicyRef: './review/release-gate.md',
      schemaRef: './schemas/release-gate.schema.json',
      schemaSha256: QA_RELEASE_GATE_SCHEMA_HASH,
      version: '0.1.0',
    },
  ],
  capabilities: [
    {
      artifactTypes: ['regression-matrix'],
      description: 'Build regression coverage from change and test evidence.',
      id: 'regression-matrix',
      name: 'Regression Matrix',
      outputKind: 'regression-matrix',
      packRefs: [],
      promptRef: './capabilities/regression-matrix/prompt.md',
      reviewRubricRef: './capabilities/regression-matrix/review.md',
      version: '0.1.0',
      workspaceTypes: ['release', 'test-suite'],
    },
    {
      artifactTypes: ['release-gate'],
      description: 'Summarize release blockers, residual risk, and go/no-go recommendation.',
      id: 'release-gate',
      name: 'Release Gate',
      outputKind: 'release-gate',
      packRefs: [],
      promptRef: './capabilities/release-gate/prompt.md',
      reviewRubricRef: './capabilities/release-gate/review.md',
      version: '0.1.0',
      workspaceTypes: ['release'],
    },
  ],
  compatibility: {
    host: { minVersion: '0.12.0' },
    sdk: { minVersion: '0.1.0' },
  },
  connectors: {
    optional: [
      {
        access: ['read'],
        id: 'issue-tracker',
        reason: 'Read defect evidence through Host connector broker.',
        scopes: ['issues.read'],
      },
    ],
    required: [
      {
        access: ['read'],
        id: 'ci',
        reason: 'Read CI and test evidence through Host connector broker.',
        scopes: ['runs.read', 'artifacts.read'],
      },
    ],
  },
  description: 'Quality Soul App for release workspaces, regression evidence, defect triage, and release gate review.',
  exports: {
    artifact: './src/protocol/artifact.ts',
    connector: './src/protocol/connectors.ts',
    lifecycle: './src/protocol/lifecycle.ts',
    review: './src/protocol/review.ts',
    runtime: './src/protocol/runtime.ts',
    ui: './src/protocol/ui.ts',
  },
  healthcheck: {
    kind: 'protocol-handler',
    ref: 'healthcheck',
    timeoutMs: 5000,
  },
  id: 'aiworker-qa',
  memory: {
    admissionPolicy: 'manual-review',
    namespace: 'aiworker-qa',
  },
  modes: {
    hostMounted: { entry: './src/host-mounted.ts', supported: true },
    standalone: { entry: './src/standalone.ts', supported: true },
  },
  name: 'AIWorker QA',
  pack: {
    refs: [
      { id: 'qa-reviewer', ref: 'packs/qa-reviewer/SOUL.md', source: 'embedded', version: '0.1.0' },
    ],
  },
  permissions: [
    {
      action: 'read',
      kind: 'storage',
      reason: 'Read app-scoped QA domain metadata.',
      target: 'aiworker-qa',
    },
    {
      action: 'write',
      kind: 'storage',
      reason: 'Write app-scoped QA domain metadata.',
      target: 'aiworker-qa',
    },
    {
      action: 'read',
      kind: 'search',
      reason: 'Read app-owned QA search descriptors.',
      target: 'aiworker-qa',
    },
    {
      action: 'write',
      kind: 'search',
      reason: 'Publish app-owned QA search descriptors.',
      target: 'aiworker-qa',
    },
    {
      action: 'read',
      kind: 'connector',
      reason: 'Read CI evidence through Host connector broker.',
      target: 'ci',
    },
    {
      action: 'write',
      kind: 'artifact',
      reason: 'Create reviewable QA release artifacts.',
      target: 'release-gate',
    },
    {
      action: 'create',
      kind: 'review',
      reason: 'Create QA review rubrics and findings.',
      target: 'qa-review',
    },
    {
      action: 'propose',
      kind: 'memory',
      reason: 'Propose reviewed QA lessons into the app namespace.',
      target: 'aiworker-qa',
    },
    {
      action: 'mount',
      kind: 'ui',
      reason: 'Mount QA workbench contributions.',
      target: 'qa-workbench',
    },
    {
      action: 'serve',
      kind: 'api',
      reason: 'Serve QA scoped API routes.',
      target: '/api/local/apps/aiworker-qa',
    },
  ],
  protocol: 'soul-app/v1',
  soul: {
    description: 'QA Soul for release evidence, regression coverage, defect triage, and release readiness review.',
    domain: 'quality-assurance',
    id: 'qa',
    name: 'QA',
    version: '0.1.0',
  },
  storage: {
    migrations: [
      { id: 'qa-initial', path: './migrations/0001_qa.sql' },
    ],
    namespace: 'aiworker-qa',
  },
  ui: {
    artifactPreviews: [
      {
        entry: './src/ui/release-gate-preview.tsx',
        id: 'release-gate-preview',
        label: 'Release gate preview',
        slot: 'artifact-preview',
        target: 'release-gate',
      },
    ],
    panels: [
      {
        entry: './src/ui/release-panel.tsx',
        id: 'qa-release-panel',
        label: 'Release panel',
        slot: 'panel',
        surface: {
          entry: '/surfaces/panels/qa-release-panel',
          renderer: 'host-descriptor',
          requiredPermissions: ['storage:read:aiworker-qa'],
          scope: 'workspace',
        },
      },
    ],
    reviewPanels: [
      {
        entry: './src/ui/review-panel.tsx',
        id: 'qa-review-panel',
        label: 'QA review panel',
        slot: 'review-panel',
      },
    ],
    routes: [
      {
        entry: './src/ui/qa-route.tsx',
        id: 'qa-home',
        label: 'QA',
        path: '/qa',
        surface: {
          entry: '/surfaces/routes/qa-home',
          renderer: 'host-descriptor',
          requiredPermissions: ['ui:mount:qa-workbench'],
          scope: 'app',
        },
      },
    ],
    shell: {
      actions: [
        {
          id: 'refresh-release',
          label: 'Refresh',
          protocolAction: 'release.refresh',
          requiredPermissions: ['storage:read:aiworker-qa'],
          slot: 'refresh',
        },
      ],
      primaryAction: {
        id: 'create-release-gate',
        label: 'New release gate',
        protocolAction: 'releaseGates.create',
        requiredPermissions: ['storage:write:aiworker-qa', 'search:write:aiworker-qa'],
        slot: 'primary',
      },
      search: {
        id: 'release-search',
        label: 'Search releases',
        placeholder: 'Search releases',
        protocolProvider: 'releases.search',
        requiredPermissions: ['search:read:aiworker-qa'],
      },
      settings: {
        id: 'qa-settings',
        label: 'QA settings',
        protocolAction: 'settings.open',
        requiredPermissions: ['api:serve:/api/local/apps/aiworker-qa'],
      },
    },
    workspaceWidgets: [
      {
        entry: './src/ui/release-widget.tsx',
        id: 'qa-release-widget',
        label: 'Release widget',
        slot: 'workspace-widget',
        surface: {
          entry: '/frames/widgets/qa-release-widget',
          renderer: 'sandboxed-frame',
          scope: 'workspace',
        },
        target: 'release',
      },
    ],
  },
  version: '0.1.0',
  workspaceTypes: [
    {
      artifactTypes: ['regression-matrix', 'release-gate'],
      defaultCapabilityIds: ['regression-matrix', 'release-gate'],
      description: 'Release readiness workspace with test and defect evidence.',
      id: 'release',
      name: 'Release',
    },
    {
      artifactTypes: ['regression-matrix'],
      defaultCapabilityIds: ['regression-matrix'],
      description: 'Focused test suite coverage workspace.',
      id: 'test-suite',
      name: 'Test Suite',
    },
  ],
})

export const referenceSoulAppManifests = [hrSoulAppManifest, qaSoulAppManifest] as const
