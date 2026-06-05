import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface Issue {
  file: string
  message: string
}

const repoRoot = process.cwd()
const issues: Issue[] = []

const canonicalDocs = [
  'docs/architecture.md',
  'docs/protocol.md',
  'docs/runtime.md',
  'docs/soul-authoring.md',
  'docs/testing.md',
]

const activeDocs = ['AGENTS.md', ...canonicalDocs]

const forbiddenActiveDocPhrases = [
  'Host auth is provider-backed',
  'admission',
  'grant enforcement',
  'Host-owned proposal',
  'Host-owned review',
  'generic review/lesson ledger',
  'generic enablement security review',
]

for (const file of activeDocs) {
  if (!existsSync(abs(file)))
    issues.push({ file, message: 'active documentation file is missing' })
}

const expectedDocsEntries = [
  ...canonicalDocs.map(file => path.basename(file)),
  'superpowers',
].sort()
const actualDocsEntries = existsSync(abs('docs')) ? readdirSync(abs('docs')).sort() : []
if (JSON.stringify(actualDocsEntries) !== JSON.stringify(expectedDocsEntries)) {
  issues.push({
    file: 'docs',
    message: `docs tree must contain only canonical contract docs plus current Superpowers process artifacts: expected ${expectedDocsEntries.join(', ')}, found ${actualDocsEntries.join(', ')}`,
  })
}
const superpowersEntries = existsSync(abs('docs/superpowers')) ? readdirSync(abs('docs/superpowers')).sort() : []
if (JSON.stringify(superpowersEntries) !== JSON.stringify(['plans', 'specs'])) {
  issues.push({
    file: 'docs/superpowers',
    message: `Superpowers docs must use only plans/ and specs/ process directories, found ${superpowersEntries.join(', ')}`,
  })
}

requireIncludes('docs/architecture.md', [
  '# AIWorker Architecture',
  'This document is the canonical architecture contract for AIWorker after the\ndestructive refactor.',
  '## Position',
  '## Phase 2 Product MVP',
  '## Decision Coverage Index',
  '## Ownership',
  '## Daemon Topology (daemon-per-worker)',
  'A Worker daemon hosts at most one active Worker.',
  'The Worker never registers with or pushes to\nHost.',
  '## Monorepo Boundary',
  '## Protocol Boundary',
  '## Runtime Boundary',
  '## Freeform V1',
  '## Destructive Migration Rules',
  'Older PMA notes, changelogs, historical audits, old local\nskills, and temporary drafts are evidence only. They do not override this file.',
  'tmp/refactor decisions are evidence until promoted',
  'Accepted refactor decisions\nbecome active authority only when they are represented in the canonical docs,\nguarded by tests, or both.',
  '- docs/protocol.md owns descriptor, broker route, configuration envelope, and the\n  Phase 2 Host↔Worker control contract.',
  '- docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts.',
  '- docs/soul-authoring.md owns SDK authoring, convention discovery, build output,\n  native MCP source layout, and Freeform source contract.',
  '- docs/testing.md owns the coverage ledger, guardrail mapping, Phase 2 MVP\n  experience acceptance, and historical implementation-teardown record.',
  'CLI-first',
  // NEW MODEL: worker owns + directly renders its workbench, Soul = template, v1 standalone only, Host Phase 2 dormant
  'AIWorker turns one expert\'s professional capability into many employees\'\nproduction capacity.',
  'Soul is the capability carrier. Host is the iteration and replication lever.\nWorker is the employee-side ready-to-use terminal.',
  'AIWorker is therefore a worker-centric product. A Worker is an autonomous,\nCLI-first runtime that runs one Soul through a native engine and owns engine\nlaunch.',
  'A Worker runs fully standalone. v1 ships the standalone Worker only; the Host\ncontrol plane is Phase 2 and is never on the runtime hot path.',
  'A Worker owns and directly renders its Workbench — the Worker\'s own employee web.\nThe Workbench is not a mounted micro-app and is not provided by the Soul. v1 has\nno micro-app anywhere.',
  'Worker -> Workbench -> workspace -> session (chat) -> native engine',
  'Host is an optional control plane for Soul release, distribution, permission\nallocation, connector authorization, and Worker provisioning records. Host is\nPhase 2 and is never on the runtime hot path.',
  'Host does not spawn, observe, or\nhold engine processes.',
  'The Phase 2 MVP is Soul distribution and employee Worker authorization:',
  'expert author -> published Soul version -> Host assignment -> employee Worker',
  'The MVP user experience must prove three things:',
  'author experience: a professional capability can be packaged, published, and\n  iterated without turning the Soul into an app or backend',
  'administrator experience: one published capability can be copied to many\n  employees with visible assignment, connector authorization, gateway/profile\n  reference, Worker readiness, and rollout status',
  'employee experience: the result feels like "my AI worker is ready", not like a\n  technical deployment, Host dashboard, embedded page, or configuration chore.',
  'Phase 2 must not use mount, mounted workbench, micro-app, iframe, or Host-rendered\nWorker UI as product value.',
  'descriptor-only',
  'packages/core and packages/shared disappear',
  // Soul = template
  'A Soul is a template: a named, descriptor-only bundle of engine assets',
  'A Soul has no UI, no app-owned API, no\ncapability layer, and no domain backend',
  'A Worker is a running instance bound to one Soul.',
  '`souls/aiworker-freeform` is the only strong v1 acceptance Soul. It proves the\nstandalone framework loop with Host absent:',
  'HR and QA remain first-party Soul identities, but they migrate after Freeform as\ndescriptor-producing templates and do not block the v1 framework loop.',
  // monorepo shape (no soul-workbench/soul-app-runtime; host-* are Phase 2 dormant stubs)
  'The v1 top-level shape is:',
  '`apps/*` are runnable product shells. `souls/*` are descriptor-producing Soul\ntemplate packages.',
  '`worker-*` packages must not\nimport `host-*` packages.',
  'The Workbench has no package of its own: it lives in `apps/worker-web`, composed\nfrom `packages/ui` primitives. The retired `soul-workbench` and `soul-app-runtime`\npackages are removed; v1 has no Soul-provided UI and no mounted-workbench\nmachinery.',
  'Do not create\n`core-v2`, `shared-v2`, or any replacement dumping ground.',
  '`apps/api` migrated into `packages/worker-daemon`.',
  // descriptor minimal
  'Descriptor v1 is intentionally minimal: `protocol`, `identity`, `engine` asset\nrefs and engine targets. It carries no workbench, no app-owned API, no\ncapabilities, and no domain business concepts.',
  'The Worker owns and renders its Workbench directly. v1 has no micro-app, no\nmounted-workbench resolution, and no Soul-provided UI.',
  // Phase 2 control plane
  'Phase 2 Host integration has two\ndistribution-plane directions:',
  'Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host',
  'Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.',
  'The control contract covers worker describe, health, instance lifecycle, and an\nassignment envelope. It must not carry session, invocation, projection, engine,\nor domain data. The assignment envelope is the distribution record that lets Host\ncopy a published Soul version plus authorized connectors, permissions, and\ngateway/profile refs to employee Workers.',
  // session = chat, no capability
  'A session is a Worker\nlocator for a workspace and its invocation references; it carries no capability.\nA session is, to the employee, a chat: a composer and a transcript over one\nworkspace.',
  'The Worker, not Host, prepares engine invocation context and observes\nnative engine output.',
  // two-phase migration
  'This refactor is contract-first and runs in two phases.',
  'Host must not own session, invocation, projection, engine processes, domain\nstate, or secrets. A Worker must not depend on Host to run.',
  'Do not modify the new architecture to satisfy old E2E assumptions. Legacy\napp-local adapter exports are removed, not migrated.',
])

