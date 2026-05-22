# Universal Soul Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有 Soul App 提供通用 web 工作台（session composer/chat），通过 Host header 选项卡在通用工作台和领域工作台之间切换。

**Architecture:** 新建 `packages/soul-app-workbench` 承载通用工作台 UI 组件（从 `apps/web` 迁移 session chat 组件），增强 `soul-app-sdk` 的 `defineSoulApp()` 自动注入通用工作台路由和 session API 薄透传端点，Host header 增加选项卡渲染。

**Tech Stack:** React 19 + TypeScript + Bun + `@zonease/aiworker-ui` (shadcn primitives) + `@micro-zoe/micro-app`

---

### Task 1: Create `packages/soul-app-workbench` package scaffold

**Files:**
- Create: `packages/soul-app-workbench/package.json`
- Create: `packages/soul-app-workbench/tsconfig.json`
- Create: `packages/soul-app-workbench/src/index.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@zonease/aiworker-soul-app-workbench",
  "type": "module",
  "private": true,
  "license": "MIT",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./universal-workbench": {
      "types": "./src/universal-workbench/index.ts",
      "import": "./src/universal-workbench/index.ts"
    },
    "./timeline/*": {
      "types": "./src/universal-workbench/timeline/*.ts",
      "import": "./src/universal-workbench/timeline/*.ts"
    },
    "./timeline/*.tsx": {
      "types": "./src/universal-workbench/timeline/*.tsx",
      "import": "./src/universal-workbench/timeline/*.tsx"
    }
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test --timeout=30000"
  },
  "dependencies": {
    "@hugeicons/core-free-icons": "^4.1.4",
    "@hugeicons/react": "^1.1.6",
    "@zonease/aiworker-shared": "workspace:*",
    "@zonease/aiworker-ui": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.13",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": {
      "@zonease/aiworker-shared": ["../shared/src/index.ts"],
      "@zonease/aiworker-ui/components/*": ["../ui/src/components/*"],
      "@zonease/aiworker-ui/lib/*": ["../ui/src/lib/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write stub src/index.ts**

```typescript
export { UniversalWorkbenchApp } from './universal-workbench/UniversalWorkbenchApp'
export type { UniversalWorkbenchAppProps } from './universal-workbench/UniversalWorkbenchApp'
```

- [ ] **Step 4: Verify scaffold**

Run: `bun install`
Expected: No errors, workspace dependency resolves.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-workbench/ bun.lock
git commit -m "feat: 创建 packages/soul-app-workbench 包骨架"
```

---

### Task 2: Migrate `session-view-model.ts` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`
- Modify: `apps/web/src/features/session/session-view-model.ts` (re-export from new location)

- [ ] **Step 1: Copy session-view-model.ts to new package**

```bash
cp apps/web/src/features/session/session-view-model.ts packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts
```

- [ ] **Step 2: Verify the copied file compiles**

Run: `cd packages/soul-app-workbench && bun run typecheck`
Expected: May fail due to missing dependencies; fix any import issues.

- [ ] **Step 3: Update apps/web to re-export from new package**

Replace `apps/web/src/features/session/session-view-model.ts` with:

```typescript
export {
  createComposerAttachment,
  createSessionTimelineViewModel,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from '@zonease/aiworker-soul-app-workbench/timeline/session-view-model'

export type {
  NormalizeSessionEventsOptions,
  SessionComposerMaterial,
  SessionComposerMaterialEncoding,
  SessionTimelineActivityDetail,
  SessionTimelineActivityEvent,
  SessionTimelineActivityGroupEvent,
  SessionTimelineActivityKind,
  SessionTimelineActivityStatus,
  SessionTimelineEvent,
  SessionTimelineEventInput,
  SessionTimelineParser,
  SessionTimelineSignalEvent,
  SessionTimelineSignalKind,
  SessionTimelineTurnInput,
  SessionTimelineTurnViewModel,
  SessionTimelineUsageSummary,
} from '@zonease/aiworker-soul-app-workbench/timeline/session-view-model'
```

- [ ] **Step 4: Update apps/web package.json to add dependency**

Add to `apps/web/package.json` dependencies:
```json
"@zonease/aiworker-soul-app-workbench": "workspace:*"
```

- [ ] **Step 5: Verify typecheck passes across packages**

Run: `bun run typecheck`
Expected: No errors in apps/web or packages/soul-app-workbench.

- [ ] **Step 6: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts apps/web/src/features/session/session-view-model.ts apps/web/package.json bun.lock
git commit -m "refactor: 迁移 session-view-model 到 packages/soul-app-workbench"
```

---

### Task 3: Migrate `message-flow.tsx` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/timeline/message-flow.tsx`
- Modify: `apps/web/src/features/session/message-flow.tsx` (re-export)

- [ ] **Step 1: Copy the file**

```bash
cp apps/web/src/features/session/message-flow.tsx packages/soul-app-workbench/src/universal-workbench/timeline/message-flow.tsx
```

- [ ] **Step 2: Replace apps/web message-flow.tsx with re-exports**

```typescript
export {
  MessageFlow,
  MessageRow,
  SessionCodeBlock,
  StatusEventPill,
  ToolResultCard,
} from '@zonease/aiworker-soul-app-workbench/timeline/message-flow'

export type {
  MessageFlowTone,
  MessageRowProps,
  StatusEventPillProps,
  ToolResultCardProps,
} from '@zonease/aiworker-soul-app-workbench/timeline/message-flow'
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/timeline/message-flow.tsx apps/web/src/features/session/message-flow.tsx
git commit -m "refactor: 迁移 message-flow 到 packages/soul-app-workbench"
```

---

### Task 4: Migrate `engine-readiness.ts` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/timeline/engine-readiness.ts`
- Modify: `apps/web/src/features/session/engine-readiness.ts` (re-export)

- [ ] **Step 1: Copy the file**

```bash
cp apps/web/src/features/session/engine-readiness.ts packages/soul-app-workbench/src/universal-workbench/timeline/engine-readiness.ts
```

- [ ] **Step 2: Replace apps/web engine-readiness.ts with re-exports**

