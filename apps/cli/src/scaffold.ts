import type { SoulAppManifest } from '@zonease/aiworker-shared'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSoulAppManifestJson } from '@zonease/aiworker-shared'
import packageJson from '../package.json' with { type: 'json' }

function registryContext() {
  return { hostVersion: packageJson.version }
}

function titleCase(id: string): string {
  return id.split('-').map(part => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : '').join(' ')
}

export function createScaffoldManifest(appId: string): SoulAppManifest {
  const routePrefix = `/api/local/apps/${appId}`
  const raw = {
    api: {
      entry: './host-adapter/api.ts',
      localService: {
        command: ['bun', 'host-adapter/mounted/host-mounted.ts'],
        healthPath: '/health',
      },
      routePrefix,
    },
    capabilities: [
      {
        description: 'Create a source-backed starter brief.',
        id: 'brief',
        name: 'Brief',
        outputKind: 'brief',
        packRefs: [appId],
        promptRef: './product/workflows/brief/prompt.md',
        version: '0.1.0',
        workspaceTypes: ['case'],
      },
    ],
    compatibility: {
      host: { minVersion: packageJson.version },
      sdk: { minVersion: '0.1.0' },
    },
    connectors: {
      optional: [],
      required: [],
    },
    description: `${appId} starter Soul App for one vertical workspace and capability.`,
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
      connector: './host-adapter/index.ts',
      lifecycle: './host-adapter/index.ts',
      runtime: './host-adapter/index.ts',
      ui: './host-adapter/index.ts',
    },
    healthcheck: {
      kind: 'protocol-handler',
      ref: 'healthcheck',
      timeoutMs: 5000,
    },
    id: appId,
    modes: {
      hostMounted: { entry: './host-adapter/mounted/host-mounted.ts', supported: true },
      standalone: { entry: './host-adapter/standalone/standalone.ts', supported: true },
    },
    name: titleCase(appId),
    pack: {
      refs: [
        { id: appId, ref: `./product/profiles/${appId}/SOUL.md`, source: 'embedded', version: '0.1.0' },
      ],
    },
    permissions: [
      {
        action: 'read',
        kind: 'storage',
        reason: 'Read app-scoped metadata for the starter workspace.',
        target: appId,
      },
      {
        action: 'write',
        kind: 'storage',
        reason: 'Write app-scoped metadata for the starter workspace.',
        target: appId,
      },
      {
        action: 'mount',
        kind: 'ui',
        reason: 'Mount starter micro-app surfaces.',
        target: `${appId}-micro-app`,
      },
      {
        action: 'serve',
        kind: 'api',
        reason: 'Serve app-scoped local API routes.',
        target: routePrefix,
      },
    ],
    protocol: 'soul-app/v1',
    soul: {
      description: `${titleCase(appId)} vertical Soul for app-scoped workspaces.`,
      domain: appId,
      id: appId,
      name: titleCase(appId),
      version: '0.1.0',
    },
    storage: {
      migrations: [],
      namespace: appId,
    },
    ui: {
      artifactPreviews: [
        {
          entry: './product/web/artifact-previews/brief-preview.tsx',
          id: 'brief-preview',
          label: 'Brief preview',
          slot: 'artifact-preview',
          target: 'brief',
        },
      ],
      panels: [
        {
          entry: './product/web/panels/brief-panel.tsx',
          id: 'brief-panel',
          label: 'Brief panel',
          slot: 'panel',
        },
      ],
      routes: [
        {
          entry: './runtime/universal-workbench.ts',
          id: 'universal-workbench',
          label: 'Universal Workbench',
          path: '/workbench/universal',
          surface: {
            entry: '/micro-app/workbench/universal',
            renderer: 'micro-app',
            scope: 'app',
          },
        },
        {
          entry: './product/web/routes/brief-route.tsx',
          id: 'brief-home',
          label: titleCase(appId),
          path: `/${appId}`,
          surface: {
            entry: '/micro-app/routes/brief-home',
            renderer: 'micro-app',
            requiredPermissions: [`ui:mount:${appId}-micro-app`],
            scope: 'app',
          },
        },
      ],
      workspaceContext: {
        terminal: {
          cwd: {
            source: 'host-workspace-root',
          },
          id: 'starter-workspace-terminal',
          label: 'Workspace terminal',
        },
      },
      workspaceWidgets: [
        {
          entry: './product/web/widgets/brief-widget.tsx',
          id: 'brief-widget',
          label: 'Brief widget',
          slot: 'workspace-widget',
          surface: {
            entry: '/micro-app/widgets/brief-widget',
            renderer: 'micro-app',
            scope: 'workspace',
          },
          target: 'case',
        },
      ],
    },
    version: '0.1.0',
    workspaceTypes: [
      {
        artifactTypes: ['brief'],
        defaultCapabilityIds: ['brief'],
        description: 'Starter workspace for one app-scoped case.',
        id: 'case',
        name: 'Case',
      },
    ],
  }
  const parsed = parseSoulAppManifestJson(JSON.stringify(raw), registryContext())
  if (parsed.status !== 'ok')
    throw new Error(parsed.error)
  return parsed.manifest
}