requireIncludes('AGENTS.md', [
  '# AIWorker Agent Bootstrap',
  '默认用中文与用户交流。文档、代码注释、commit message、PR title/description 也默认中文，除非用户另有要求。',
  '## Authority',
  '## Product Boundary',
  '## Monorepo Boundary',
  '## Protocol Boundary',
  '## Runtime Boundary',
  '## Workflow',
  '## UI',
  'canonical docs',
  'Superpowers',
  'AIWorker 的核心 = 让一个懂行的人，把一套专业能力做成 Soul、快速迭代，再低成本复制给一群不懂技术的员工；每个员工因此拥有一个开箱即用的专属 AI 工作者。',
  'Soul = 能力载体；Host = 迭代 + 复制的杠杆；Worker = 员工侧开箱即用的终端。一个人的能力 → 全员的产能。',
  'Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面：Soul 发布 / 分发 / 管理 / 权限分配 / connector 授权 / Worker provisioning（Phase 2）。',
  'CLI-first',
  'descriptor-only',
  'POST /api/sessions/:sessionId/invocations',
  'Author-owned native MCP files may contain literal secrets',
  'tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation',
  'shadcn',
  // NEW MODEL: v1 standalone only, worker owns + renders workbench, Soul = template, Host Phase 2
  'v1 只发 standalone Worker：Host 与 control-protocol 全是 Phase 2，永不在运行热路径上。Worker 创建时绑定一个 Soul（终生不变），拥有并直接渲染自己的 Workbench。默认路径：',
  'Worker -> Workbench -> workspace -> session (chat) -> native engine',
  'Soul 是 template：descriptor-only 的 skills / mcp / entry-file（如 AGENTS.md、CLAUDE.md）资产束，没有 UI、没有 app-owned API、没有 capability。',
  '禁止创建 `core-v2` / `shared-v2`。`packages/core` 与 `packages/shared` 最终消失。`apps/api` 迁移为 `packages/worker-daemon`。',
  'Host/Soul 是 descriptor-only：Host 与 Workbench 只消费 `dist/soul.descriptor.json`，不读 Soul source、不 import Soul 私有模块、不解释领域字段。',
  'Worker 拥有并直接渲染 Workbench；v1 没有 micro-app、没有 mounted-workbench、没有 Soul 提供的 UI。',
  'Phase 2 Host 不 mount / frame / render Worker Workbench。Phase 2 允许 Worker 主动 check-in Host 并建立 Worker Access reverse tunnel；这些只属于分发/访问闭环，不让 Host 进入 Worker runtime 热路径。',
  'Descriptor v1 极简：`protocol / identity / engine` 资产束，无 workbench / api / capability。',
  'Session 只保留 lifecycle：`active | archived | deleted`。Execution/process 状态属于 `engine_invocations`。',
  'Native engine 采用 B+ structured bridge。Worker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler、engine 启动；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。',
  '`worker-*` 包禁止 import `host-*` 包。Worker 必须能脱离 Host 独立运行。',
  'Workbench 并入 `apps/worker-web`，不再有 soul-workbench / soul-app-runtime 包。',
  'Use Superpowers for brainstorming, non-trivial planning, TDD, systematic debugging, and verification before completion.',
  'Destructive refactor is allowed before 1.0. Keep changes scoped to the current phase. Do not change the new architecture to satisfy old E2E assumptions.',
  'Code changes need focused contract tests appropriate to scope.',
  'For code changes, run code-review-graph unless the change is docs-only, instruction-only, or pure formatting.',
  'UI work must use shadcn-managed primitives and `packages/ui` as the shared UI source.',
  'Soul provides no UI; the Worker owns and renders the Workbench. Host must not render Soul domain UI.',
])
requireMaxLines('AGENTS.md', 90)

forbidIncludes('AGENTS.md', [
  'docs/plan',
  'docs/task',
  'docs/superpowers',
  'docs/changelog.md',
  'docs/soul-app-developer.md',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  'PMA requirement',
])

for (const file of ['README.md', 'README.zh-CN.md', 'README.ja.md']) {
  requireIncludes(file, canonicalDocs)
  forbidIncludes(file, [
    'docs/plan',
    'docs/task',
    'docs/superpowers',
    'docs/changelog.md',
    'docs/soul-app-developer.md',
    'docs/cli.md',
    'docs/deployment.md',
    'docs/executor-engines.md',
    'aiworker-host-dev',
    'aiworker-soul-app-dev',
  ])
}

requireIncludes('docs/protocol.md', [
  '# AIWorker Protocol',
  'This document defines the canonical Soul descriptor contract, the local broker\nroutes, and the Phase 2 Host-to-Worker distribution control contract.',
  '## Descriptor-Only Install And Runtime',
  '## Descriptor V1 Shape',
  '## Configuration',
  '## Engine And Projection References',
  '## Broker Routes',
  'rejects creation when the daemon already hosts an active',
  'dist/soul.descriptor.json',
  'Souls are installed through:',
  'The Worker validates and caches the descriptor, then routes local operations through\ngeneric broker APIs. The Workbench and Host do not read Soul source, import Soul\nprivate modules, or interpret domain semantics.',
  'Worker configuration is worker-scoped and SDK-standard; it is not a descriptor\nsection. Values use stable envelopes stored in Worker metadata',
  'Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.',
  // descriptor minimal: only protocol/identity/engine
  'A Soul is a template — a descriptor-only bundle of engine assets. Descriptor v1\ncontains only these top-level sections:',
  'protocol\nidentity\nengine',
  'Descriptor v1 carries no workbench, no app-owned API, no capabilities, and no\nconfiguration, health, compatibility, extensions, or external sections.',
  'The Worker owns and renders its Workbench; the\nSoul provides no UI.',
  // broker route block (no /api/capabilities, /api/mount/workbench, /api/apps)
  'POST   /api/sessions/:sessionId/invocations',
  'The local daemon broker exposes platform routes, including:',
  'POST   /api/app-installation/install\nGET    /api/app-installation/apps\nGET    /api/app-installation/apps/:appId\nPOST   /api/app-installation/apps/:appId/enable\nPOST   /api/app-installation/apps/:appId/archive\nDELETE /api/app-installation/apps/:appId\n\nGET    /api/info\nGET    /api/settings\nPATCH  /api/settings\n\nPOST   /api/workers\nGET    /api/workers\nGET    /api/workers/:workerId\nPATCH  /api/workers/:workerId\nPOST   /api/workers/:workerId/archive\nDELETE /api/workers/:workerId\n\nGET    /api/workers/:workerId/config\nPUT    /api/workers/:workerId/config/:configKey\nPATCH  /api/workers/:workerId/config/:configKey\nPOST   /api/workers/:workerId/config/:configKey/archive\n\nPOST   /api/workspace-locators\nGET    /api/workspace-locators\nGET    /api/workspace-locators/:workspaceId\nPATCH  /api/workspace-locators/:workspaceId\nPOST   /api/workspace-locators/:workspaceId/archive\nDELETE /api/workspace-locators/:workspaceId\n\nPOST   /api/sessions\nGET    /api/sessions\nGET    /api/sessions/:sessionId\nPATCH  /api/sessions/:sessionId\nPOST   /api/sessions/:sessionId/archive\nDELETE /api/sessions/:sessionId\nPOST   /api/sessions/:sessionId/invocations\n\nGET    /api/engine/targets\nGET    /api/engine/targets/:target/readiness\nPOST   /api/engine/targets/rescan\nPOST   /api/engine/targets/:target/test\nPOST   /api/engine/invocations\nGET    /api/engine/invocations/:invocationId\nGET    /api/engine/invocations/:invocationId/events\nPOST   /api/engine/invocations/:invocationId/cancel\nPOST   /api/engine/invocations/:invocationId/reconcile\n\nPOST   /api/projections/:target/refresh\nGET    /api/projections/receipts/:receiptId\nPOST   /api/projections/receipts/:receiptId/cleanup',
  'Descriptor engine sections describe packaged asset refs and target engines.',
  'Runtime projection materializes workspace files, skills, native MCP files, and\nentry files for the selected engine target.',
  'Descriptors may include lightweight summaries and refs. They must not copy\nsecret-like values from native files.',
  'These are broker routes, not business product APIs.',
  'GET    /api/app-installation/apps/:appId',
  'POST   /api/app-installation/apps/:appId/archive',
  'DELETE /api/app-installation/apps/:appId',
  'PATCH  /api/workers/:workerId',
  'POST   /api/workers/:workerId/archive',
  'DELETE /api/workers/:workerId',
  'PATCH  /api/workers/:workerId/config/:configKey',
  'POST   /api/workers/:workerId/config/:configKey/archive',
  'PATCH  /api/workspace-locators/:workspaceId',
  'POST   /api/workspace-locators/:workspaceId/archive',
  'DELETE /api/workspace-locators/:workspaceId',
  'PATCH  /api/sessions/:sessionId',
  'POST   /api/sessions/:sessionId/archive',
  'DELETE /api/sessions/:sessionId',
  // worker config envelope
  'configValueJson envelope',
  'kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy',
  '`kind` is one of `engine-selection`, `projection-overlay`, `skill-overlay`,\n`mcp-overlay`, `entry-file-overlay`, or `workbench-preference`.',
  '`target` is an\nengine target, `all`, or `none`.',
  '`updatedBy` records caller class such as `cli` or `web`, not user identity.',
  // Phase 2 control contract
  '## Host-to-Worker Control Contract',
  '`packages/worker-control-protocol` defines a transport-agnostic control contract.',
  'It covers worker.describe, worker.health, worker.lifecycle, and a worker.assignment\nenvelope.',
  'Phase 2 Host integration has two distribution-plane directions:',
  'Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host',
  'Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.',
  'The Host control plane is Phase 2 and is not on the v1 runtime path.',
  'Host does not mount, frame, embed, render, or proxy\nthe Worker\'s Workbench.',
  'The control contract must not carry session, invocation, projection, engine, or\ndomain data. The assignment envelope is a distribution record',
  '`worker.describe` may include the Worker-owned `workbenchUrl` so Host can direct\nan employee to their Worker. It must not expose a mount entry, micro-app entry,\nrouter mode, app-owned route, or Host-rendered surface.',
  'publish Soul version -> assign to employee/group -> provision employee Worker -> employee opens Worker Workbench',
  'POST   /api/provision/check-in',
  'GET    /api/provision/access',
  'GET    /workers/:workerId',
  'Host owns the publish/assign/provision governance path. Worker owns the\nWorkbench, workspace, session, invocation, projection, engine bridge, runtime\nconfiguration overlays, and redaction.',
  // 钉死倒置后归属:workspace locator metadata 归 Worker（a6c75512,验收 #3 补 pin 防静默 revert）。
  'creates Worker workspace locator metadata plus projection-owned bootstrap\n  files.',
  // workspaces are created under the Worker home dir; no client-chosen rootPath (AIWorker is not a dev tool)
  'Workspace roots are derived under the Worker home directory',
])
forbidIncludes('docs/protocol.md', [
  'host-adapter',
  'source exports',
  '/api/capabilities',
  '/api/mount/workbench',
  '/api/apps/:appId',
])

