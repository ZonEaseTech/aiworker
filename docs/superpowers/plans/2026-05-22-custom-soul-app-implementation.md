# Custom Soul App 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `apps/aiworker-custom/` 标准 Soul App，提供自由沙盒工作区，并集成到 bootstrap official 流程。

**Architecture:** 以 `aiworker-qa` 为模板，剥离所有领域语义（artifact types、connectors、domain UI），保留标准 Soul App 骨架 + 最小 host-adapter。Custom Soul 与 HR/QA 平级，通过同一套 install/enable/worker/workspace/session 流程运作。

**Tech Stack:** TypeScript, Bun, React 19, @zonease/aiworker-soul-app-sdk, @zonease/aiworker-ui (shadcn primitives)

---

## 文件结构

```
apps/aiworker-custom/
  soul-app.manifest.json          # 创建：最小 manifest
  package.json                     # 创建：package 配置
  tsconfig.json                    # 创建：TypeScript 配置
  engine-assets/
    skills/
      .gitkeep                     # 创建：空目录占位
    workspace/
      AGENTS.md                    # 创建：极简 workspace 说明
      CLAUDE.md                    # 创建：@AGENTS.md
  host-adapter/
    index.ts                       # 创建：SoulAppDefinition
    api.ts                         # 创建：re-export
    web-style.ts                   # 创建：样式服务
    index.test.ts                  # 创建：集成测试
    protocol/
      artifact.ts                  # 创建：protocol re-export
      connectors.ts                # 创建：protocol re-export
      lifecycle.ts                 # 创建：protocol re-export
      review.ts                    # 创建：protocol re-export
      runtime.ts                   # 创建：protocol re-export
      ui.ts                        # 创建：protocol re-export
    standalone/
      standalone.ts                # 创建：standalone 服务器
    mounted/
      host-mounted.ts              # 创建：Host mounted 服务器
  product/
    web/
      styles.css                   # 创建：最小样式
      styles.d.ts                  # 创建：CSS 模块声明
      widgets/
        custom-widget.tsx          # 创建：最小 proof 组件
    workflows/
      explore/
        prompt.md                  # 创建：最小 engine prompt
        review.md                  # 创建：最小 review 文件
  migrations/
    .gitkeep                       # 创建：空目录占位

packages/core/src/soul-app/official.ts  # 修改：添加 aiworker-custom
```

---

### Task 1: 创建目录结构和 package 配置