export function createScaffoldPackageJson(appId: string) {
  return {
    name: `@aiworker-soul-app/${appId}`,
    private: true,
    scripts: {
      build: 'bun build host-adapter/index.ts host-adapter/standalone/standalone.ts host-adapter/mounted/host-mounted.ts --outdir dist --target bun',
      dev: 'bun host-adapter/standalone/standalone.ts --serve',
      serve: 'bun host-adapter/mounted/host-mounted.ts',
      smoke: 'aiworker app smoke .',
      test: 'bun test',
      typecheck: 'tsc --noEmit',
      validate: 'aiworker app validate .',
    },
    type: 'module',
    version: '0.1.0',
    dependencies: {
      '@zonease/aiworker-soul-app-sdk': 'workspace:*',
    },
    devDependencies: {
      '@types/bun': '^1.2.13',
      'typescript': '^5.8.3',
    },
  }
}

export function createScaffoldTsconfig() {
  return {
    compilerOptions: {
      allowImportingTsExtensions: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      resolveJsonModule: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['host-adapter/**/*.ts'],
  }
}

export function createBriefSchema(appId: string) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
    properties: {
      appId: { const: appId },
      evidence: {
        items: { type: 'string' },
        minItems: 1,
        type: 'array',
      },
      summary: { minLength: 1, type: 'string' },
    },
    required: ['appId', 'summary', 'evidence'],
    title: `${titleCase(appId)} Brief`,
    type: 'object',
  }
}

export function scaffoldBriefSchemaText(appId: string): string {
  return `${JSON.stringify(createBriefSchema(appId), null, 2)}\n`
}

export function scaffoldReadme(appId: string): string {
  return [
    `# ${titleCase(appId)} Soul App`,
    '',
    'This starter app stays inside the public Soul App SDK boundary.',
    'It is a source-checkout preview scaffold: the generated package uses `workspace:*` while the SDK is still unpublished; replace `workspace:*` after the SDK is published.',
    '',
    '## Local Checks',
    '',
    '```bash',
    'aiworker app validate .',
    'aiworker app smoke .',
    '```',
    '',
    '## Contribution Checklist',
    '',
    '- Keep app code on `@zonease/aiworker-soul-app-sdk`; do not import Host private packages.',
    '- Serve mounted UI from micro-app routes and keep actions/search in app-owned mounted API paths.',
    '- Use `ui.workspaceContext` for Host-owned workspace process context such as a future web terminal.',
    '- Keep storage permissions scoped to this app namespace.',
    '- Add one artifact schema and one review policy for each new artifact type.',
    '- Run PMA, focused tests, and code-review-graph before submitting Host changes.',
    '',
  ].join('\n')
}

export function scaffoldWorkspaceAgents(appId: string): string {
  return [
    `# ${titleCase(appId)} Workspace Instructions`,
    '',
    'This workspace belongs to an AIWorker Soul App.',
    'Treat action-started sessions as explicit native skill selections.',
    'Keep generated artifacts reviewable before they become accepted workspace state.',
    '',
  ].join('\n')
}

export function scaffoldWorkspaceReadme(appId: string): string {
  return [
    '# {{workspaceName}}',
    '',
    `Workspace for ${titleCase(appId)}.`,
    '',
  ].join('\n')
}

export function scaffoldWorkspaceGitignore(): string {
  return [
    '.aiworker/sessions/',
    '.aiworker/projections.json',
    'evidence/raw/',
    '',
  ].join('\n')
}