requireIncludes('docs/runtime.md', [
  '# AIWorker Runtime',
  'This document defines canonical runtime behavior.',
  // NEW MODEL: six chains, chain 5 is worker-owned Workbench (no mounted workbench, no app-owned API proxy)
  'The runtime is six chains:',
  '1. Soul authoring and descriptor build.\n2. Descriptor install and worker enablement.\n3. Session start and first invocation.\n4. Runtime skills, MCP, and entry-file CRUD.\n5. Worker-owned Workbench: workspace and session chat.\n6. Archive and delete.',
  'Phase 2 adds organization-side Soul distribution, but it does not add a Host\nruntime chain.',
  'The employee\nstill experiences a ready-to-use Worker with its own Workbench, workspace,\nsession chat, projection, engine bridge, lifecycle, and redaction.',
  '`packages/worker-daemon` owns the local broker API used by the Worker CLI and the\nWorker Workbench web. It forwards orchestration to `packages/worker-runtime`.',
  'The daemon is not a product backend and does not own domain routes.',
  'A daemon reconstitutes at most one active Worker at bootstrap',
  'session lifecycle: active | archived | deleted',
  '## Runtime Chains',
  '## Local Daemon',
  '## Session And Invocation State',
  '## Engine Bridge',
  '## Projection',
  '## Runtime skills, MCP, and entry-file CRUD',
  '## Secrets And Redaction',
  '## Lifecycle',
  'execution/process state belongs to engine_invocations',
  'POST /api/sessions/:sessionId/invocations',
  'Session lifecycle describes whether the locator remains available in AIWorker.\nIt does not describe engine execution.',
  // session = chat, no capability
  'A session is a chat over one workspace: a composer and a transcript. It records no\ncapability.',
  'Historical SQLite column names may remain only\nbehind the storage boundary while migrations are collapsed.',
  'Follow-up is session-level:',
  'Follow-up uses the same worker, workspace locator, AIWorker session, and engine\ntarget.',
  'Native resume uses the latest opaque external session ref when the\nadapter supports it. The bridge must not silently create a fresh native session\nwhen resume data is missing.',
  'Engine invocation status:',
  'queued\nstarting\nrunning\nsucceeded\nfailed\ncancelled\nlost',
  'Engine process state:',
  'not_spawned\nspawned\nexited\nkilled\nlost',
  'B+ structured native engine bridge',
  'AIWorker uses B+ structured native engine bridge.',
  '`packages/engine-bridge` owns:',
  '- adapter registry;\n- discover/start/follow-up/cancel contract;\n- process manager;\n- raw chunk redaction;\n- normalized bridge event pipeline;\n- event stream reattach;\n- reconciler;\n- opaque external session refs.',
  'Native engines own:',
  '- model calls;\n- tool loops;\n- approval flow;\n- sandbox behavior;\n- authentication;\n- profile state;\n- native plugins;\n- native session internals.',
  'Worker orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.',
  '`packages/engine-projection` materializes engine-facing files from descriptor\nasset refs and worker-scoped configuration overlays.',
  'Worker runtime calls it\nbecause the Worker owns workspace locator, session, selected engine, worker\nconfiguration, and filesystem root facts.',
  'Host does not define skill format, MCP\nsemantics, or domain files.',
  'Projection owns:',
  '- workspace assets;\n- skills;\n- native MCP files;\n- entry files;\n- projection receipts;\n- receipt-based cleanup.',
  'Projection cleanup removes receipt-owned files only. Workspace business files\nremain Soul/user-owned.',
  'Runtime skills, MCP, and entry-file CRUD',
  'Runtime skills, MCP, and entry-file CRUD is a first-class runtime chain.',
  '- The Worker CLI or the Worker Workbench web requests an SDK-standard worker\n  configuration action.\n- The Worker validates and stores worker-scoped overlay records.\n- Worker-scoped overlay records live in Worker metadata; projected file contents do not.\n- `engine-projection` materializes descriptor assets plus overlays for one\n  selected engine target.\n- Projection writes a receipt for cleanup, freshness, and diagnostics.',
  'Workspace assets are single-source. Skills are single-source by default with\nexplicit engine override only when necessary. MCP uses one native file per\nengine target, such as Codex `config.toml` and Claude Code `.mcp.json`.',
  'ENGINE_SESSION_REF_MISSING',
  'ENGINE_CANCEL_FAILED',
  'PROJECTION_RECEIPT_MISSING',
  'PROJECTION_RECEIPT_STALE',
  'WORKSPACE_LOCATOR_MISSING',
  'WORKSPACE_ROOT_MISSING',
  'BRIDGE_REDACTION_FAILED',
  'Allowed bridge event classes',
  'Allowed bridge event classes are generic invocation and process observations:',
  'invocation.started',
  'invocation.progress',
  'invocation.output.delta',
  'invocation.output.snapshot',
  'invocation.tool.observed',
  'invocation.usage.observed',
  'invocation.warning',
  'invocation.error',
  'invocation.completed',
  'invocation.cancelled',
  'process.started',
  'process.exited',
  'process.lost',
  'Bridge events are generic observations. They must not encode Soul domain verdicts\nsuch as review approved, release failed, candidate created, artifact accepted, or\nbusiness confirmed.',
  'Failure codes are platform-level and stable enough for tests and diagnostics.',
  'Cancel targets an invocation id. The bridge sends adapter-level protocol cancel\nwhen supported, then soft interrupt, then process-group termination after the\ngrace period.',
  'Delayed hard kill must never terminate a newer invocation.',
  'Author-owned native MCP files may contain literal secrets',
  'AIWorker does not manage engine login, token refresh, account selection, or\nengine profiles.',
  'Author-owned native MCP files may contain literal secrets. AIWorker must not copy\nthose values into descriptors, DB, projection receipts, logs, diagnostics,\nOpenAPI examples, or UI.',
  'Anything emitted by CLI, Web, logs, API errors, event\nstreams, or diagnostics must be redacted before persistence or display.',
  // #3 session deleted 消歧: reserved enum vs hard-delete operation
  'v1 has no soft-delete producer — no code path sets session status to',
  'Session DELETE (`DELETE /api/sessions/:sessionId`) is a hard delete that physically removes the session row',
  'Archive is the default lifecycle operation for workers, workspace locators, and\nsessions.',
  'Hard delete is explicit and removes Worker metadata plus receipt-owned\nprojection files only.',
  'Physical workspace root deletion is a separate dangerous\naction and is not the default lifecycle behavior.',
  // 钉死 BYOK 密钥脱敏边界用泛化 DB（非 Host DB）（a6c75512,验收 #3 补 pin 防静默 revert）。
  'resolved key is read from the environment at call time and is never persisted to\nDB, projection receipts, logs, diagnostics, OpenAPI examples, or UI.',
  // NEW MODEL: standalone zero-config entry (aiworker start); worker-web pure workbench, empty-state = first-run
  '## Standalone Entry',
  'The standalone entry is one zero-config command.',
  'the daemon stays passive and never\nauto-creates a Worker.',
  'Auto-bootstrap stops at the Worker; the first workspace is the employee\'s\nfirst action in the Workbench.',
  'In Phase 2, a Host-provisioned employee Worker keeps the same Workbench\nexperience. The first screen must read as "my AI worker is ready", not "Host\nmounted a remote surface".',
  'Host→Worker assignment and lifecycle signals are Phase 2 distribution inputs.',
  'Phase 2 provisioning check-in and Worker Access tunnel signals are distribution-plane signals.',
  'Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host',
  'Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.',
  'assignment changes may update Worker-scoped authorization and\nselection metadata at explicit sync points, but they must not expose session\ncontent to Host, interrupt native engine execution, replace projection ownership,\nor make the Worker depend on Host for normal work.',
])