**Files:**
- Create: `apps/aiworker-custom/package.json`
- Create: `apps/aiworker-custom/tsconfig.json`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p apps/aiworker-custom/{engine-assets/{skills,workspace},host-adapter/{protocol,standalone,mounted},product/web/widgets,product/workflows/explore,migrations}
```

- [ ] **Step 2: 创建 package.json**

Write `apps/aiworker-custom/package.json`:

```json
{
  "name": "@zonease/aiworker-custom",
  "type": "module",
  "private": true,
  "license": "MIT",
  "exports": {
    ".": {
      "types": "./host-adapter/index.ts",
      "import": "./host-adapter/index.ts"
    }
  },
  "main": "./host-adapter/index.ts",
  "types": "./host-adapter/index.ts",
  "scripts": {
    "build": "bun run build:styles && bun build host-adapter/index.ts host-adapter/standalone/standalone.ts host-adapter/mounted/host-mounted.ts --outdir dist --target bun",
    "build:styles": "bunx --bun @tailwindcss/cli -i product/web/styles.css -o dist/web/styles.css --minify",
    "dev": "bun run build:styles && bun host-adapter/standalone/standalone.ts --serve",
    "serve": "bun run build:styles && bun host-adapter/mounted/host-mounted.ts",
    "smoke": "bun run build:styles && bun ../../apps/cli/src/aiworker.ts app smoke .",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "validate": "bun ../../apps/cli/src/aiworker.ts app validate ."
  },
  "dependencies": {
    "@zonease/aiworker-soul-app-sdk": "workspace:*",
    "@zonease/aiworker-ui": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.13",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@zonease/aiworker-soul-app-runtime": "workspace:*",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

Write `apps/aiworker-custom/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@/*": ["./host-adapter/*"]
    },
    "types": ["@types/bun"]
  },
  "include": [
    "host-adapter/**/*.ts",
    "product/web/**/*.ts",
    "product/web/**/*.tsx"
  ],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: 安装依赖**

```bash
cd apps/aiworker-custom && bun install
```

- [ ] **Step 5: Commit**

```bash
git add apps/aiworker-custom/package.json apps/aiworker-custom/tsconfig.json
git commit -m "feat: 创建 aiworker-custom package 配置

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 创建 soul-app.manifest.json

**Files:**
- Create: `apps/aiworker-custom/soul-app.manifest.json`

- [ ] **Step 1: 创建最小 manifest**

Write `apps/aiworker-custom/soul-app.manifest.json`:

```json
{
  "api": {
    "entry": "./host-adapter/api.ts",
    "localService": {
      "command": ["bun", "host-adapter/mounted/host-mounted.ts"],
      "healthPath": "/health"
    },
    "routePrefix": "/api/local/apps/aiworker-custom"
  },
  "artifactTypes": [],
  "capabilities": [
    {
      "artifactTypes": [],
      "description": "Free-form exploration session. No fixed domain constraints. Use Worker Configuration to add skills, MCP clients, and entry files.",
      "id": "explore",
      "name": "Explore",
      "outputKind": "explore",
      "packRefs": [],
      "promptRef": "./product/workflows/explore/prompt.md",
      "reviewRubricRef": "./product/workflows/explore/review.md",
      "version": "0.1.0",
      "workspaceTypes": ["sandbox"]
    }
  ],
  "compatibility": {
    "host": { "minVersion": "0.12.0" },
    "sdk": { "minVersion": "0.1.0" }
  },
  "connectors": {
    "optional": [],
    "required": []
  },
  "description": "Custom Soul App for free-form exploration, skill overlay, and workflow prototyping.",
  "engineAssets": {
    "skills": { "source": "./engine-assets/skills", "targets": ["codex", "claude-code"] },
    "workspace": { "source": "./engine-assets/workspace" }
  },
  "exports": {
    "artifact": "./host-adapter/protocol/artifact.ts",
    "connector": "./host-adapter/protocol/connectors.ts",
    "lifecycle": "./host-adapter/protocol/lifecycle.ts",
    "review": "./host-adapter/protocol/review.ts",
    "runtime": "./host-adapter/protocol/runtime.ts",
    "ui": "./host-adapter/protocol/ui.ts"
  },
  "healthcheck": {
    "kind": "protocol-handler",
    "ref": "healthcheck",
    "timeoutMs": 5000
  },
  "id": "aiworker-custom",
  "memory": {
    "admissionPolicy": "manual-review",
    "namespace": "aiworker-custom"
  },
  "modes": {
    "hostMounted": {
      "entry": "./host-adapter/mounted/host-mounted.ts",
      "supported": true
    },
    "standalone": {
      "entry": "./host-adapter/standalone/standalone.ts",
      "supported": true
    }
  },
  "name": "AIWorker Custom",
  "pack": { "refs": [] },
  "permissions": [
    {
      "action": "read",
      "kind": "storage",
      "reason": "Read app-scoped custom metadata.",
      "target": "aiworker-custom"
    },
    {
      "action": "write",
      "kind": "storage",
      "reason": "Write app-scoped custom metadata.",
      "target": "aiworker-custom"
    },
    {
      "action": "mount",
      "kind": "ui",
      "reason": "Mount Custom micro-app surfaces.",
      "target": "custom-micro-app"
    },
    {
      "action": "serve",
      "kind": "api",
      "reason": "Serve Custom scoped API routes.",
      "target": "/api/local/apps/aiworker-custom"
    }
  ],
  "protocol": "soul-app/v1",
  "soul": {
    "description": "Custom Soul for free-form exploration, skill overlay, and workflow prototyping.",
    "domain": "general-exploration",
    "id": "custom",
    "name": "Custom",
    "version": "0.1.0"
  },
  "storage": {
    "migrations": [],
    "namespace": "aiworker-custom"
  },
  "ui": {
    "workspaceContext": {
      "terminal": {
        "cwd": { "source": "host-workspace-root" },
        "id": "custom-workspace-terminal",
        "label": "Custom workspace terminal"
      }
    }
  },
  "version": "0.1.0",
  "workspaceTypes": [
    {
      "artifactTypes": [],
      "defaultCapabilityIds": ["explore"],
      "description": "Free-form sandbox workspace for exploration and workflow prototyping.",
      "id": "sandbox",
      "name": "Sandbox"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/aiworker-custom/soul-app.manifest.json
git commit -m "feat: 创建 aiworker-custom manifest

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 创建 engine-assets

**Files:**
- Create: `apps/aiworker-custom/engine-assets/skills/.gitkeep`
- Create: `apps/aiworker-custom/engine-assets/workspace/AGENTS.md`
- Create: `apps/aiworker-custom/engine-assets/workspace/CLAUDE.md`

- [ ] **Step 1: 创建 .gitkeep 占位**

```bash
touch apps/aiworker-custom/engine-assets/skills/.gitkeep
```

- [ ] **Step 2: 创建 AGENTS.md**

Write `apps/aiworker-custom/engine-assets/workspace/AGENTS.md`:

```markdown
# {{workerName}} Workspace Instructions

This workspace belongs to an AIWorker Custom sandbox.

## Workspace Identity

- Soul worker: {{workerName}}
- Soul id: {{soulId}}
- Workspace: {{workspaceName}}

## Session Output

- Write durable session outputs under `artifacts/<sessionId>/`.
- This is a free-form exploration workspace. No fixed domain constraints apply.
- Available skills come from Worker Configuration overlay. When skills exist, use `.agents/skills/` or `.claude/skills/` according to the active engine.
- MCP client config comes from Worker Configuration overlay (`.codex/config.toml` or `.mcp.json`).

## Overlay-First Workflow

- This workspace has no built-in domain skills or MCP config.
- All skills, MCP clients, and entry files are injected through Worker Configuration.
- Use `aiworker worker configuration` or the Host Web Shell to manage overlays.
- Run workspace projection after changing overlay assets.
```

- [ ] **Step 3: 创建 CLAUDE.md**

Write `apps/aiworker-custom/engine-assets/workspace/CLAUDE.md`:

```
@AGENTS.md
```

- [ ] **Step 4: Commit**

```bash
git add apps/aiworker-custom/engine-assets/
git commit -m "feat: 创建 aiworker-custom engine-assets

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 创建 product 文件

**Files:**
- Create: `apps/aiworker-custom/product/web/styles.css`
- Create: `apps/aiworker-custom/product/web/styles.d.ts`
- Create: `apps/aiworker-custom/product/web/widgets/custom-widget.tsx`
- Create: `apps/aiworker-custom/product/workflows/explore/prompt.md`
- Create: `apps/aiworker-custom/product/workflows/explore/review.md`
- Create: `apps/aiworker-custom/migrations/.gitkeep`

- [ ] **Step 1: 创建 styles.css**

Write `apps/aiworker-custom/product/web/styles.css`:

```css
@import "@zonease/aiworker-ui/styles.css";

@source "./**/*.{ts,tsx}";
@source "../../host-adapter/**/*.{ts,tsx}";
```

- [ ] **Step 2: 创建 styles.d.ts**

Write `apps/aiworker-custom/product/web/styles.d.ts`:

```ts
declare module '*.css'
```

- [ ] **Step 3: 创建最小 proof 组件**

Write `apps/aiworker-custom/product/web/widgets/custom-widget.tsx`:

```tsx
import { Badge } from '@zonease/aiworker-ui/components/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import { ItemContent } from '@zonease/aiworker-ui/components/item'

export const widgetId = 'custom-widget'

export interface CustomWidgetProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function CustomWidgetProof({
  badgeLabel = 'Custom',
  description = 'AIWorker Custom Soul App.',
  detail = 'Free-form exploration workspace. Add skills, MCP clients, and entry files through Worker Configuration.',
}: CustomWidgetProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>AIWorker Custom</CardTitle>
          <CardDescription>{description}</CardDescription>
        </ItemContent>
        <CardAction>
          <Badge variant="secondary">{badgeLabel}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardDescription className="line-clamp-none">{detail}</CardDescription>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: 创建 explore prompt 和 review 文件**

Write `apps/aiworker-custom/product/workflows/explore/prompt.md`:

```markdown
# Explore Capability Prompt

You are in a free-form Custom Soul App exploration workspace.

- No fixed domain constraints apply.
- Use available skills from `.agents/skills/` or `.claude/skills/`.
- Use available MCP tools from engine client config.
- Write durable outputs under `artifacts/<sessionId>/`.
- Ask the user to clarify intent if the request is ambiguous.
```

Write `apps/aiworker-custom/product/workflows/explore/review.md`:

```markdown
# Explore Capability Review

Review boundary for free-form exploration sessions:

- Output is a proposal until a human review accepts it.
- Check that skills were used according to their declared purpose.
- Do not store secrets, credentials, or bearer tokens in outputs.
```

- [ ] **Step 5: 创建 migrations/.gitkeep**

```bash
touch apps/aiworker-custom/migrations/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add apps/aiworker-custom/product/ apps/aiworker-custom/migrations/
git commit -m "feat: 创建 aiworker-custom product 文件

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 创建 host-adapter 核心文件

**Files:**
- Create: `apps/aiworker-custom/host-adapter/index.ts`
- Create: `apps/aiworker-custom/host-adapter/api.ts`
- Create: `apps/aiworker-custom/host-adapter/web-style.ts`

- [ ] **Step 1: 创建 index.ts (SoulAppDefinition)**

Write `apps/aiworker-custom/host-adapter/index.ts`:

```ts
import type {
  SoulAppCapability,
  SoulAppDefinition,
  SoulAppProtocolResult,
  SoulAppScopedContext,
  SoulAppSessionContext,
} from '@zonease/aiworker-soul-app-sdk'

import { createSoulAppManifest, defineSoulApp, parseNamespacedSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'

import manifestJson from '../soul-app.manifest.json' with { type: 'json' }

export const customSoulAppManifest = createSoulAppManifest(manifestJson)

export const CUSTOM_REFERENCE_APP_BOUNDARY = {
  hostMountedEntry: './host-adapter/mounted/host-mounted.ts',
  packageName: '@zonease/aiworker-custom',
  primaryWorkbench: 'Custom Sandbox',
  standaloneEntry: './host-adapter/standalone/standalone.ts',
} as const

export const customReferenceSoulApp: SoulAppDefinition = defineSoulApp({
  connector: {
    async declareConnectorNeeds() {
      return []
    },
  },
  lifecycle: lifecycleHandlers('Custom Soul App ready.'),
  manifest: customSoulAppManifest,
  runtime: {
    async prepareSessionContext(context, input) {
      const capability = resolveCustomCapability(input.capabilityId)
      return sessionContext(context, capability, input.workspaceType)
    },
    async resolveCapability(_context, input) {
      return resolveCustomCapability(input.capabilityId ?? input.intent)
    },
  },
  ui: {
    async artifactTypes() {
      return manifestJson.artifactTypes
    },
    async capabilities() {
      return customSoulAppManifest.capabilities
    },
    async ui() {
      return customSoulAppManifest.ui
    },
    async workspaceTypes() {
      return customSoulAppManifest.workspaceTypes
    },
  },
})

function resolveCustomCapability(input?: string): SoulAppCapability {
  const id = normalizeCapabilityId(input) ?? customSoulAppManifest.capabilities[0]!.id
  const capability = customSoulAppManifest.capabilities.find(item => item.id === id)
  if (!capability)
    throw new Error(`Custom capability not found: ${input}`)
  return capability
}

function normalizeCapabilityId(input?: string): string | null {
  if (!input)
    return null
  return parseNamespacedSoulAppCapabilityId(input)?.capabilityId ?? input
}

function sessionContext(context: SoulAppScopedContext, capability: SoulAppCapability, workspaceType: string): SoulAppSessionContext {
  return {
    artifactTypes: capability.artifactTypes,
    capabilityId: capability.id,
    contextMarkdown: [
      '# AIWorker Custom Session Context',
      `App: ${context.appId}`,
      `Workspace type: ${workspaceType}`,
      'This is a free-form exploration workspace with no fixed domain constraints.',
      'Use available skills and MCP tools from the workspace.',
    ].join('\n'),
    promptFragments: [
      `Using Custom capability: ${capability.name}.`,
      'Adapt to the user request without assuming a fixed domain.',
      'Use available skills and MCP tools as appropriate.',
    ],
    reviewRubric: [
      'Output is relevant to the user request.',
      'Available skills were used according to their purpose.',
      'No secrets or credentials in output.',
    ],
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
```

- [ ] **Step 2: 创建 api.ts**

Write `apps/aiworker-custom/host-adapter/api.ts`:

```ts
export { customReferenceSoulApp as soulApp } from './index'
```

- [ ] **Step 3: 创建 web-style.ts（精简版，无字体服务）**

Write `apps/aiworker-custom/host-adapter/web-style.ts`:

```ts
const soulAppStyleHref = '/styles.css'
const soulAppStylePath = new URL('../dist/web/styles.css', import.meta.url)

export function renderSoulAppStyleLink(href = soulAppStyleHref): string {
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`
}

export async function serveSoulAppStyle(url: URL): Promise<Response | null> {
  if (url.pathname !== soulAppStyleHref)
    return null

  const file = Bun.file(soulAppStylePath)
  if (!(await file.exists())) {
    return new Response('Soul App stylesheet has not been built. Run bun run build:styles.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      status: 503,
    })
  }

  return new Response(file, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/css; charset=utf-8',
    },
  })
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/aiworker-custom/host-adapter/index.ts apps/aiworker-custom/host-adapter/api.ts apps/aiworker-custom/host-adapter/web-style.ts
git commit -m "feat: 创建 aiworker-custom host-adapter 核心

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 创建 host-adapter protocol 文件