export function scaffoldSkill(appId: string): string {
  return [
    '---',
    'name: brief',
    `description: Create source-backed ${titleCase(appId)} briefs.`,
    '---',
    '',
    '# Brief',
    '',
    'Create a concise, source-backed brief and surface missing evidence for human review.',
    '',
  ].join('\n')
}

export function scaffoldUniversalWorkbenchTs(): string {
  return [
    `export const routeId = 'universal-workbench'`,
    `export const renderer = 'micro-app'`,
    '',
  ].join('\n')
}

export function scaffoldProductWebTs(symbol: string): string {
  return `export const ${symbol} = {
  renderer: 'app-owned',
  status: 'scaffold',
}
`
}

export function scaffoldIndexTs(): string {
  return `import type {
  SoulAppArtifactValidationResult,
  SoulAppCapability,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
} from '@zonease/aiworker-soul-app-sdk'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { createSoulAppManifest, defineSoulApp, parseNamespacedSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'

const manifest = createSoulAppManifest(manifestJson)

export const soulApp = defineSoulApp({
  artifact: {
    async artifactSchemas() {
      return manifest.artifactTypes
    },
    async validateArtifact(_context, artifact) {
      return validateArtifactType(artifact.type)
    },
  },
  connector: {
    async declareConnectorNeeds() {
      return [
        ...manifest.connectors.required,
        ...manifest.connectors.optional,
      ]
    },
  },
  lifecycle: lifecycleHandlers('Starter Soul App ready.'),
  manifest,
  review: {
    async createReviewRubric(_context, artifactType) {
      return {
        checks: [
          \`Artifact type \${artifactType} cites source evidence.\`,
          'Missing facts and risks are explicit.',
          'Next action is concrete for a human reviewer.',
        ],
      }
    },
  },
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return manifest.artifactTypes
    },
    async capabilities() {
      return manifest.capabilities
    },
    async ui() {
      return manifest.ui
    },
    async workspaceTypes() {
      return manifest.workspaceTypes
    },
  },
})

export default soulApp

function resolveCapability(input?: string): SoulAppCapability {
  const id = input ? parseNamespacedSoulAppCapabilityId(input)?.capabilityId ?? input : manifest.capabilities[0]!.id
  const capability = manifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(\`Capability not found: \${input}\`)
  return capability
}

function sessionContext(context: SoulAppScopedContext, capability: SoulAppCapability, workspaceType: string): SoulAppSessionContext {
  return {
    artifactTypes: capability.artifactTypes,
    capabilityId: capability.id,
    contextMarkdown: [
      '# Soul App Context',
      \`App: \${context.appId}\`,
      \`Workspace type: \${workspaceType}\`,
      'Use source-backed evidence language and produce a reviewable business artifact.',
    ].join('\\n'),
    promptFragments: [
      \`Use capability \${capability.name}.\`,
      'Separate evidence, missing facts, risks, and next actions.',
    ],
    reviewRubric: [
      'Evidence is cited.',
      'Risk and missing evidence are separated.',
      'Next action is concrete.',
    ],
  }
}

function validateArtifactType(type: string): SoulAppArtifactValidationResult {
  const known = manifest.artifactTypes.some(item => item.id === type)
  return {
    issues: known ? [] : [{ message: \`Unknown artifact type: \${type}\`, severity: 'error' }],
    ok: known,
  }
}

function lifecycleHandlers(message: string) {
  const ok = async (): Promise<SoulAppProtocolResult> => ({ message, ok: true })
  return {
    disable: ok,
    enable: ok,
    healthcheck: ok,
    install: ok,
    upgrade: ok,
  }
}
`
}

export function scaffoldApiTs(): string {
  return `export { soulApp } from './index'
`
}

export function scaffoldStandaloneTs(): string {
  return `import process from 'node:process'

import manifestJson from '../../soul-app.manifest.json' with { type: 'json' }

const manifest = manifestJson

export function renderStandaloneHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>' + manifest.name + '</title></head>',
    \`<body data-soul-app-id="\${manifest.id}">\`,
    '<main>',
    \`<h1>\${manifest.name}</h1>\`,
    \`<p>\${manifest.description}</p>\`,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/health')
        return Response.json({ appId: manifest.id, mode: 'standalone', status: 'ok' })
      return new Response(renderStandaloneHtml(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveStandalone()
  process.stdout.write(\`\${JSON.stringify({ appId: manifest.id, mode: 'standalone', url: \`http://\${server.hostname}:\${server.port}\` })}\\n\`)
}
`
}