requireIncludes('docs/soul-authoring.md', [
  '# AIWorker Soul Authoring',
  'This document defines the canonical Soul authoring contract.',
  '## Default Path',
  '## Source Layout',
  '## Convention Discovery',
  '## SDK Responsibilities',
  '## Engine Assets',
  '## Freeform V1',
  'Soul authoring is SDK-centered and CLI-first. The 30-second path should be:',
  'aiworker soul create my-soul\ncd souls/my-soul\naiworker soul build\naiworker app install dist/soul.descriptor.json',
  'The SDK uses directory conventions for the common path and a small\n`soul.config.ts` for identity and explicit overrides.',
  'souls/*',
  'soul.config.ts',
  '`packages/soul-sdk` owns:',
  '- author-facing declarations;\n- convention discovery;\n- descriptor generation;\n- descriptor validation;\n- engine asset discovery;\n- SDK-standard worker configuration model;\n- build output under `dist/`.',
  // Soul = template of engine assets only, no UI / no app-owned API; Worker owns + renders the Workbench
  'A Soul is a template of engine assets only. It has no capabilities, no workbench\nsource, and no `web/` or `api/` surfaces: the Worker owns and renders the\nWorkbench, and the Soul provides no UI and no app-owned API.',
  'The SDK builds the descriptor and the projected engine assets. It does not build a\nSoul workbench, a Soul UI, or an app-owned API; those are not part of the Soul\ncontract. The Worker owns and renders the Workbench from `apps/worker-web`.',
  'Workspace files, skills, native MCP files, and entry files are authored by the\nSoul and projected at runtime by engine projection.',
  'AIWorker validates syntax and target names, derives lightweight non-secret\nsummaries, and projects native files. It must not copy secret-like values into\ndescriptor summaries, DB, receipts, logs, diagnostics, inspect output, or\nUI.',
  'author-owned native MCP files may contain literal secrets',
  '`souls/aiworker-freeform` is the v1 acceptance Soul',
  '- soul id `aiworker-freeform`;\n- display name `AIWorker Freeform`;\n- one minimal projected skill;\n- Codex native MCP placeholder at `engine/mcp/codex/config.toml`;\n- Claude Code native MCP placeholder at `engine/mcp/claude-code/.mcp.json`;\n- one projected entry file `AGENTS.md`.',
  'Freeform must use SDK authoring, descriptor-only install, projection, engine\nbridge, and session-level follow-up. The session experience is the worker-owned\nWorkbench rendering the session chat over the Freeform workspace.',
  // source layout: engine assets only, no product/ web/ api/
  'Minimum useful layout:',
  'souls/my-soul/\n  package.json\n  soul.config.ts\n  engine/\n    workspace/\n    skills/\n    mcp/\n      codex/\n        config.toml\n      claude-code/\n        .mcp.json',
  'Convention discovery',
  'Convention discovery uses the common authoring path from:',
  'engine/workspace/*\nengine/skills/*\nengine/mcp/codex/config.toml\nengine/mcp/claude-code/.mcp.json',
  'engine/workspace/*',
  'engine/skills/*',
  'engine/mcp/codex/config.toml',
  'engine/mcp/claude-code/.mcp.json',
  'dist/engine-assets/',
  'Custom API and artifact helpers are explicit SDK or configuration surfaces',
  'not part of current',
  'convention discovery or build output',
  'Custom API and artifact helpers are explicit SDK or configuration surfaces; they\nare not current convention-discovery inputs.',
  'Custom app-owned API entries must be\nexplicit descriptor/build inputs when supported; they are not part of current\nconvention discovery or build output.',
  'Discovery output must tell the author what the SDK found and which descriptor\nsections it generated.',
  '`soul.config.ts` owns identity, display name, explicit\ninclude/exclude choices, advanced build overrides, and SDK module opt-ins.',
  'It\nmust not become a Host integration file, a handwritten descriptor, or arbitrary\nHost-readable configuration.',
  'Build output is installed through descriptor references.',
  // dist tree: engine-assets only, no web/
  'dist/\n  soul.descriptor.json\n  engine-assets/\n    workspace/\n    skills/\n    mcp/\n      codex/config.toml\n      claude-code/.mcp.json',
])
forbidIncludes('docs/soul-authoring.md', [
  'product/api/index.ts',
  'product/artifacts/*',
  'dist/api/',
  '  web/\n  api/\n  engine-assets/',
])
requireIncludes('packages/soul-sdk/src/descriptor-build.test.ts', [
  'api/src/index.ts',
  'not.toContain(\'api\')',
  'not.toHaveProperty(\'api\')',
])
if (!read('packages/soul-sdk/src/descriptor-build.test.ts').includes('keeps app-owned API source out of convention discovery and build output')) {
  issues.push({
    file: 'packages/soul-sdk/src/descriptor-build.test.ts',
    message: 'SDK API convention discovery must stay explicit',
  })
}