**Files:**
- Create: `apps/aiworker-custom/host-adapter/protocol/artifact.ts`
- Create: `apps/aiworker-custom/host-adapter/protocol/connectors.ts`
- Create: `apps/aiworker-custom/host-adapter/protocol/lifecycle.ts`
- Create: `apps/aiworker-custom/host-adapter/protocol/review.ts`
- Create: `apps/aiworker-custom/host-adapter/protocol/runtime.ts`
- Create: `apps/aiworker-custom/host-adapter/protocol/ui.ts`

- [ ] **Step 1: 创建 6 个 protocol re-export 文件**

Write `apps/aiworker-custom/host-adapter/protocol/artifact.ts`:

```ts
export const protocolSurface = 'artifact'
export { customReferenceSoulApp as soulApp } from '../index'
```

Write `apps/aiworker-custom/host-adapter/protocol/connectors.ts`:

```ts
export const protocolSurface = 'connectors'
export { customReferenceSoulApp as soulApp } from '../index'
```

Write `apps/aiworker-custom/host-adapter/protocol/lifecycle.ts`:

```ts
export const protocolSurface = 'lifecycle'
export { customReferenceSoulApp as soulApp } from '../index'
```

Write `apps/aiworker-custom/host-adapter/protocol/review.ts`:

```ts
export const protocolSurface = 'review'
export { customReferenceSoulApp as soulApp } from '../index'
```