```typescript
export { resolveEngineReadiness } from '@zonease/aiworker-soul-app-workbench/timeline/engine-readiness'
export type { EngineReadiness } from '@zonease/aiworker-soul-app-workbench/timeline/engine-readiness'
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/timeline/engine-readiness.ts apps/web/src/features/session/engine-readiness.ts
git commit -m "refactor: 迁移 engine-readiness 到 packages/soul-app-workbench"
```

---

### Task 5: Migrate `SessionTimeline` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx`
- Modify: `apps/web/src/features/session/session-timeline.tsx` (re-export)

- [ ] **Step 1: Copy the file**

```bash
cp apps/web/src/features/session/session-timeline.tsx packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx
```

- [ ] **Step 2: Update imports in the copied file**

The session-timeline.tsx imports from `./message-flow` and `./session-view-model`. These are now local in the same timeline/ directory. No import path changes needed since the files are co-located.

Verify the imports in the copied file match local paths:
- `from './message-flow'` ✓ (same directory)
- `from './session-view-model'` ✓ (same directory)

- [ ] **Step 3: Replace apps/web session-timeline.tsx with re-exports**

```typescript
export { SessionTimeline } from '@zonease/aiworker-soul-app-workbench/timeline/SessionTimeline'
export type { SessionTimelineProps } from '@zonease/aiworker-soul-app-workbench/timeline/SessionTimeline'
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx apps/web/src/features/session/session-timeline.tsx
git commit -m "refactor: 迁移 SessionTimeline 到 packages/soul-app-workbench"
```

---

### Task 6: Migrate `SessionTurnComposer` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/SessionTurnComposer.tsx`
- Modify: `apps/web/src/worker/session-turn-composer.tsx` (re-export)

- [ ] **Step 1: Copy the file**

```bash
cp apps/web/src/worker/session-turn-composer.tsx packages/soul-app-workbench/src/universal-workbench/SessionTurnComposer.tsx
```

- [ ] **Step 2: Update imports in the copied file**

The file imports from `../features/i18n` (Host-specific) and `../features/session/engine-readiness`. Update:
- Change `from '../features/i18n'` → Remove the `messagesFor` type dependency. The component should accept its copy as a plain record type instead.
- Change `from '../features/session/engine-readiness'` → `from './timeline/engine-readiness'`

Replace the import block:

```typescript
import type { SessionComposerMaterial, SessionComposerUsage } from '@zonease/aiworker-ui/components/session-composer'
import type { FormEvent } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'

import { MailSend02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createComposerAttachment, formatSessionAttachmentKind, formatSessionAttachmentSize, isSessionAttachmentImage, SessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useEffect, useMemo, useRef, useState } from 'react'
```

Replace `type WorkerMessages = ReturnType<typeof messagesFor>` with:

```typescript
interface SessionTurnComposerCopy {
  workspace: {
    addSourceMaterials: string
    attachedSourceMaterials: string
    closeSourceMaterialPreview: string
    followUpInput: string
    followUpPlaceholder: string
    materialReadError: string
    previewSourceMaterial: (name: string) => string
    removeSourceMaterial: (name: string) => string
    sendTurn: string
    sendingTurn: string
  }
}
```

Update `SessionTurnComposerProps.copy` type from `WorkerMessages` to `SessionTurnComposerCopy`.

- [ ] **Step 3: Replace apps/web session-turn-composer.tsx with re-exports**

```typescript
export { SessionTurnComposer } from '@zonease/aiworker-soul-app-workbench/universal-workbench'
export type { SessionTurnComposerProps, SessionTurnDraft } from '@zonease/aiworker-soul-app-workbench/universal-workbench'
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/SessionTurnComposer.tsx apps/web/src/worker/session-turn-composer.tsx
git commit -m "refactor: 迁移 SessionTurnComposer 到 packages/soul-app-workbench"
```

---

### Task 7: Migrate `SessionDetail` to `packages/soul-app-workbench`

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
- Modify: `apps/web/src/worker/session-detail.tsx` (re-export)

- [ ] **Step 1: Copy the file**

```bash
cp apps/web/src/worker/session-detail.tsx packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx
```

- [ ] **Step 2: Update imports in the copied file**

The file imports from Host paths. Update:
- `from '../features/i18n'` → Remove dependency. The component uses `displayTemplate`, `formatRelativeTime`, `formatStatus` which are Host i18n helpers. For now keep the import but use a generic interface.
- `from '../features/session/session-view-model'` → `from './timeline/session-view-model'`
- `from './session-turn-composer'` → `from './SessionTurnComposer'`
- `from './session-progress-panel'` → This stays in apps/web (Host-specific progress panel). Import stays from apps/web.

Actually, `SessionDetail` imports `SessionProgressPanel` from `./session-progress-panel` (Host-specific). For the migration, remove `SessionProgressPanel` from the migrated component and accept progress as a ReactNode prop instead.

Replace the import block:

```typescript
import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent, ReactNode } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'
import type { SessionTurnDraft } from './SessionTurnComposer'

import {
  CircleIcon,
  File02Icon,
  Message02Icon,
  TerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@zonease/aiworker-ui/components/collapsible'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import { useMemo } from 'react'

import { normalizeSessionEvents, summarizeSessionUsage } from './timeline/session-view-model'
import { SessionTurnComposer } from './SessionTurnComposer'
```

Add a `progressPanel` prop to `SessionDetailProps`:

```typescript
export function SessionDetail({
  collapsed = false,
  copy,
  engineReadiness,
  events,
  locale,
  onSubmitTurn,
  onTurnInputChange,
  progress,
  progressPanel,
  session,
  template,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
}: {
  collapsed?: boolean
  copy: SessionDetailCopy
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  locale: string
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => void
  onTurnInputChange: (value: string) => void
  progress: SessionDetailProgress | null
  progressPanel?: ReactNode
  session: LocalSession | null
  template: SessionDetailTemplate | null
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace | null
})
```

Define the copy/template/progress interfaces as simple records:

```typescript
interface SessionDetailCopy {
  accessibility: { businessArtifactPreview: string }
  workspace: {
    continueSession: string
    eventCount: (count: number) => string
    eventStream: string
    noEvents: string
    noSelectionDetail: string
    noSelectionTitle: string
    noTurns: string
    selectedWorkspace: string
    sessionDetail: string
    turnCount: (count: number) => string
    turnHistory: string
    updated: (date: string) => string
  }
}

interface SessionDetailTemplate {
  id: string
  name: string
  outputKind?: string
}

interface SessionDetailProgress {
  label: string
  tone?: string
}
```

In the templateCopy section, replace `displayTemplate(template, locale)` with direct field access since template is now a simple object. Replace `formatStatus(session.status, locale)` with just `session.status`. Replace `formatRelativeTime(session.updatedAt, locale)` with just `session.updatedAt`.

Replace `<SessionProgressPanel compact progress={progress} />` with `{progressPanel}`.

- [ ] **Step 3: Replace apps/web session-detail.tsx with re-exports**

```typescript
export { SessionDetail } from '@zonease/aiworker-soul-app-workbench/universal-workbench'
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx apps/web/src/worker/session-detail.tsx
git commit -m "refactor: 迁移 SessionDetail 到 packages/soul-app-workbench"
```

---

### Task 8: Create `WorkspaceSessionTree` component

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { ReactNode } from 'react'