requireIncludes('docs/testing.md', [
  '# AIWorker Testing',
  'This document defines the canonical verification contract.',
  '## Testing Model',
  '## Required Test Areas',
  '## Current Bootstrap Gate',
  '## Canonical Coverage Ledger',
  '## Current Release Gates',
  '## Release Exit Criteria',
  '## Browser Proof Scope',
  'bun run test:contracts',
  'Current release confidence is built from these gates:',
  'bun run docs:check\nbun run test:contracts\nbun run test:protocol\nbun run test:cli\nbun run test:browser:freeform\nbun run typecheck\nbun run lint\nbun run build\nbun run smoke:dist-release\nbun run smoke:standalone-release\nbun run smoke:standalone-runtime\nbun run smoke:npm-package\nbun run test\nbun run check',
  '`bun run release:check` is the aggregator for this current release gate list.',
  '`bun run release:check` must exactly aggregate the Current Release Gates.',
  'Tag release handoff must run post-compile artifact proof after `release:check`\nand before npm publish or GitHub release attachment.',
  'bun apps/worker-cli/scripts/package-release-bundles.ts\nbun apps/worker-cli/scripts/smoke-release-artifacts.ts',
  'The artifact smoke must verify checksums, required resources, descriptor references, executable mode, and current-platform `aiworker --version` startup.',
  'Contract tests are the primary guardrail',
  'Contract tests are the primary guardrail for this destructive refactor. Old E2E\nvolume is not architecture proof.',
  'The baseline favors focused static, unit, package, CLI, and browser proof over\nlarge historical flows.',
  'The first guardrail is:',
  'It verifies that canonical docs exist, root workspaces include `souls/*`,\n`AGENTS.md` is a short bootstrap, session lifecycle is separate from invocation\nstate, protocol/authoring remain descriptor-only and native-MCP based, and broad\nreplacement buckets such as `core-v2` and `shared-v2` do not appear.',
  'Architecture tests:',
  'tests/architecture/\n  forbidden-host-domain-schema.test.ts\n  freeform-soul-contract.test.ts\n  inversion-guards.test.ts\n  package-ownership.test.ts\n  refactor-contract.test.ts',
  'Protocol tests:',
  'packages/soul-descriptor/src/\n  descriptor-v1.test.ts\n  index.test.ts\n  lib/ids.test.ts',
  'SDK tests:',
  'packages/soul-sdk/src/\n  descriptor-build.test.ts',
  'Worker runtime tests:',
  'packages/worker-runtime/src/\n  config/worker.test.ts\n  index.test.ts\n  orchestration/identity-provider.test.ts\n  orchestration/orchestrator.test.ts\n  soul-app/registry.test.ts\n  worker/engine-env.test.ts\n  worker/executor.test.ts\n  worker/local-engine-resolver.test.ts\n  worker/runtime.test.ts',
  'Engine projection tests:',
  'packages/engine-projection/src/\n  index.test.ts\n  workspace-projection.test.ts',
  'Engine bridge tests:',
  'packages/engine-bridge/src/\n  bridge-contract.test.ts\n  index.test.ts',
  'Worker daemon tests:',
  'packages/worker-daemon/src/\n  modes/worker.local.test.ts\n  modes/worker/control.test.ts\n  shared/middleware/error-handler.test.ts',
  'Boundary guard tests:',
  'scripts/check-soul-app-boundaries.test.ts',
  'CLI and browser tests:',
  'apps/worker-cli/src/freeform-golden-path.test.ts\napps/worker-cli/src/aiworker.test.ts\ntests/browser/freeform-cli-golden-path.spec.ts',
  'CLI release smoke contract tests:',
  'apps/worker-cli/scripts/smoke-dist-release.test.ts\napps/worker-cli/scripts/smoke-release-artifacts.test.ts\napps/worker-cli/scripts/smoke-npm-package.test.ts\napps/worker-cli/scripts/smoke-standalone-release.test.ts\napps/worker-cli/scripts/smoke-standalone-runtime.test.ts',
  'CLI release packaging contract tests:',
  'apps/worker-cli/src/official-freeform-descriptor.test.ts\napps/worker-cli/scripts/build-publish-manifest.test.ts\napps/worker-cli/scripts/package-release-bundles.test.ts',
  'OpenAPI and redaction contract tests:',
  'packages/worker-daemon/src/modes/worker.local.test.ts\npackages/storage-sqlite/src/worker/index.test.ts\npackages/engine-bridge/src/bridge-contract.test.ts\npackages/engine-projection/src/workspace-projection.test.ts',
  'The v1 browser proof is Freeform-only and standalone:',
  'Worker Workbench opens standalone with Host absent on worker/workspace/session locator\n-> renders the session chat directly in the worker Workbench without any micro-app\n-> verifies the first invocation and starts a session-level follow-up from browser context\n-> shows bridge event refs in the session chat\n-> cancels a queued invocation without changing session lifecycle\n-> reattaches and reconciles engine bridge events\n-> refreshes projection receipts from the Workbench\n-> applies worker config overlay and observes worker-overlay projection receipts\n-> archives the session and rejects follow-up\n-> archives workspace without exposing Worker archive from browser context',
  'Do not modify the new architecture to satisfy old E2E assumptions. Delete or\nrewrite tests that require Host to import Soul source, expect old daemon product\nbackend behavior, expect a Soul-provided mounted workbench, or encode\n`router-mode="pure"` as production behavior.',
  'tests/browser/freeform-cli-golden-path.spec.ts',
  // Phase-B teardown debt tracked in testing.md
  '## Pending Implementation (Phase-B Teardown)',
  'Canonical Coverage Ledger',
  'Coverage status values:',
  '- `docs+tests`: preferred for high-risk architecture boundaries.\n- `docs-only`: acceptable for explanatory or low-risk guidance.\n- `tests-only`: acceptable for mechanical constraints where docs would be noisy.\n- `tmp-only`: evidence only. tmp-only is not acceptable for closed hard decisions.\n  Use it only when the ledger explains that the idea was exploratory or rejected.',
  '| Decision area | Canonical home | Guardrail | Status |',
  'Worker autonomy / Host control plane',
  'Phase 2 Soul distribution MVP',
  'Descriptor-only Host/Soul boundary',
  'Worker-owned workbench',
  'Session lifecycle and invocation state split',
  'Protocol implementation contract',
  'Runtime and bridge contract',
  'OpenAPI and redaction boundary',
  'BYOK execution-mode deviation and secret boundary',
  'Worker config envelope and Worker metadata security',
  'Soul authoring contract',
  'Worker metadata and forbidden domain schema',
  'Freeform v1 acceptance Soul',
  'docs+tests',
  'docs-only',
  'tests-only',
  'tmp-only',
  'tmp-only is not acceptable for closed hard decisions',
  'Protocol implementation contract',
  'Runtime and bridge contract',
  'Soul authoring contract',
  '## Worker Autonomy Inversion Guards',
  'tests/architecture/inversion-guards.test.ts',
  'C1 worker runs standalone with Host absent',
  'C2 engine launch lives only in worker-*',
  'C3 host-control owns no runtime/domain/secret state',
  'C5 only Host->Worker surface is worker-control-protocol',
  '## Phase 2 MVP Experience Proof Scope',
  'The Phase 2 product proof is not a Host-embedded Workbench proof. It is a Soul\ndistribution and employee readiness proof:',
  'author publishes a Soul version\n-> administrator assigns that Soul version to an employee or group\n-> Host records connector authorization, permission set, and gateway/profile ref\n-> employee Worker is provisioned or located with that assignment\n-> employee opens the Worker-owned Workbench as a ready-to-use AI worker\n-> Host can show assignment, rollout, readiness, and lifecycle status\n-> Host cannot read or render session chat, invocation events, projection output,\n   engine process state, workspace domain files, or literal secrets',
  'author: can iterate a Soul version without adding UI, app-owned API, or Host\n  integration files to the Soul',
  'administrator: can copy one published capability to many employees and see\n  rollout/readiness state without touching employee runtime data',
  'employee: sees a ready Worker and can start a workspace/session without Host,\n  Soul descriptor, MCP, engine-target, or deployment jargon',
  'Phase 2 provisioning: aissh success is not ready until Worker check-in and access ready.',
  'Worker access: `/workers/:workerId` is employee navigation through Worker Access Adapter, not Host-rendered UI.',
  'Auth: Logto proves identity; AIWorker assignment decides exact Worker access.',
  'anti-mount: no Phase 2 acceptance test may treat micro-app, mounted workbench,\n  iframe, or Host-rendered Worker UI as product value.',
])
for (const testPath of documentedTestingPaths()) {
  if (!existsSync(abs(testPath))) {
    issues.push({
      file: 'docs/testing.md',
      message: `listed test file does not exist: ${testPath}`,
    })
  }
}

for (const file of canonicalDocs) {
  forbidIncludes(file, [
    'GOALS.md',
    'aiworker-validate',
  ])
  forbidIncludes(file, forbiddenActiveDocPhrases)
}