Write `apps/aiworker-custom/host-adapter/protocol/runtime.ts`:

```ts
export const protocolSurface = 'runtime'
export { customReferenceSoulApp as soulApp } from '../index'
```

Write `apps/aiworker-custom/host-adapter/protocol/ui.ts`:

```ts
export const protocolSurface = 'ui'
export { customReferenceSoulApp as soulApp } from '../index'
```

- [ ] **Step 2: Commit**

```bash
git add apps/aiworker-custom/host-adapter/protocol/
git commit -m "feat: 创建 aiworker-custom protocol re-export

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 创建 standalone 和 mounted 服务器

**Files:**
- Create: `apps/aiworker-custom/host-adapter/standalone/standalone.ts`
- Create: `apps/aiworker-custom/host-adapter/mounted/host-mounted.ts`

- [ ] **Step 1: 创建 standalone 服务器**

Write `apps/aiworker-custom/host-adapter/standalone/standalone.ts`:

```ts
import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { CustomWidgetProof } from '../../product/web/widgets/custom-widget'
import { customSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppStyle } from '../web-style'

export function renderStandaloneHtml(): string {
  const appMarkup = renderToStaticMarkup(CustomWidgetProof({
    badgeLabel: 'Standalone',
    description: customSoulAppManifest.soul.domain,
    detail: customSoulAppManifest.description,
  }))
  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>AIWorker Custom</title>${renderSoulAppStyleLink()}</head>`,
    `<body data-soul-app-id="${customSoulAppManifest.id}">`,
    '<main>',
    appMarkup,
    '</main>',
    '</body>',
    '</html>',
  ].join('')
}

export function serveStandalone(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const styleResponse = await serveSoulAppStyle(url)
      if (styleResponse)
        return styleResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: customSoulAppManifest.id,
          mode: 'standalone',
          status: 'ok',
        })
      }
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
  process.stdout.write(`${JSON.stringify({ appId: customSoulAppManifest.id, mode: 'standalone', url: `http://${server.hostname}:${server.port}` })}\n`)
}
```

- [ ] **Step 2: 创建 mounted 服务器**

Write `apps/aiworker-custom/host-adapter/mounted/host-mounted.ts`:

```ts
import process from 'node:process'

import { renderToStaticMarkup } from 'react-dom/server'

import { CustomWidgetProof } from '../../product/web/widgets/custom-widget'
import { customSoulAppManifest } from '../index'
import { renderSoulAppStyleLink, serveSoulAppStyle } from '../web-style'

export function serveHostMounted(port = Number(Bun.env.PORT ?? 0)) {
  return Bun.serve({
    async fetch(request) {
      const url = new URL(request.url)
      const styleResponse = await serveSoulAppStyle(url)
      if (styleResponse)
        return styleResponse
      if (url.pathname === '/health') {
        return Response.json({
          appId: customSoulAppManifest.id,
          mode: 'host-mounted',
          status: 'ok',
        })
      }
      const tokenError = verifyMountToken(request)
      if (tokenError)
        return tokenError
      if (url.pathname === '/domain') {
        return Response.json({
          appId: customSoulAppManifest.id,
          capabilities: customSoulAppManifest.capabilities.map(capability => capability.id),
          mounted: true,
          soul: customSoulAppManifest.soul.id,
          workspaceTypes: customSoulAppManifest.workspaceTypes.map(type => type.id),
        })
      }
      if (url.pathname === '/api/capabilities' && request.method === 'GET')
        return Response.json({ capabilities: customSoulAppManifest.capabilities })
      return Response.json({ error: { code: 'NOT_FOUND', message: `Unknown Custom app route: ${url.pathname}` } }, { status: 404 })
    },
    hostname: Bun.env.HOST ?? '127.0.0.1',
    port,
  })
}

if (import.meta.main) {
  const server = serveHostMounted()
  process.stdout.write(`${JSON.stringify({ appId: customSoulAppManifest.id, mode: 'host-mounted', url: `http://${server.hostname}:${server.port}` })}\n`)
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/aiworker-custom/host-adapter/standalone/ apps/aiworker-custom/host-adapter/mounted/
git commit -m "feat: 创建 aiworker-custom standalone 和 mounted 服务器

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 创建集成测试

**Files:**
- Create: `apps/aiworker-custom/host-adapter/index.test.ts`

- [ ] **Step 1: 创建测试文件**

Write `apps/aiworker-custom/host-adapter/index.test.ts`:

```ts
import type { LocalExecutor } from '@zonease/aiworker-soul-app-runtime'

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createMountedSoulAppTestRuntime,
  createStandaloneSoulAppRuntime,
} from '@zonease/aiworker-soul-app-runtime'
import {
  namespaceSoulAppCapabilityId,
} from '@zonease/aiworker-soul-app-sdk'
import { afterEach, describe, expect, it } from 'bun:test'

import customManifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { CUSTOM_REFERENCE_APP_BOUNDARY, customReferenceSoulApp } from './index'
import { serveHostMounted } from './mounted/host-mounted'
import { renderStandaloneHtml } from './standalone/standalone'

const now = () => '2026-05-22T00:00:00.000Z'

const executor: LocalExecutor = {
  async invoke(_input) {
    return {
      summary: 'Custom Soul App exploration session completed.',
    }
  },
}

describe('Custom reference Soul App', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('declares a free-form exploration boundary', async () => {
    expect(CUSTOM_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-custom')
    expect(customReferenceSoulApp.manifest.id).toBe('aiworker-custom')
    expect(await customReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-custom', permissions: customReferenceSoulApp.manifest.permissions })).toEqual([])
    expect((await customReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-custom', permissions: customReferenceSoulApp.manifest.permissions }, { capabilityId: 'explore' }))?.id).toBe('explore')
    expect(customManifestJson.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'read', kind: 'storage', target: 'aiworker-custom' }),
      expect.objectContaining({ action: 'write', kind: 'storage', target: 'aiworker-custom' }),
      expect.objectContaining({ action: 'mount', kind: 'ui', target: 'custom-micro-app' }),
    ]))
    expect(customManifestJson.workspaceTypes[0]?.id).toBe('sandbox')
    expect(customManifestJson.capabilities[0]?.id).toBe('explore')
    expect(customManifestJson.connectors.required).toEqual([])
    expect(customManifestJson.connectors.optional).toEqual([])
  })

  it('serves standalone HTML with Custom proof component', () => {
    const standaloneHtml = renderStandaloneHtml()
    expect(standaloneHtml).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(standaloneHtml).toContain('Standalone')
    expect(standaloneHtml).toContain('AIWorker Custom')
  })

  it('requires the Host mount token for mounted service domain routes', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-custom-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`

    try {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
      expect((await fetch(`${baseUrl}/domain`)).status).toBe(401)
      const domainRes = await fetch(`${baseUrl}/domain`, {
        headers: { 'x-aiworker-mount-token': 'test-custom-mounted-token' },
      })
      expect(domainRes.status).toBe(200)
      expect(await domainRes.json()).toMatchObject({ appId: 'aiworker-custom', mounted: true, soul: 'custom' })
      const capabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-custom-mounted-token' },
      })
      expect(capabilitiesRes.status).toBe(200)
      expect(await capabilitiesRes.json()).toMatchObject({
        capabilities: [expect.objectContaining({ id: 'explore' })],
      })
    }
    finally {
      server.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('runs the Custom app in standalone and Host-mounted smoke paths', async () => {
    const standaloneRoot = tempRoot('standalone')
    const standalone = await createStandaloneSoulAppRuntime(customReferenceSoulApp, {
      appHome: standaloneRoot,
      availableConnectorIds: [],
      enabledConnectorIds: [],
      executor,
      hostVersion: '0.19.0',
      now,
      workerId: 'custom-reference-worker',
      workerName: 'Custom Reference',
    })

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-custom', 'explore')
    expect(standalone.snapshot().worker.soulId).toBe('aiworker-custom')
    const workspace = await standalone.runtime.createWorkspace({ name: 'Sandbox', type: 'sandbox' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Explore free-form workspace capabilities.',
      metadata: standalone.sessionMetadata(capabilityId),
      title: 'Exploration',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Explore the workspace.',
      metadata: standalone.sessionMetadata(capabilityId),
      sessionId: session.id,
    })
    expect(result.turn.status).toBe('succeeded')
    expect(result.files).toEqual([])

    const mountedRoot = tempRoot('mounted')
    const mounted = await createMountedSoulAppTestRuntime(customReferenceSoulApp, {
      availableConnectorIds: [],
      dbPath: path.join(mountedRoot, 'worker.db'),
      enabledConnectorIds: [],
      executor,
      hostVersion: '0.19.0',
      now,
      workerId: 'mounted-custom-reference-worker',
      workerName: 'Mounted Custom Reference',
      workersRoot: path.join(mountedRoot, 'workers'),
    })
    expect(mounted.catalog.apps.map(app => app.appId)).toContain('aiworker-custom')
    expect(mounted.catalog.templates.map(template => template.id)).toContain(capabilityId)
    expect(mounted.snapshot().worker.soulId).toBe('aiworker-custom')
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-custom-${label}-`))
    roots.push(root)
    return root
  }
})
```

- [ ] **Step 2: 运行测试验证失败（尚无构建产物）**

```bash
cd apps/aiworker-custom && bun run build:styles && bun test
```

Expected: 部分测试通过，但 standalone HTML style link 和 CSS 相关可能需要在 build:styles 后运行。

- [ ] **Step 3: Commit**

```bash
git add apps/aiworker-custom/host-adapter/index.test.ts
git commit -m "test: 添加 aiworker-custom 集成测试

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 集成到 bootstrap official 流程