import { Add01Icon, Message02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'

export interface WorkspaceSessionTreeNode {
  id: string
  kind: 'session' | 'workspace'
  label: string
  detail?: string
  sessionId?: string
  workspaceId: string
}

export function WorkspaceSessionTree({
  className,
  nodes,
  onCreateSession,
  onSelectNode,
  selectedNodeId,
}: {
  className?: string
  nodes: WorkspaceSessionTreeNode[]
  onCreateSession: () => void
  onSelectNode: (node: WorkspaceSessionTreeNode) => void
  selectedNodeId?: string | null
}) {
  const workspaces = new Map<string, { id: string, label: string, sessions: WorkspaceSessionTreeNode[] }>()
  for (const node of nodes) {
    if (node.kind === 'workspace') {
      workspaces.set(node.id, { id: node.id, label: node.label, sessions: [] })
    }
  }
  for (const node of nodes) {
    if (node.kind === 'session') {
      const ws = workspaces.get(node.workspaceId)
      if (ws) ws.sessions.push(node)
    }
  }

  return (
    <ItemGroup className={cn('min-w-0 gap-1', className)} data-slot="workspace-session-tree">
      {Array.from(workspaces.values()).map(ws => (
        <ItemGroup key={ws.id} className="min-w-0 gap-0.5" data-slot="workspace-group">
          <Item
            asChild
            variant="muted"
            size="xs"
            className="min-w-0 cursor-pointer"
            data-selected={selectedNodeId === ws.id ? 'true' : undefined}
            onClick={() => onSelectNode({ id: ws.id, kind: 'workspace', label: ws.label, workspaceId: ws.id })}
          >
            <button type="button">
              <ItemContent className="min-w-0">
                <ItemTitle className="truncate text-xs font-semibold uppercase tracking-wide">{ws.label}</ItemTitle>
              </ItemContent>
            </button>
          </Item>
          {ws.sessions.map(session => (
            <Item
              key={session.id}
              asChild
              variant="default"
              size="xs"
              className="min-w-0 cursor-pointer pl-4"
              data-selected={selectedNodeId === session.id ? 'true' : undefined}
              onClick={() => onSelectNode(session)}
            >
              <button type="button">
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="truncate text-sm">{session.label}</ItemTitle>
                  {session.detail ? <ItemDescription className="truncate text-xs">{session.detail}</ItemDescription> : null}
                </ItemContent>
              </button>
            </Item>
          ))}
          <Item
            asChild
            variant="muted"
            size="xs"
            className="min-w-0 cursor-pointer pl-4"
            onClick={onCreateSession}
          >
            <button type="button">
              <ItemContent className="min-w-0">
                <ItemDescription className="flex items-center gap-1 text-xs">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                  New Session
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
        </ItemGroup>
      ))}
    </ItemGroup>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/soul-app-workbench && bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx
git commit -m "feat: 添加 WorkspaceSessionTree 组件"
```

---

### Task 9: Create `SessionChatView` component

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx`

- [ ] **Step 1: Write the component based on WorkerSessionChat**

This is a simplified version of `WorkerSessionChat`, adapted for micro-app context. It accepts data as props rather than managing its own state.

```typescript
import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'
import type { SessionTurnDraft } from './SessionTurnComposer'

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Message02Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageFlow, MessageRow, StatusEventPill } from './timeline/message-flow'
import { SessionTimeline } from './timeline/SessionTimeline'
import {
  createSessionTimelineViewModel,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from './timeline/session-view-model'
import { SessionTurnComposer } from './SessionTurnComposer'

interface SessionChatViewProps {
  assistantRoleLabel: string
  detailDrawerOpen: boolean
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  onBackToWorkspace: () => void
  onRefresh: () => void
  onToggleDetailDrawer: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => void
  onTurnInputChange: (value: string) => void
  operatorRoleLabel: string
  session: LocalSession
  sessionStatusLabel: string
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace
  workspaceName: string
}

export function SessionChatView({
  assistantRoleLabel,
  detailDrawerOpen,
  engineReadiness,
  events,
  onBackToWorkspace,
  onRefresh,
  onToggleDetailDrawer,
  onSubmitTurn,
  onTurnInputChange,
  operatorRoleLabel,
  session,
  sessionStatusLabel,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
  workspaceName,
}: SessionChatViewProps) {
  const logRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)
  const pinnedToBottomRef = useRef(true)
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false)
  const normalizedEvents = useMemo(() => normalizeSessionEvents(events, { parser: 'codex-cli' }), [events])
  const timeline = useMemo(() => createSessionTimelineViewModel({
    events: normalizedEvents,
    turns,
  }), [normalizedEvents, turns])
  const usage = useMemo(() => summarizeSessionUsage(normalizedEvents), [normalizedEvents])
  const composerUsage = usage && (usage.inputTokens != null || usage.outputTokens != null)
    ? {
        ariaLabel: `Usage ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output tokens`,
        label: 'Usage',
        meterValue: usage.inputTokens && (usage.inputTokens + (usage.outputTokens ?? 0)) > 0 ? usage.inputTokens / (usage.inputTokens + (usage.outputTokens ?? 0)) : undefined,
        title: `Usage ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output tokens`,
        value: `${formatCompactTokenCount(usage.inputTokens)} in / ${formatCompactTokenCount(usage.outputTokens)} out`,
      }
    : undefined
  const composerBusy = turnSubmitting || turns.some(turn => turn.status === 'running')

  useEffect(() => {
    didInitialScrollRef.current = false
    pinnedToBottomRef.current = true
  }, [session.id])

  useEffect(() => {
    const el = logRef.current
    if (!el || didInitialScrollRef.current || (timeline.turns.length === 0 && events.length === 0))
      return
    didInitialScrollRef.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      pinnedToBottomRef.current = true
      setScrolledFromBottom(false)
    })
  }, [events.length, session.id, timeline.turns.length])

  useEffect(() => {
    const el = logRef.current
    if (!el || !pinnedToBottomRef.current)
      return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      setScrolledFromBottom(false)
    })
  }, [timeline, turnSubmitting])

  useEffect(() => {
    const el = logRef.current
    if (!el)
      return
    const onScroll = () => {
      const target = logRef.current
      if (!target)
        return
      const distance = target.scrollHeight - target.scrollTop - target.clientHeight
      pinnedToBottomRef.current = distance < 80
      setScrolledFromBottom(distance > 140)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function jumpToBottom() {
    const el = logRef.current
    if (!el)
      return
    pinnedToBottomRef.current = true
    el.scrollTo({ behavior: 'smooth', top: el.scrollHeight })
    setScrolledFromBottom(false)
  }

  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col transition-colors"
      data-slot="session-chat-view"
    >
      <div className="flex min-h-0 min-w-0 max-w-full items-center justify-between gap-2 px-6 py-3 max-md:px-4 max-md:py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="Back to workspace" onClick={onBackToWorkspace}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{workspaceName}</div>
            <div className="truncate text-sm font-medium">{session.capabilityTemplateId}</div>
          </div>
          <Badge variant="outline">{sessionStatusLabel}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={onRefresh}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button
            aria-label={detailDrawerOpen ? 'Collapse detail' : 'Expand detail'}
            aria-pressed={detailDrawerOpen}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onToggleDetailDrawer}
          >
            {detailDrawerOpen
              ? <HugeiconsIcon icon={PanelRightCloseIcon} strokeWidth={2} aria-hidden="true" />
              : <HugeiconsIcon icon={PanelRightOpenIcon} strokeWidth={2} aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        overlay={scrolledFromBottom
          ? (
              <Button type="button" variant="secondary" size="sm" className="absolute right-6 bottom-4" onClick={jumpToBottom}>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                <span>Latest</span>
              </Button>
            )
          : null}
        viewportClassName="flex min-h-0 min-w-0 scroll-smooth flex-col gap-4 px-6 pt-5 pb-6 transition-all max-md:px-4"
        viewportRef={logRef}
      >
        {timeline.turns.length > 0
          ? (
              <SessionTimeline
                assistantRoleLabel={assistantRoleLabel}
                assistantTimestampForTurn={turn => turn.status}
                className="min-w-0"
                operatorRoleLabel={operatorRoleLabel}
                placeholderForTurn={turn => turn.status === 'running'
                  ? (
                      <MessageRow roleLabel={assistantRoleLabel}>
                        <MessageFlow>
                          <StatusEventPill tone="success">{engineReadiness.detail}</StatusEventPill>
                        </MessageFlow>
                      </MessageRow>
                    )
                  : null}
                turns={timeline.turns}
              />
            )
          : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2">
                <HugeiconsIcon icon={Message02Icon} strokeWidth={2} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{engineReadiness.detail}</p>
              </div>
            )}
        {turnSubmitting && timeline.turns.every(({ turn }) => turn.status !== 'running')
          ? (
              <MessageRow roleLabel={assistantRoleLabel}>
                <MessageFlow>
                  <StatusEventPill tone="success">{engineReadiness.detail}</StatusEventPill>
                </MessageFlow>
              </MessageRow>
            )
          : null}
      </ScrollArea>

      <SessionTurnComposer
        className="min-w-0 max-w-full px-6 pt-3 pb-4 max-md:px-4"
        copy={{
          workspace: {
            addSourceMaterials: 'Add source materials',
            attachedSourceMaterials: 'Attached source materials',
            closeSourceMaterialPreview: 'Close preview',
            followUpInput: 'Session follow-up input',
            followUpPlaceholder: 'Continue the conversation...',
            materialReadError: 'Failed to read source material.',
            previewSourceMaterial: (name: string) => `Preview ${name}`,
            removeSourceMaterial: (name: string) => `Remove ${name}`,
            sendTurn: 'Send',
            sendingTurn: 'Sending...',
          },
        }}
        engineReadiness={engineReadiness}
        usage={composerUsage}
        value={turnInput}
        submitting={composerBusy}
        variant="compact"
        onSubmit={onSubmitTurn}
        onValueChange={onTurnInputChange}
      />
    </section>
  )
}

function formatCompactTokenCount(value?: number): string {
  if (value == null)
    return '0'
  if (value >= 1000)
    return `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))}K`
  return String(value)
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/soul-app-workbench && bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx
git commit -m "feat: 添加 SessionChatView 组件（从 WorkerSessionChat 适配）"
```

---

### Task 10: Create `UniversalWorkbenchApp` top-level component

**Files:**
- Create: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- Create: `packages/soul-app-workbench/src/universal-workbench/index.ts`

- [ ] **Step 1: Write the top-level App component**