const packageJson = JSON.parse(read('package.json')) as {
  engines?: Record<string, string>
  scripts?: Record<string, string>
  workspaces?: string[]
}
const cliPackageJson = JSON.parse(read('apps/worker-cli/package.json')) as {
  engines?: Record<string, string>
}
const expectedReleaseGateCommands = [
  'bun run docs:check',
  'bun run test:contracts',
  'bun run test:protocol',
  'bun run test:cli',
  'bun run test:browser:freeform',
  'bun run typecheck',
  'bun run lint',
  'bun run build',
  'bun run smoke:dist-release',
  'bun run smoke:standalone-release',
  'bun run smoke:standalone-runtime',
  'bun run smoke:npm-package',
  'bun run test',
  'bun run check',
]
const releaseGateCommands = documentedReleaseGateCommands()
if (JSON.stringify(releaseGateCommands) !== JSON.stringify(expectedReleaseGateCommands)) {
  issues.push({
    file: 'docs/testing.md',
    message: `Current Release Gates must list exactly: ${expectedReleaseGateCommands.join(', ')}`,
  })
}
for (const command of releaseGateCommands) {
  const scriptName = command.match(/^bun run ([\w:-]+)$/)?.[1]
  if (!scriptName) {
    issues.push({ file: 'docs/testing.md', message: `Current Release Gates command is not a root bun script: ${command}` })
    continue
  }
  if (!packageJson.scripts?.[scriptName])
    issues.push({ file: 'package.json', message: `Current Release Gates references missing root script: ${scriptName}` })
}
const releaseCheckCommands = packageJson.scripts?.['release:check']?.split(' && ') ?? []
if (JSON.stringify(releaseCheckCommands) !== JSON.stringify(releaseGateCommands)) {
  issues.push({
    file: 'package.json',
    message: 'release:check must match Current Release Gates exactly',
  })
}
for (const testPath of documentedTestingPaths()) {
  for (const finding of documentedTestingCoverageFindings(testPath, packageJson)) {
    issues.push({
      file: 'docs/testing.md',
      message: finding,
    })
  }
}
const testingDoc = read('docs/testing.md')
for (const requiredReleaseExitText of [
  '## Release Exit Criteria',
  '`bun run release:check` must exactly aggregate the Current Release Gates',
  'Tag release handoff must run post-compile artifact proof after `release:check`',
  'bun apps/worker-cli/scripts/package-release-bundles.ts',
  'bun apps/worker-cli/scripts/smoke-release-artifacts.ts',
  'The artifact smoke must verify checksums, required resources, descriptor references, executable mode, and current-platform `aiworker --version` startup.',
]) {
  if (!testingDoc.includes(requiredReleaseExitText)) {
    issues.push({
      file: 'docs/testing.md',
      message: 'Release Exit Criteria must document post-compile artifact proof',
    })
  }
}
for (const requiredBrowserProofScopeText of [
  '-> renders the session chat directly in the worker Workbench without any micro-app',
  '-> verifies the first invocation and starts a session-level follow-up from browser context',
  '-> shows bridge event refs in the session chat',
  '-> cancels a queued invocation without changing session lifecycle',
  '-> reattaches and reconciles engine bridge events',
  '-> refreshes projection receipts from the Workbench',
  '-> applies worker config overlay and observes worker-overlay projection receipts',
  '-> archives the session and rejects follow-up',
  '-> archives workspace without exposing Worker archive from browser context',
]) {
  if (!testingDoc.includes(requiredBrowserProofScopeText)) {
    issues.push({
      file: 'docs/testing.md',
      message: 'browser proof must cover Freeform v1 scope',
    })
  }
}
const workerConfigCoverageNeedles: Array<[string, string]> = [
  [
    'docs/testing.md',
    '| Worker config envelope and Worker metadata security | `docs/protocol.md`, `docs/runtime.md`, `docs/architecture.md` | storage worker config envelope tests, worker-daemon worker config tests, CLI/Web worker config tests, docs check | docs+tests |',
  ],
  [
    'docs/protocol.md',
    'Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.',
  ],
  [
    'docs/runtime.md',
    'Worker-scoped overlay records live in Worker metadata',
  ],
  [
    'packages/storage-sqlite/src/worker/index.test.ts',
    'Soul-owned config payloads are not allowed in Worker metadata',
  ],
  [
    'packages/storage-sqlite/src/worker/index.test.ts',
    'Full native MCP files are not allowed in Worker metadata',
  ],
  [
    'packages/storage-sqlite/src/worker/index.test.ts',
    'Invalid Host worker config envelope updatedBy',
  ],
  [
    'packages/worker-daemon/src/modes/worker.local.test.ts',
    'stores worker config envelopes with secret references but rejects literal secrets',
  ],
  [
    'packages/worker-daemon/src/modes/worker.local.test.ts',
    'WORKER_CONFIG_SECRET',
  ],
  [
    'packages/worker-daemon/src/modes/worker.local.test.ts',
    'config.value.updatedBy).toBe(\'web\')',
  ],
  [
    'apps/worker-cli/src/aiworker.test.ts',
    'rejects literal secrets in worker config envelopes through CLI commands',
  ],
  [
    'apps/worker-web/src/features/local-workspace/api/worker-config.test.ts',
    '/api/workers/worker-1/config/skill-overlay%3Afreeform-session',
  ],
  [
    'apps/worker-web/src/features/local-workspace/api/worker-config.test.ts',
    'updatedBy: \'web\'',
  ],
  [
    'apps/worker-web/src/features/local-workspace/api/worker-overlay-config.test.ts',
    '/api/workers/worker-1/config/skill-overlay%3Ainterview-brief',
  ],
]
for (const [file, needle] of workerConfigCoverageNeedles) {
  if (!read(file).includes(needle)) {
    issues.push({
      file,
      message: 'worker config envelope security must stay covered',
    })
  }
}
if (!packageJson.workspaces?.includes('souls/*'))
  issues.push({ file: 'package.json', message: 'workspaces must include souls/*' })
const expectedNodeEngineRange = '>=20.19.0 <21 || >=22.12.0'
const expectedWorkflowNodeVersion = '24'
const expectedReleaseTargets = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']
const expectedReleaseTargetsLiteral = `['${expectedReleaseTargets.join('\', \'')}']`
const releaseWorkflow = read('.github/workflows/release.yml')
const lintWorkflow = read('.github/workflows/lint.yml')
const releaseWorkflowReleaseCheckIndex = releaseWorkflow.indexOf('bun run release:check')
const releaseWorkflowCompileIndex = releaseWorkflow.indexOf('Compile single-file binaries')
const releaseWorkflowPackageIndex = releaseWorkflow.indexOf('bun apps/worker-cli/scripts/package-release-bundles.ts')
const releaseWorkflowArtifactSmokeIndex = releaseWorkflow.indexOf('bun apps/worker-cli/scripts/smoke-release-artifacts.ts')
const releaseWorkflowPublishIndex = releaseWorkflow.indexOf('npm publish --provenance --access public')
const releaseWorkflowAttachIndex = releaseWorkflow.indexOf('softprops/action-gh-release')
const packageReleaseBundlesScript = read('apps/worker-cli/scripts/package-release-bundles.ts')
const smokeReleaseArtifactsScript = read('apps/worker-cli/scripts/smoke-release-artifacts.ts')
if (packageJson.engines?.node !== expectedNodeEngineRange)
  issues.push({ file: 'package.json', message: `root package must declare Node engine ${expectedNodeEngineRange}` })
if (cliPackageJson.engines?.node !== expectedNodeEngineRange)
  issues.push({ file: 'apps/worker-cli/package.json', message: `published CLI package must declare Node engine ${expectedNodeEngineRange}` })
if (!releaseWorkflow.includes(`node-version: '${expectedWorkflowNodeVersion}'`))
  issues.push({ file: '.github/workflows/release.yml', message: 'GitHub workflows must use Node 24 for release reproducibility' })
if (!lintWorkflow.includes(`node-version: '${expectedWorkflowNodeVersion}'`))
  issues.push({ file: '.github/workflows/lint.yml', message: 'GitHub workflows must use Node 24 for release reproducibility' })