**Files:**
- Modify: `packages/core/src/soul-app/official.ts`

- [ ] **Step 1: 添加 aiworker-custom 到 OFFICIAL_SOUL_APPS**

Modify `packages/core/src/soul-app/official.ts:42-51`:

```ts
export const OFFICIAL_SOUL_APPS = [
  {
    id: 'aiworker-hr',
    manifestPath: 'apps/aiworker-hr/soul-app.manifest.json',
  },
  {
    id: 'aiworker-qa',
    manifestPath: 'apps/aiworker-qa/soul-app.manifest.json',
  },
  {
    id: 'aiworker-custom',
    manifestPath: 'apps/aiworker-custom/soul-app.manifest.json',
  },
] as const satisfies readonly OfficialSoulAppDefinition[]
```

- [ ] **Step 2: 运行类型检查和相关测试**

```bash
bun run --filter '@zonease/aiworker-core' typecheck
bun run --filter '@zonease/aiworker-core' test
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/soul-app/official.ts
git commit -m "feat: 将 aiworker-custom 加入官方 Soul App bootstrap

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 构建、验证和冒烟测试

**Files:** (无，纯验证)

- [ ] **Step 1: 安装依赖**

```bash
bun install
```

- [ ] **Step 2: 构建 CSS**

```bash
cd apps/aiworker-custom && bun run build:styles
```

- [ ] **Step 3: 运行类型检查**

```bash
cd apps/aiworker-custom && bun run typecheck
```

Expected: PASS (no type errors)

- [ ] **Step 4: 运行测试**

```bash
cd apps/aiworker-custom && bun test
```

Expected: 所有测试 PASS

- [ ] **Step 5: 运行 app validate**

```bash
cd apps/aiworker-custom && bun run validate
```

Expected: PASS (manifest valid, no Host-private imports, boundary clean)

- [ ] **Step 6: 运行 app smoke**

```bash
cd apps/aiworker-custom && bun run smoke
```

Expected: PASS (standalone + Host-mounted smoke both pass)

- [ ] **Step 7: 运行 CLI 集成测试**

```bash
bun run --filter '@zonease/aiworker-cli' test
```

Expected: PASS (bootstrap official 现在包含 3 个 app)

- [ ] **Step 8: 运行全量 check**

```bash
bun run check
```

Expected: PASS 或有已知非 Custom Soul 导致的失败。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: aiworker-custom 构建与冒烟验证通过

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

1. **Spec coverage**:
   - [x] 创建 `apps/aiworker-custom/` 标准 Soul App → Tasks 1-8
   - [x] `soul-app.manifest.json` 声明通用工作区 → Task 2
   - [x] 极简 `engine-assets/`（空 skills/MCP，最小 AGENTS.md） → Task 3
   - [x] `host-adapter/` 基于官方模板 → Tasks 5-7
   - [x] `aiworker app bootstrap official` 增加 custom soul → Task 9
   - [x] 通过 `aiworker app validate` 和 `aiworker app smoke` → Task 10

2. **Placeholder scan**: 无 TBD、TODO、或模糊描述。所有文件内容完整。

3. **Type consistency**: `customSoulAppManifest`、`customReferenceSoulApp`、`CUSTOM_REFERENCE_APP_BOUNDARY` 命名在 index.ts 和 protocol 文件中一致；测试导入路径匹配。