```typescript
import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from './timeline/engine-readiness'
import type { WorkspaceSessionTreeNode } from './WorkspaceSessionTree'
import type { SessionTurnDraft } from './SessionTurnComposer'

import { PanelLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarMenuButton } from '@zonease/aiworker-ui/components/sidebar'
import { useMemo, useState } from 'react'
import { SessionChatView } from './SessionChatView'
import { SessionDetail } from './SessionDetail'
import { WorkspaceSessionTree } from './WorkspaceSessionTree'

export interface UniversalWorkbenchAppProps {
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  sessions: LocalSession[]
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workerId: string
  workspace: LocalWorkspace | null
  workspaces: LocalWorkspace[]
  onBackToWorkspace: () => void
  onCreateSession: (workspaceId: string, input: string) => Promise<void>
  onRefresh: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => Promise<void> | void
  onTurnInputChange: (value: string) => void
}

export function UniversalWorkbenchApp({
  engineReadiness,
  events,
  sessions,
  turnInput,
  turnSubmitting,
  turns,
  workerId,
  workspace,
  workspaces,
  onBackToWorkspace,
  onCreateSession,
  onRefresh,
  onSubmitTurn,
  onTurnInputChange,
}: UniversalWorkbenchAppProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [newSessionInput, setNewSessionInput] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspace?.id ?? null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )
  const selectedWorkspace = useMemo(
    () => workspaces.find(w => w.id === selectedWorkspaceId) ?? workspace ?? workspaces[0] ?? null,
    [workspaces, selectedWorkspaceId, workspace],
  )
  const workspaceEvents = useMemo(
    () => events.filter(e => selectedSession ? e.turnId && turns.some(t => t.id === e.turnId && t.sessionId === selectedSession.id) : false),
    [events, selectedSession, turns],
  )
  const sessionTurns = useMemo(
    () => selectedSession ? turns.filter(t => t.sessionId === selectedSession.id) : [],
    [selectedSession, turns],
  )

  const treeNodes = useMemo<WorkspaceSessionTreeNode[]>(() => {
    const nodes: WorkspaceSessionTreeNode[] = []
    for (const ws of workspaces) {
      nodes.push({ id: ws.id, kind: 'workspace', label: ws.name, workspaceId: ws.id })
      for (const session of sessions.filter(s => s.workspaceId === ws.id)) {
        nodes.push({
          id: session.id,
          kind: 'session',
          label: session.capabilityTemplateId,
          detail: session.status,
          sessionId: session.id,
          workspaceId: ws.id,
        })
      }
    }
    return nodes
  }, [workspaces, sessions])

  async function handleCreateSession(workspaceId: string) {
    if (!newSessionInput.trim())
      return
    await onCreateSession(workspaceId, newSessionInput.trim())
    setNewSessionInput('')
  }

  return (
    <div className="flex h-full min-h-0" data-slot="universal-workbench">
      {/* Left: workspace/session tree */}
      {!sidebarCollapsed && (
        <aside className="w-56 min-w-0 flex-shrink-0 overflow-y-auto border-r p-3" data-slot="workbench-sidebar">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</span>
            <SidebarMenuButton
              aria-label="Collapse sidebar"
              className="size-6 w-6 justify-center p-0"
              size="sm"
              type="button"
              onClick={() => setSidebarCollapsed(true)}
            >
              <HugeiconsIcon icon={PanelLeftIcon} strokeWidth={2} aria-hidden="true" />
            </SidebarMenuButton>
          </div>
          <WorkspaceSessionTree
            nodes={treeNodes}
            selectedNodeId={selectedSession?.id ?? selectedWorkspace?.id ?? null}
            onCreateSession={() => selectedWorkspace && handleCreateSession(selectedWorkspace.id)}
            onSelectNode={(node) => {
              if (node.kind === 'session') {
                setSelectedSessionId(node.sessionId ?? null)
              } else {
                setSelectedWorkspaceId(node.workspaceId)
                setSelectedSessionId(null)
              }
            }}
          />
        </aside>
      )}

      {/* Center: session chat or new session composer */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="workbench-main">
        {selectedSession && selectedWorkspace
          ? (
              <SessionChatView
                assistantRoleLabel="Assistant"
                detailDrawerOpen={detailDrawerOpen}
                engineReadiness={engineReadiness}
                events={workspaceEvents}
                operatorRoleLabel="You"
                session={selectedSession}
                sessionStatusLabel={selectedSession.status}
                turnInput={turnInput}
                turnSubmitting={turnSubmitting}
                turns={sessionTurns}
                workspace={selectedWorkspace}
                workspaceName={selectedWorkspace.name}
                onBackToWorkspace={() => setSelectedSessionId(null)}
                onRefresh={onRefresh}
                onToggleDetailDrawer={() => setDetailDrawerOpen(v => !v)}
                onSubmitTurn={onSubmitTurn}
                onTurnInputChange={onTurnInputChange}
              />
            )
          : selectedWorkspace
            ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                    <p className="text-sm text-muted-foreground">Start a new session or select one from the sidebar.</p>
                  </div>
                  <div className="flex w-full max-w-xl gap-2">
                    <input
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                      placeholder="What do you want to work on?"
                      value={newSessionInput}
                      onChange={e => setNewSessionInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateSession(selectedWorkspace.id)}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                      onClick={() => handleCreateSession(selectedWorkspace.id)}
                      disabled={!newSessionInput.trim()}
                    >
                      Start
                    </button>
                  </div>
                </div>
              )
            : (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Select a workspace to get started.</p>
                </div>
              )}
      </main>

      {/* Right: detail drawer */}
      <SessionDetail
        collapsed={!detailDrawerOpen}
        copy={{
          accessibility: { businessArtifactPreview: 'Session detail' },
          workspace: {
            continueSession: 'Continue session',
            eventCount: (n: number) => `${n} events`,
            eventStream: 'Event stream',
            noEvents: 'No events yet.',
            noSelectionDetail: 'Select a session to view details.',
            noSelectionTitle: 'No session selected',
            noTurns: 'No turns yet.',
            selectedWorkspace: 'Workspace',
            sessionDetail: 'Session detail',
            turnCount: (n: number) => `${n} turns`,
            turnHistory: 'Turn history',
            updated: (d: string) => d,
          },
        }}
        engineReadiness={engineReadiness}
        events={workspaceEvents}
        locale="en"
        progress={null}
        session={selectedSession}
        template={null}
        turnInput={turnInput}
        turnSubmitting={turnSubmitting}
        turns={sessionTurns}
        workspace={selectedWorkspace}
        onSubmitTurn={onSubmitTurn}
        onTurnInputChange={onTurnInputChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Write index.ts barrel export**

```typescript
export { UniversalWorkbenchApp } from './UniversalWorkbenchApp'
export type { UniversalWorkbenchAppProps } from './UniversalWorkbenchApp'
export { SessionChatView } from './SessionChatView'
export { SessionDetail } from './SessionDetail'
export { SessionTurnComposer } from './SessionTurnComposer'
export type { SessionTurnDraft, SessionTurnComposerProps } from './SessionTurnComposer'
export { WorkspaceSessionTree } from './WorkspaceSessionTree'
export type { WorkspaceSessionTreeNode } from './WorkspaceSessionTree'
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/soul-app-workbench/src/universal-workbench/
git commit -m "feat: 添加 UniversalWorkbenchApp 顶层组件"
```

---

### Task 11: Enhance `defineSoulApp()` in `soul-app-sdk` to auto-inject universal workbench route

**Files:**
- Modify: `packages/soul-app-sdk/src/index.ts`

- [ ] **Step 1: Write the auto-injection logic**

Add after the imports and before `defineSoulApp`:

```typescript
const UNIVERSAL_WORKBENCH_ROUTE = {
  id: 'universal-workbench',
  label: '通用工作台',
  path: '/workbench/universal',
  surface: {
    entry: '/micro-app/workbench/universal',
    renderer: 'micro-app' as const,
    scope: 'app' as const,
  },
}
```

Modify `defineSoulApp`:

```typescript
export function defineSoulApp(input: SoulAppProtocolHandlers): SoulAppDefinition {
  const manifest = soulAppManifestSchema.parse(input.manifest)

  // Auto-inject universal workbench route
  const existingRoutes = manifest.ui?.routes ?? []
  const hasUniversalWorkbench = existingRoutes.some(route => route.id === 'universal-workbench')
  if (!hasUniversalWorkbench) {
    manifest.ui = {
      ...manifest.ui,
      routes: [UNIVERSAL_WORKBENCH_ROUTE, ...existingRoutes],
    }
  }

  return {
    ...input,
    manifest,
  }
}
```

- [ ] **Step 2: Write unit test for auto-injection**

Create `packages/soul-app-sdk/src/__tests__/define-soul-app.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { defineSoulApp } from '../index'