if (
  releaseWorkflowReleaseCheckIndex === -1
  || releaseWorkflowCompileIndex <= releaseWorkflowReleaseCheckIndex
  || releaseWorkflowPackageIndex <= releaseWorkflowCompileIndex
  || releaseWorkflowArtifactSmokeIndex <= releaseWorkflowPackageIndex
  || releaseWorkflowPublishIndex <= releaseWorkflowArtifactSmokeIndex
  || releaseWorkflowAttachIndex <= releaseWorkflowPublishIndex
) {
  issues.push({
    file: '.github/workflows/release.yml',
    message: 'tag release must run release:check, compile, package, smoke artifacts, publish, then attach release assets',
  })
}
requireExactList(
  '.github/workflows/release.yml',
  extractMatches(releaseWorkflow, /--target=bun-([a-z0-9-]+)/g),
  expectedReleaseTargets,
  'release target list must stay aligned',
)
requireExactList(
  '.github/workflows/release.yml',
  extractMatches(releaseWorkflow, /--outfile=aiworker-([a-z0-9-]+)/g),
  expectedReleaseTargets,
  'release target list must stay aligned',
)
requireExactList(
  '.github/workflows/release.yml',
  extractMatches(releaseWorkflow, /^\s+aiworker-([a-z0-9-]+)\.tar\.gz$/gm),
  expectedReleaseTargets,
  'release target list must stay aligned',
)
requireExactList(
  '.github/workflows/release.yml',
  extractMatches(releaseWorkflow, /^\s+aiworker-([a-z0-9-]+)\.tar\.gz\.sha256$/gm),
  expectedReleaseTargets,
  'release target list must stay aligned',
)
if (!packageReleaseBundlesScript.includes(`const DEFAULT_TARGETS = ${expectedReleaseTargetsLiteral} as const`)) {
  issues.push({
    file: 'apps/worker-cli/scripts/package-release-bundles.ts',
    message: 'release target list must stay aligned',
  })
}
if (!smokeReleaseArtifactsScript.includes(`const DEFAULT_TARGETS = ${expectedReleaseTargetsLiteral} as const`)) {
  issues.push({
    file: 'apps/worker-cli/scripts/smoke-release-artifacts.ts',
    message: 'release target list must stay aligned',
  })
}
const requiredReleasePackageResources = [
  'web/worker/index.html',
  'drizzle/worker/meta/_journal.json',
  'assertDrizzleJournalMigrations',
  'official-apps/aiworker-freeform/dist/soul.descriptor.json',
  'README.md',
]
const requiredReleaseSmokeResources = [
  'web/worker/index.html',
  'drizzle/worker/meta/_journal.json',
  'assertDrizzleJournalMigrations',
  'FREEFORM_DESCRIPTOR',
  'README.md',
]
for (const resource of requiredReleasePackageResources) {
  if (!packageReleaseBundlesScript.includes(resource)) {
    issues.push({
      file: 'apps/worker-cli/scripts/package-release-bundles.ts',
      message: 'release artifact required resources must stay aligned',
    })
  }
}
for (const resource of requiredReleaseSmokeResources) {
  if (!smokeReleaseArtifactsScript.includes(resource)) {
    issues.push({
      file: 'apps/worker-cli/scripts/smoke-release-artifacts.ts',
      message: 'release artifact required resources must stay aligned',
    })
  }
}
if (!smokeReleaseArtifactsScript.includes('official-apps/aiworker-freeform') || !smokeReleaseArtifactsScript.includes('dist/soul.descriptor.json')) {
  issues.push({
    file: 'apps/worker-cli/scripts/smoke-release-artifacts.ts',
    message: 'release artifact required resources must stay aligned',
  })
}
for (const [file, source] of [
  ['apps/worker-cli/scripts/package-release-bundles.ts', packageReleaseBundlesScript],
  ['apps/worker-cli/scripts/smoke-release-artifacts.ts', smokeReleaseArtifactsScript],
] as const) {
  if (!source.includes('descriptor reference escapes official app root')) {
    issues.push({
      file,
      message: 'release artifact descriptor references must not escape official app root',
    })
  }
}
if (!read('apps/worker-cli/scripts/package-release-bundles.test.ts').includes('descriptor references resolve outside the official app root')) {
  issues.push({
    file: 'apps/worker-cli/scripts/package-release-bundles.test.ts',
    message: 'release artifact descriptor references must not escape official app root',
  })
}
const testContractsScript = packageJson.scripts?.['test:contracts'] ?? ''
if (!testContractsScript.includes('bun test tests/architecture'))
  issues.push({ file: 'package.json', message: 'test:contracts must run the refactor contract test' })
if (!testContractsScript.includes('scripts/check-soul-app-boundaries.test.ts'))
  issues.push({ file: 'package.json', message: 'test:contracts must run the Host/Soul import boundary test' })
if (packageJson.scripts?.['test:protocol'] !== 'bun run --filter \'@zonease/aiworker-soul-descriptor\' test')
  issues.push({ file: 'package.json', message: 'test:protocol must run the soul-descriptor package test' })
const testCliScript = packageJson.scripts?.['test:cli'] ?? ''
const testBrowserFreeformScript = packageJson.scripts?.['test:browser:freeform'] ?? ''
const hostDaemonOpenApi = read('packages/worker-daemon/src/modes/worker/openapi.ts')
const hostDaemonWorkerLocalTest = read('packages/worker-daemon/src/modes/worker.local.test.ts')
const freeformCliBrowserProof = read('tests/browser/freeform-cli-golden-path.spec.ts')
const freeformBuildScript = 'bun run --filter \'@zonease/aiworker-freeform\' build'
const webBuildScript = 'bun run --filter \'@zonease/aiworker-worker-web\' build'
const browserFreeformProofs = [
  'tests/browser/freeform-cli-golden-path.spec.ts',
]
if (!testCliScript.includes('apps/worker-cli/src/freeform-golden-path.test.ts'))
  issues.push({ file: 'package.json', message: 'test:cli must include the Freeform CLI golden path test' })
if (!testCliScript.includes(freeformBuildScript))
  issues.push({ file: 'package.json', message: 'test:cli must rebuild the Freeform Soul App before CLI golden path tests' })
if (!testBrowserFreeformScript.includes(freeformBuildScript))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must rebuild the Freeform Soul App before browser proofs' })
if (!testBrowserFreeformScript.includes(webBuildScript))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must rebuild Worker Web before browser proofs' })
for (const proof of browserFreeformProofs) {
  requireScriptBefore('test:browser:freeform', testBrowserFreeformScript, freeformBuildScript, proof)
  requireScriptBefore('test:browser:freeform', testBrowserFreeformScript, webBuildScript, proof)
}
if (!testBrowserFreeformScript.includes('tests/browser/freeform-cli-golden-path.spec.ts'))
  issues.push({ file: 'package.json', message: 'test:browser:freeform must include the Freeform CLI browser golden path proof' })
requireWorkerConfigBrokerRoutesComplete([
  ['docs/protocol.md', read('docs/protocol.md'), [
    'GET    /api/workers/:workerId/config',
    'PUT    /api/workers/:workerId/config/:configKey',
    'PATCH  /api/workers/:workerId/config/:configKey',
    'POST   /api/workers/:workerId/config/:configKey/archive',
  ]],
  ['packages/worker-daemon/src/modes/worker/openapi.ts', hostDaemonOpenApi, [
    'path: \'/api/workers/{workerId}/config\'',
    'path: \'/api/workers/{workerId}/config/{configKey}\'',
    'path: \'/api/workers/{workerId}/config/{configKey}/archive\'',
    'method: \'get\'',
    'method: \'put\'',
    'method: \'patch\'',
    'method: \'post\'',
  ]],
  ['packages/worker-daemon/src/modes/worker.local.test.ts', hostDaemonWorkerLocalTest, [
    '[\'get\', \'/api/workers/{workerId}/config\']',
    '[\'put\', \'/api/workers/{workerId}/config/{configKey}\']',
    '[\'patch\', \'/api/workers/{workerId}/config/{configKey}\']',
    '[\'post\', \'/api/workers/{workerId}/config/{configKey}/archive\']',
  ]],
])
requireFreeformBrowserProofIncludes([
  'readSessionFollowUpProofFromBrowser',
  ['/api/sessions/', '{id}/invocations'].join('$'),
  'assertBrowserSessionFollowUpProof',
  'assertInvocationExternalSessionRefProof',
  'externalSessionRef',
  ['/api/engine/invocations/', '{id}/cancel'].join('$'),
  'assertInvocationCancelProof',
  ['/api/engine/invocations/', '{id}/reconcile'].join('$'),
  'assertInvocationReconcileProof',
  'reattached',
  'readProjectionRefreshProofFromBrowser',
  '/api/projections/codex/refresh',
  ['/api/projections/receipts/', '{workspaceId}'].join('$'),
  'worker-overlay',
  'assertProjectionRefreshProof',
  ['/api/sessions/', '{id}/archive'].join('$'),
  'assertSessionArchiveProof',
  ['/api/workspace-locators/', '{workspaceId}/archive'].join('$'),
  'assertWorkspaceLifecycleProof',
  'replacementWorkspace',
])
for (const forbiddenBrowserWorkerArchiveProof of [
  ['/api/workers/', '{workerId}/archive'].join('$'),
  'assertHostLifecycleArchiveProof',
  'WORKER_ARCHIVED',
]) {
  if (freeformCliBrowserProof.includes(forbiddenBrowserWorkerArchiveProof)) {
    issues.push({
      file: 'tests/browser/freeform-cli-golden-path.spec.ts',
      message: 'browser proof must not drive Worker archive from Workbench context',
    })
  }
}
if (packageJson.scripts?.['docs:check'] !== 'bun scripts/check-doc-contract.ts')
  issues.push({ file: 'package.json', message: 'docs:check must run scripts/check-doc-contract.ts' })
