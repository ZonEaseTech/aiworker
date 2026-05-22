import { soulAppManifestSchema } from './manifest'

const _HR_PERSON_PROFILE_SCHEMA_HASH = '35c14e3d4c0fe9fd95c87e9bc47a210e21f99bcb1b079aa99a95bb93e820c8ab'
const _HR_CANDIDATE_SCREEN_SCHEMA_HASH = 'e8bd207be63eab23073cd47e41092f1d753c38d609383206e94334dd984b309c'
const _QA_REGRESSION_MATRIX_SCHEMA_HASH = '6a4f3494764431e8785a82865215eabc4c4678dfb4e447eda4d4684f341892a0'
const _QA_RELEASE_GATE_SCHEMA_HASH = '0c953a3453ff235c419600073c70c1f155976f448c4567711b511d83668a09e4'

export const hrSoulAppManifest = soulAppManifestSchema.parse({
  api: {
    entry: './host-adapter/api.ts',
    routePrefix: '/api/local/apps/aiworker-hr',
  },
  capabilities: [
    {
      artifactTypes: ['person-profile'],
      description: 'Create a source-backed people profile snapshot.',
      id: 'person-profile',
      name: 'Person Profile',
      outputKind: 'person-profile',
      packRefs: [],
      promptRef: './product/workflows/person-profile/prompt.md',
      reviewRubricRef: './product/workflows/person-profile/review.md',
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
      promptRef: './product/workflows/candidate-screen/prompt.md',
      reviewRubricRef: './product/workflows/candidate-screen/review.md',
      version: '0.1.0',
      workspaceTypes: ['role-search', 'candidate'],
    },
    {
      artifactTypes: ['evidence-matrix'],
      description: 'Screen HR evidence into a coverage matrix with gaps, conflicts, and source boundaries.',
      id: 'evidence-matrix',
      name: 'Evidence Matrix',
      outputKind: 'evidence-matrix',
      packRefs: [],
      promptRef: './product/workflows/evidence-matrix/prompt.md',
      reviewRubricRef: './product/workflows/evidence-matrix/review.md',
      version: '0.1.0',
      workspaceTypes: ['people-profile', 'role-search', 'candidate'],
    },
    {
      artifactTypes: ['interview-brief'],
      description: 'Prepare a structured interviewer brief with evidence-backed questions.',
      id: 'interview-brief',
      name: 'Interview Brief',
      outputKind: 'interview-brief',
      packRefs: [],
      promptRef: './product/workflows/interview-brief/prompt.md',
      reviewRubricRef: './product/workflows/interview-brief/review.md',
      version: '0.1.0',
      workspaceTypes: ['role-search', 'candidate'],
    },
    {
      artifactTypes: ['hiring-risk'],
      description: 'Summarize hiring risks, uncertainty, and decision guardrails without making the decision.',
      id: 'hiring-risk',
      name: 'Hiring Risk Review',
      outputKind: 'hiring-risk',
      packRefs: [],
      promptRef: './product/workflows/hiring-risk/prompt.md',
      reviewRubricRef: './product/workflows/hiring-risk/review.md',
      version: '0.1.0',
      workspaceTypes: ['people-profile', 'role-search', 'candidate'],
    },
    {
      artifactTypes: ['profile-update-draft'],
      description: 'Draft a profile README update while keeping acceptance product-owned.',
      id: 'profile-update-draft',
      name: 'Profile Update Draft',
      outputKind: 'profile-update-draft',
      packRefs: [],
      promptRef: './product/workflows/profile-update-draft/prompt.md',
      reviewRubricRef: './product/workflows/profile-update-draft/review.md',
      version: '0.1.0',
      workspaceTypes: ['people-profile', 'candidate'],
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
  engineAssets: {
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  },
  exports: {
    connector: './host-adapter/protocol/connectors.ts',
    lifecycle: './host-adapter/protocol/lifecycle.ts',
    runtime: './host-adapter/protocol/runtime.ts',
    ui: './host-adapter/protocol/ui.ts',
  },
  healthcheck: {
    kind: 'protocol-handler',
    ref: 'healthcheck',
    timeoutMs: 5000,
  },
  id: 'aiworker-hr',
  modes: {
    hostMounted: { entry: './host-adapter/mounted/host-mounted.ts', supported: true },
    standalone: { entry: './host-adapter/standalone/standalone.ts', supported: true },
  },
  name: 'AIWorker HR',
  pack: {
    refs: [
      { id: 'hr-recruiting', ref: 'product/profiles/hr-recruiting/SOUL.md', source: 'embedded', version: '0.1.0' },
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
      action: 'mount',
      kind: 'ui',
      reason: 'Mount HR micro-app surfaces.',
      target: 'hr-micro-app',
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
        entry: './product/web/artifact-previews/person-profile-preview.tsx',
        id: 'person-profile-preview',
        label: 'Person profile preview',
        slot: 'artifact-preview',
        target: 'person-profile',
      },
    ],
    panels: [
      {
        entry: './product/web/panels/profile-panel.tsx',
        id: 'hr-profile-panel',
        label: 'Profile panel',
        slot: 'panel',
      },
    ],
    routes: [
      {
        entry: './runtime/universal-workbench.ts',
        id: 'universal-workbench',
        label: '通用工作台',
        path: '/workbench/universal',
        surface: {
          entry: '/micro-app/workbench/universal',
          renderer: 'micro-app',
          scope: 'app',
        },
      },
      {
        entry: './product/web/routes/hr-route.tsx',
        id: 'hr-home',
        label: 'HR',
        path: '/hr',
        surface: {
          entry: '/micro-app/routes/hr-home',
          renderer: 'micro-app',
          requiredPermissions: ['ui:mount:hr-micro-app'],
          scope: 'app',
        },
      },
    ],
    workspaceContext: {
      terminal: {
        cwd: {
          source: 'host-workspace-root',
        },
        id: 'hr-workspace-terminal',
        label: 'People workspace terminal',
      },
    },
    workspaceWidgets: [
      {
        entry: './product/web/widgets/people-widget.tsx',
        id: 'hr-people-widget',
        label: 'People widget',
        slot: 'workspace-widget',
        surface: {
          entry: '/micro-app/widgets/hr-people-widget',
          renderer: 'micro-app',
          scope: 'workspace',
        },
        target: 'people-profile',
      },
    ],
  },
  version: '0.1.0',
  workspaceTypes: [
    {
      artifactTypes: ['person-profile', 'evidence-matrix', 'hiring-risk', 'profile-update-draft'],
      defaultCapabilityIds: ['person-profile', 'profile-update-draft'],
      description: 'Profile-centered workspace for one person lifecycle.',
      id: 'people-profile',
      name: 'People Profile',
    },
    {
      artifactTypes: ['candidate-screen', 'evidence-matrix', 'interview-brief', 'hiring-risk', 'profile-update-draft'],
      defaultCapabilityIds: ['candidate-screen', 'profile-update-draft'],
      description: 'Recruiting role workspace with candidate evidence and review.',
      id: 'role-search',
      name: 'Role Search',
    },
    {
      artifactTypes: ['candidate-screen', 'evidence-matrix', 'interview-brief', 'hiring-risk', 'profile-update-draft'],
      defaultCapabilityIds: ['candidate-screen', 'profile-update-draft'],
      description: 'Focused candidate packet workspace.',
      id: 'candidate',
      name: 'Candidate',
    },
  ],
})

export const qaSoulAppManifest = soulAppManifestSchema.parse({
  api: {
    entry: './host-adapter/api.ts',
    routePrefix: '/api/local/apps/aiworker-qa',
  },
  capabilities: [
    {
      artifactTypes: ['regression-matrix'],
      description: 'Build regression coverage from change and test evidence.',
      id: 'regression-matrix',
      name: 'Regression Matrix',
      outputKind: 'regression-matrix',
      packRefs: [],
      promptRef: './product/workflows/regression-matrix/prompt.md',
      reviewRubricRef: './product/workflows/regression-matrix/review.md',
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
      promptRef: './product/workflows/release-gate/prompt.md',
      reviewRubricRef: './product/workflows/release-gate/review.md',
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
  engineAssets: {
    skills: {
      source: './engine-assets/skills',
      targets: ['codex', 'claude-code'],
    },
    workspace: {
      source: './engine-assets/workspace',
    },
  },
  exports: {
    connector: './host-adapter/protocol/connectors.ts',
    lifecycle: './host-adapter/protocol/lifecycle.ts',
    runtime: './host-adapter/protocol/runtime.ts',
    ui: './host-adapter/protocol/ui.ts',
  },
  healthcheck: {
    kind: 'protocol-handler',
    ref: 'healthcheck',
    timeoutMs: 5000,
  },
  id: 'aiworker-qa',
  modes: {
    hostMounted: { entry: './host-adapter/mounted/host-mounted.ts', supported: true },
    standalone: { entry: './host-adapter/standalone/standalone.ts', supported: true },
  },
  name: 'AIWorker QA',
  pack: {
    refs: [
      { id: 'qa-reviewer', ref: 'product/profiles/qa-reviewer/SOUL.md', source: 'embedded', version: '0.1.0' },
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
      action: 'mount',
      kind: 'ui',
      reason: 'Mount QA micro-app surfaces.',
      target: 'qa-micro-app',
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
        entry: './product/web/artifact-previews/release-gate-preview.tsx',
        id: 'release-gate-preview',
        label: 'Release gate preview',
        slot: 'artifact-preview',
        target: 'release-gate',
      },
    ],
    panels: [
      {
        entry: './product/web/panels/release-panel.tsx',
        id: 'qa-release-panel',
        label: 'Release panel',
        slot: 'panel',
      },
    ],
    routes: [
      {
        entry: './runtime/universal-workbench.ts',
        id: 'universal-workbench',
        label: '通用工作台',
        path: '/workbench/universal',
        surface: {
          entry: '/micro-app/workbench/universal',
          renderer: 'micro-app',
          scope: 'app',
        },
      },
    ],
    workspaceContext: {
      terminal: {
        cwd: {
          source: 'host-workspace-root',
        },
        id: 'qa-workspace-terminal',
        label: 'Release workspace terminal',
      },
    },
    workspaceWidgets: [
      {
        entry: './product/web/widgets/release-widget.tsx',
        id: 'qa-release-widget',
        label: 'Release widget',
        slot: 'workspace-widget',
        surface: {
          entry: '/micro-app/widgets/qa-release-widget',
          renderer: 'micro-app',
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