describe('defineSoulApp', () => {
  it('auto-injects universal workbench route', () => {
    const app = defineSoulApp({
      manifest: {
        id: 'test-app',
        name: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        protocol: 'soul-app/v1',
        compatibility: { host: { minVersion: '1.0.0' }, sdk: { minVersion: '1.0.0' } },
      },
    } as any)

    expect(app.manifest.ui?.routes).toBeDefined()
    const universalRoute = app.manifest.ui!.routes!.find(r => r.id === 'universal-workbench')
    expect(universalRoute).toBeDefined()
    expect(universalRoute!.surface!.entry).toBe('/micro-app/workbench/universal')
  })

  it('does not duplicate universal workbench route if already declared', () => {
    const app = defineSoulApp({
      manifest: {
        id: 'test-app',
        name: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        protocol: 'soul-app/v1',
        compatibility: { host: { minVersion: '1.0.0' }, sdk: { minVersion: '1.0.0' } },
        ui: {
          routes: [{
            id: 'universal-workbench',
            label: 'Custom Universal',
            path: '/custom',
            surface: { entry: '/micro-app/custom', renderer: 'micro-app', scope: 'app' },
          }],
        },
      },
    } as any)

    const routes = app.manifest.ui!.routes!
    expect(routes.filter(r => r.id === 'universal-workbench')).toHaveLength(1)
    expect(routes[0]!.label).toBe('Custom Universal')
  })
})
```

- [ ] **Step 3: Run the test**

Run: `cd packages/soul-app-sdk && bun test`
Expected: 2 tests pass.

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-sdk/src/index.ts packages/soul-app-sdk/src/__tests__/define-soul-app.test.ts
git commit -m "feat: defineSoulApp 自动注入通用工作台路由"
```

---

### Task 12: Add session API proxy endpoints to `soul-app-runtime`

**Files:**
- Modify: `packages/soul-app-runtime/src/index.ts`

- [ ] **Step 1: Add session API proxy helper**

Add to `packages/soul-app-runtime/src/index.ts`:

```typescript
import type { SoulAppManifest } from '@zonease/aiworker-shared'

export interface SessionApiProxyOptions {
  hostApiBaseUrl: string
  workerId: string
  workspaceId: string
}

export function mountSessionApiProxy(request: Request, options: SessionApiProxyOptions): Response | null {
  const url = new URL(request.url)
  const hostApi = options.hostApiBaseUrl.replace(/\/$/, '')

  // GET /api/sessions
  if (url.pathname === '/api/sessions' && request.method === 'GET') {
    const target = `${hostApi}/api/local/workers/${options.workerId}/workspaces/${options.workspaceId}/sessions`
    return fetch(target, { headers: request.headers }).then(r =>
      new Response(r.body, { status: r.status, headers: r.headers }))
      .catch(() => Response.json({ sessions: [] }))
  }

  // POST /api/sessions (create)
  if (url.pathname === '/api/sessions' && request.method === 'POST') {
    const target = `${hostApi}/api/local/workers/${options.workerId}/workspaces/${options.workspaceId}/sessions`
    return fetch(target, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    }).then(r => new Response(r.body, { status: r.status, headers: r.headers }))
      .catch(() => new Response(null, { status: 502 }))
  }

  return null
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/soul-app-runtime/src/index.ts
git commit -m "feat: 添加 session API 薄透传代理到 soul-app-runtime"
```

---

### Task 12b: Add universal workbench micro-app HTML serving helper

**Files:**
- Create: `packages/soul-app-runtime/src/universal-workbench-html.ts`