if (packageJson.scripts?.['ui:check'] !== 'bun scripts/check-web-ui-components.ts')
  issues.push({ file: 'package.json', message: 'ui:check must run scripts/check-web-ui-components.ts' })
if (!packageJson.scripts?.build?.includes('@zonease/aiworker-worker-daemon'))
  issues.push({ file: 'package.json', message: 'build must include the final worker-daemon package' })
if (packageJson.scripts?.build?.includes('@zonease/aiworker-api'))
  issues.push({ file: 'package.json', message: 'build must not reference retired apps/api package' })
if (!packageJson.scripts?.lint?.includes('bun run ui:check'))
  issues.push({ file: 'package.json', message: 'lint must include bun run ui:check' })
if (!packageJson.scripts?.lint?.includes('bun run docs:check'))
  issues.push({ file: 'package.json', message: 'lint must include bun run docs:check' })

if (issues.length > 0) {
  for (const issue of issues)
    console.error(`${issue.file}: ${issue.message}`)
  process.exit(1)
}

console.log(`docs contract ok (${activeDocs.length} active files, ${canonicalDocs.length} canonical docs)`)

function abs(file: string): string {
  return path.join(repoRoot, file)
}

function read(file: string): string {
  const filePath = abs(file)
  if (!existsSync(filePath))
    return ''
  return readFileSync(filePath, 'utf8')
}

function requireIncludes(file: string, needles: string[]): void {
  const content = read(file)
  for (const needle of needles) {
    if (!content.includes(needle))
      issues.push({ file, message: `missing required text ${JSON.stringify(needle)}` })
  }
}

function requireMaxLines(file: string, maxLines: number): void {
  const content = read(file).trimEnd()
  const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length
  if (lineCount > maxLines)
    issues.push({ file, message: `expected at most ${maxLines} lines, found ${lineCount}` })
}

function forbidIncludes(file: string, needles: string[]): void {
  const content = read(file)
  for (const needle of needles) {
    if (content.includes(needle))
      issues.push({ file, message: `contains forbidden active-route text ${JSON.stringify(needle)}` })
  }
}

function documentedTestingPaths(): string[] {
  const lines = read('docs/testing.md').split(/\r?\n/)
  const paths: string[] = []
  let inCodeFence = false
  let baseDir: string | null = null

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence
      baseDir = null
      continue
    }
    if (!inCodeFence)
      continue

    const trimmed = line.trim()
    if (!trimmed)
      continue
    if (/^[\w./-]+\/$/.test(trimmed)) {
      baseDir = trimmed
      continue
    }
    if (/\.(?:test|spec)\.tsx?$/.test(trimmed)) {
      const repoRelative = /^(?:apps|packages|souls|tests)\//.test(trimmed)
        ? trimmed
        : `${baseDir ?? ''}${trimmed}`
      paths.push(repoRelative)
    }
  }

  return [...new Set(paths)].sort()
}

function documentedReleaseGateCommands(): string[] {
  const lines = read('docs/testing.md').split(/\r?\n/)
  const headingIndex = lines.findIndex(line => line.trim() === '## Current Release Gates')
  if (headingIndex === -1)
    return []

  const firstFenceIndex = lines.findIndex((line, index) => index > headingIndex && line.startsWith('```'))
  if (firstFenceIndex === -1)
    return []

  const closeFenceIndex = lines.findIndex((line, index) => index > firstFenceIndex && line.startsWith('```'))
  if (closeFenceIndex === -1)
    return []

  return lines
    .slice(firstFenceIndex + 1, closeFenceIndex)
    .map(line => line.trim())
    .filter(Boolean)
}

function documentedTestingCoverageFindings(testPath: string, rootPackageJson: { scripts?: Record<string, string> }): string[] {
  const scripts = rootPackageJson.scripts ?? {}
  const findings: string[] = []

  if (testPath.startsWith('tests/architecture/')) {
    if (!scripts['test:contracts']?.includes('tests/architecture'))
      findings.push(`listed architecture test is not covered by test:contracts: ${testPath}`)
    return findings
  }

  if (testPath === 'scripts/check-soul-app-boundaries.test.ts') {
    if (!scripts['test:contracts']?.includes(testPath))
      findings.push(`listed boundary test is not covered by test:contracts: ${testPath}`)
    return findings
  }

  if (testPath.startsWith('tests/browser/')) {
    if (!scripts['test:browser:freeform']?.includes(testPath))
      findings.push(`listed browser proof is not covered by test:browser:freeform: ${testPath}`)
    return findings
  }

  if (testPath === 'apps/worker-cli/src/freeform-golden-path.test.ts' || testPath === 'apps/worker-cli/src/aiworker.test.ts') {
    if (!scripts['test:cli']?.includes(testPath))
      findings.push(`listed CLI proof is not covered by test:cli: ${testPath}`)
  }

  if (testPath.startsWith('packages/soul-descriptor/') && !scripts['test:protocol']?.includes('@zonease/aiworker-soul-descriptor'))
    findings.push(`listed protocol test is not covered by test:protocol: ${testPath}`)

  const workspaceRoot = testPath.match(/^(?:apps|packages|souls)\/[^/]+/)?.[0]
  if (workspaceRoot) {
    if (scripts.test !== 'bun run --filter \'*\' test')
      findings.push(`listed workspace test is not covered by the root test release gate: ${testPath}`)

    const packageJsonPath = `${workspaceRoot}/package.json`
    if (!existsSync(abs(packageJsonPath))) {
      findings.push(`listed workspace test has no package.json for root test coverage: ${testPath}`)
      return findings
    }

    const workspacePackageJson = JSON.parse(read(packageJsonPath)) as { scripts?: Record<string, string> }
    if (!workspacePackageJson.scripts?.test)
      findings.push(`listed workspace test package has no test script for root test coverage: ${testPath}`)
    return findings
  }

  findings.push(`listed test file is not covered by a current release gate: ${testPath}`)
  return findings
}

function requireScriptBefore(scriptName: string, script: string, before: string, after: string): void {
  const beforeIndex = script.indexOf(before)
  const afterIndex = script.indexOf(after)
  if (beforeIndex === -1 || afterIndex === -1)
    return
  if (beforeIndex > afterIndex)
    issues.push({ file: 'package.json', message: `${scriptName} must run ${before} before ${after}` })
}

function extractMatches(content: string, pattern: RegExp): string[] {
  return Array.from(content.matchAll(pattern), match => match[1] ?? '')
}

function requireExactList(file: string, actual: string[], expected: string[], message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    issues.push({ file, message })
}

function requireFreeformBrowserProofIncludes(needles: string[]): void {
  for (const needle of needles) {
    if (!freeformCliBrowserProof.includes(needle)) {
      issues.push({
        file: 'tests/browser/freeform-cli-golden-path.spec.ts',
        message: 'browser proof must cover Freeform v1 scope',
      })
    }
  }
}

function requireWorkerConfigBrokerRoutesComplete(entries: Array<[file: string, content: string, needles: string[]]>): void {
  for (const [file, content, needles] of entries) {
    for (const needle of needles) {
      if (!content.includes(needle)) {
        issues.push({
          file,
          message: 'worker config broker routes must stay complete',
        })
      }
    }
  }
}