export function scaffoldHostMountedTs(): string {
  return `import process from 'node:process'

import manifestJson from '../../soul-app.manifest.json' with { type: 'json' }

const manifest = manifestJson

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/health')
        return Response.json({ appId: manifest.id, mode: 'host-mounted', status: 'ok' })

      const tokenError = verifyMountToken(request)
      if (tokenError)
        return tokenError

      if (url.pathname === '/domain') {
        return Response.json({
          appId: manifest.id,
          capabilities: manifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: manifest.soul.id,
          workspaceTypes: manifest.workspaceTypes.map(type => type.id),
        })
      }

      if (url.pathname === '/api/capabilities')
        return Response.json({ capabilities: manifest.capabilities })

      if (url.pathname === '/api/briefs' && request.method === 'POST')
        return handleCreateBrief(request)

      if (url.pathname === '/api/briefs/search' && request.method === 'GET')
        return handleBriefSearch(url)

      if (url.pathname === '/micro-app/workbench/universal') {
        return new Response(renderBriefMicroAppHtml('Universal Workbench'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname === '/micro-app/routes/brief-home') {
        return new Response(renderBriefMicroAppHtml('Brief Home'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname === '/micro-app/widgets/brief-widget') {
        return new Response(renderBriefMicroAppHtml('Brief Widget'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      return Response.json({ error: { code: 'NOT_FOUND', message: \`Unknown app route: \${url.pathname}\` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(\`\${JSON.stringify({ appId: manifest.id, mode: 'host-mounted', url: \`http://\${server.hostname}:\${server.port}\` })}\\n\`)
}

function verifyMountToken(request: Request): Response | null {
  const expected = Bun.env.AIWORKER_MOUNT_TOKEN
  if (!expected)
    return null
  const actual = request.headers.get('x-aiworker-mount-token')
  return actual === expected
    ? null
    : Response.json({ error: { code: 'INVALID_MOUNT_TOKEN', message: 'Host mount token is required.' } }, { status: 401 })
}

interface CreateBriefBody {
  title?: string
}

async function handleCreateBrief(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as CreateBriefBody
  return Response.json({
    item: {
      appId: manifest.id,
      id: 'starter-brief',
      kind: 'brief',
      status: 'draft',
      title: typeof body.title === 'string' && body.title ? body.title : 'Starter brief',
    },
  })
}

function handleBriefSearch(url: URL): Response {
  const query = url.searchParams.get('query') ?? ''
  return Response.json({
    items: [{
      appId: manifest.id,
      id: 'starter-brief',
      kind: 'brief',
      status: 'draft',
      summary: query ? \`Starter brief match for \${query}\` : 'Starter brief workspace item',
      title: query ? \`Brief: \${query}\` : 'Starter brief',
    }],
  })
}

function renderBriefMicroAppHtml(title: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    \`<title>\${escapeHtml(title)}</title>\`,
    '</head>',
    '<body>',
    \`<main data-soul-app-id="\${escapeHtml(manifest.id)}"><h1>\${escapeHtml(title)}</h1></main>\`,
    '</body>',
    '</html>',
  ].join('')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}
`
}

export function scaffoldPrompt(appId: string): string {
  return [
    `# ${titleCase(appId)} Brief Prompt`,
    '',
    'Create a concise, source-backed business brief.',
    '',
    '- Cite evidence references provided by the workspace context or app-owned API.',
    '- Mark missing facts explicitly.',
    '- Separate summary, risks, and next actions.',
    '',
  ].join('\n')
}

export function scaffoldReview(appId: string): string {
  return [
    `# ${titleCase(appId)} Brief Review`,
    '',
    '- Evidence is cited and scoped to the workspace.',
    '- Missing facts are explicit.',
    '- Risks and next actions are separated.',
    '- Memory candidates require human review before promotion.',
    '',
  ].join('\n')
}

export function scaffoldSoulPack(appId: string): string {
  return [
    `# ${titleCase(appId)} Soul Pack`,
    '',
    'This pack describes the starter domain stance for the generated Soul App.',
    '',
    '- Keep work inside the app workspace.',
    '- Produce reviewable artifacts, not generic chat output.',
    '- Use brokered connectors and scoped storage only.',
    '',
  ].join('\n')
}

export function writeScaffoldFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, { flag: 'wx' })
}