- [ ] **Step 1: Write the HTML serving helper**

This helper generates the micro-app HTML page that hosts `UniversalWorkbenchApp`. Soul App mounted services call this when handling `/micro-app/workbench/universal` requests.

```typescript
export function renderUniversalWorkbenchHtml(options: {
  appId: string
  appName: string
  theme?: 'dark' | 'light'
}): string {
  const { appId, appName, theme = 'dark' } = options
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName} · Universal Workbench</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import { createRoot } from 'react-dom/client'
    import { UniversalWorkbenchApp } from '@zonease/aiworker-soul-app-workbench'

    // Receive mount context from Host
    const hostData = window.microApp?.getData?.() ?? {}
    const { workerId, workspaceId, sessionId, theme } = hostData

    // Signal ready to Host
    window.microApp?.dispatch?.({ type: 'ready' })

    // Listen for data updates
    window.microApp?.addDataListener?.((data) => {
      // Re-render when host data changes
      renderApp(data)
    })

    function renderApp(data) {
      const root = document.getElementById('root')
      if (!root) return
      const reactRoot = createRoot(root)
      reactRoot.render(
        // UniversalWorkbenchApp rendered with host data
        // Actual implementation will fetch session list via /api/sessions
        // and manage state internally with React hooks
      )
    }

    renderApp(hostData)
  </script>
</body>
</html>`
}
```

- [ ] **Step 2: Export from soul-app-runtime**

Add to `packages/soul-app-runtime/src/index.ts`:
```typescript
export { renderUniversalWorkbenchHtml } from './universal-workbench-html'
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Update official Soul App mounted services to serve universal workbench HTML**

In each Soul App's `host-adapter/mounted/host-mounted.ts`, add a route handler:

```typescript
// In the fetch handler, before the final 404:
if (url.pathname === '/micro-app/workbench/universal') {
  return new Response(renderUniversalWorkbenchHtml({
    appId: manifest.id,
    appName: manifest.name,
  }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
```

Update `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`, `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`, and `apps/aiworker-custom/host-adapter/mounted/host-mounted.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/soul-app-runtime/src/universal-workbench-html.ts packages/soul-app-runtime/src/index.ts apps/aiworker-hr/host-adapter/mounted/host-mounted.ts apps/aiworker-qa/host-adapter/mounted/host-mounted.ts apps/aiworker-custom/host-adapter/mounted/host-mounted.ts
git commit -m "feat: 添加通用工作台 micro-app HTML 服务端点"
```

---

### Task 13: Update Host `WorkerStudio` with header tabs

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Add header tab rendering**

In `WorkerStudio`, add tab rendering to the `HostTopBar` section. After the breadcrumb locator, add tabs when `showMountedWorkbenchRoute` is true and the Soul App has multiple `ui.routes`.

First, compute the tabs in `WorkerStudio`'s body:

```typescript
const workbenchTabs = useMemo(() => {
  if (!selectedSoulApp?.manifest.ui?.routes || selectedSoulApp.manifest.ui.routes.length <= 1)
    return []
  return selectedSoulApp.manifest.ui.routes
    .filter(route => route.surface?.renderer === 'micro-app')
    .map(route => ({
      id: route.id,
      label: route.label,
      path: mountedChildDefaultPath(route.path),
    }))
}, [selectedSoulApp?.manifest.ui?.routes])
```

Add `workbenchTabs` and `activeTabId` to the `HostTopBar` props.

In `HostTopBar`, after the breadcrumb, render tabs:

```typescript
function HostTopBar({
  locatorSegments,
  onToggleSidebar,
  sidebarCollapsed,
  workbenchTabs,
  activeTabId,
  onSelectTab,
}: {
  locatorSegments: string[]
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
  workbenchTabs?: { id: string, label: string, path: string }[]
  activeTabId?: string | null
  onSelectTab?: (tab: { id: string, path: string }) => void
}) {
  // ...existing breadcrumb code...

  return (
    <ItemActions asChild className="h-10 min-w-0 justify-between gap-3 bg-sidebar px-2.5 text-sidebar-foreground">
      <header data-slot="host-top-bar" data-host-slot="host-top-bar" aria-label="Host actions">
        <ItemActions className="min-w-0 gap-2">
          {/* existing sidebar toggle + breadcrumb */}
          {/* ... */}
          {/* Add tabs after breadcrumb */}
          {workbenchTabs && workbenchTabs.length > 1
            ? (
                <ItemActions className="min-w-0 gap-0.5 ml-2" role="tablist" aria-label="Workbench tabs">
                  {workbenchTabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeTabId}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        tab.id === activeTabId
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => onSelectTab?.(tab)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </ItemActions>
              )
            : null}
        </ItemActions>
        {/* existing panel buttons */}
      </header>
    </ItemActions>
  )
}
```

In `WorkerStudio`, track active tab:

```typescript
const [activeMountedRouteId, setActiveMountedRouteId] = useState<string | null>(null)

const activeMountedRoute = useMemo(() => {
  if (!selectedSoulApp?.manifest.ui?.routes)
    return selectedMountedWorkbenchRoute
  if (!activeMountedRouteId)
    return selectedMountedWorkbenchRoute
  return selectedSoulApp.manifest.ui.routes.find(r => r.id === activeMountedRouteId) ?? selectedMountedWorkbenchRoute
}, [activeMountedRouteId, selectedMountedWorkbenchRoute, selectedSoulApp?.manifest.ui?.routes])
```

Use `activeMountedRoute` instead of `selectedMountedWorkbenchRoute` when rendering `MountedSoulAppRouteSurface`.

Handle tab selection:

```typescript
function handleSelectTab(tab: { id: string, path: string }) {
  setActiveMountedRouteId(tab.id)
  if (selectedSoulApp) {
    const route = selectedSoulApp.manifest.ui?.routes?.find(r => r.id === tab.id)
    if (route && surface?.microApp.name) {
      const childPath = mountedChildDefaultPath(route.path)
      pushMountedMicroAppRoute(surface.microApp.name, childPath)
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Verify existing tests pass**

Run: `cd apps/web && bun test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/worker/worker-studio.tsx
git commit -m "feat: Host header 添加工作台选项卡切换"
```

---

### Task 14: Update Host `WorkerStudio` to remove deprecated session chat imports

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [ ] **Step 1: Remove unused session chat imports**

Remove imports of `WorkerSessionChat`, `SessionTurnComposer`, `SessionDetail` from `apps/web` if they are no longer directly used. These are now accessed through the universal workbench micro-app.

Check that `worker-studio.tsx` no longer imports:
- `./session-chat`
- `./session-turn-composer`
- `./session-detail`
- `./session-progress`

- [ ] **Step 2: Verify typecheck and tests**

Run: `bun run typecheck && cd apps/web && bun test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/worker/worker-studio.tsx
git commit -m "refactor: 移除 WorkerStudio 中已迁出的 session chat 导入"
```

---

### Task 14b: Delete migrated stub files from `apps/web`

**Files:**
- Delete: `apps/web/src/worker/session-chat.tsx`
- Delete: `apps/web/src/worker/session-turn-composer.tsx`
- Delete: `apps/web/src/worker/session-detail.tsx`
- Delete: `apps/web/src/features/session/session-timeline.tsx`
- Delete: `apps/web/src/features/session/session-view-model.ts`
- Delete: `apps/web/src/features/session/message-flow.tsx`
- Delete: `apps/web/src/features/session/engine-readiness.ts`

- [ ] **Step 1: Check for remaining consumers of the stub files**

Run: `rg "from '\.\./(features/session/(session-timeline|session-view-model|message-flow|engine-readiness)|worker/(session-chat|session-turn-composer|session-detail))'" apps/web/src --files-with-matches`
Expected: No results (all consumers have been migrated).

- [ ] **Step 2: Delete the stub files**

```bash
rm apps/web/src/worker/session-chat.tsx
rm apps/web/src/worker/session-turn-composer.tsx
rm apps/web/src/worker/session-detail.tsx
rm apps/web/src/features/session/session-timeline.tsx
rm apps/web/src/features/session/session-view-model.ts
rm apps/web/src/features/session/message-flow.tsx
rm apps/web/src/features/session/engine-readiness.ts
```

- [ ] **Step 3: Update apps/web imports that used the stubs**

Check if any apps/web files still import from the deleted paths:

Run: `rg "features/session/(session-timeline|session-view-model|message-flow|engine-readiness)" apps/web/src --files-with-matches && rg "worker/(session-chat|session-turn-composer|session-detail)" apps/web/src --files-with-matches`

For any remaining consumers, update imports to point to `@zonease/aiworker-soul-app-workbench`.

- [ ] **Step 4: Verify typecheck and tests**

Run: `bun run typecheck && cd apps/web && bun test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "refactor: 删除已迁出的 session chat 桩文件"
```

---

### Task 15: Update `packages/soul-app-workbench/src/index.ts` with full exports

**Files:**
- Modify: `packages/soul-app-workbench/src/index.ts`

- [ ] **Step 1: Write final index.ts**

```typescript
export { UniversalWorkbenchApp } from './universal-workbench/UniversalWorkbenchApp'
export type { UniversalWorkbenchAppProps } from './universal-workbench/UniversalWorkbenchApp'
export { SessionChatView } from './universal-workbench/SessionChatView'
export { SessionDetail } from './universal-workbench/SessionDetail'
export { SessionTurnComposer } from './universal-workbench/SessionTurnComposer'
export type { SessionTurnDraft, SessionTurnComposerProps } from './universal-workbench/SessionTurnComposer'
export { WorkspaceSessionTree } from './universal-workbench/WorkspaceSessionTree'
export type { WorkspaceSessionTreeNode } from './universal-workbench/WorkspaceSessionTree'
export { SessionTimeline } from './universal-workbench/timeline/SessionTimeline'
export type { SessionTimelineProps } from './universal-workbench/timeline/SessionTimeline'
export { MessageFlow, MessageRow, SessionCodeBlock, StatusEventPill, ToolResultCard } from './universal-workbench/timeline/message-flow'
export type { MessageFlowTone, MessageRowProps, StatusEventPillProps, ToolResultCardProps } from './universal-workbench/timeline/message-flow'
export {
  createComposerAttachment,
  createSessionTimelineViewModel,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from './universal-workbench/timeline/session-view-model'
export type {
  NormalizeSessionEventsOptions,
  SessionComposerMaterial,
  SessionComposerMaterialEncoding,
  SessionTimelineActivityDetail,
  SessionTimelineActivityEvent,
  SessionTimelineActivityGroupEvent,
  SessionTimelineActivityKind,
  SessionTimelineActivityStatus,
  SessionTimelineEvent,
  SessionTimelineEventInput,
  SessionTimelineParser,
  SessionTimelineSignalEvent,
  SessionTimelineSignalKind,
  SessionTimelineTurnInput,
  SessionTimelineTurnViewModel,
  SessionTimelineUsageSummary,
} from './universal-workbench/timeline/session-view-model'
export { resolveEngineReadiness } from './universal-workbench/timeline/engine-readiness'
export type { EngineReadiness } from './universal-workbench/timeline/engine-readiness'
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/soul-app-workbench/src/index.ts
git commit -m "feat: 完善 packages/soul-app-workbench 公共导出"
```

---

### Task 16: Full gate verification

- [ ] **Step 1: Full typecheck**

Run: `bun run typecheck`
Expected: No errors across all packages.

- [ ] **Step 2: Full test suite**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: No new lint errors.

- [ ] **Step 4: UI component check**

Run: `bun run ui:check`
Expected: Pass.

- [ ] **Step 5: Soul app validation**

Run: `bun run --filter '@zonease/aiworker-cli' build:bundle && aiworker app validate apps/aiworker-hr && aiworker app validate apps/aiworker-qa && aiworker app validate apps/aiworker-custom`
Expected: All valid.

- [ ] **Step 6: Code review graph**

Run: `bun run crg:update && bun run crg:review`
Expected: Pass.

- [ ] **Step 7: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: 全量 gate 验证通过"
```
