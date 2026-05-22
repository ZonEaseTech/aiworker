# Local Shell + Engine Bridge Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default CLI and Web product entry read as a lightweight Local Shell + Engine Bridge instead of a generic artifact/review/memory platform.

**Architecture:** Phase 2 changes product-entry copy, command-index framing and focused tests only; runtime storage/API compatibility stays intact. Deprecated artifact/review/lesson/profile commands remain callable as hidden compatibility commands, but the default path becomes Soul App -> workspace -> session -> app-owned work.

**Tech Stack:** TypeScript, Vitest, Web i18n static message catalogs, CLI command index/help rendering, Markdown docs, Bun verification commands.

---

## Scope Check

The approved design covers active docs, product entry, runtime mechanism removal and vertical HR/QA validation. Phase 1 already landed the active architecture contract and docs gate. This Phase 2 plan covers only product entry: Web default shell copy, CLI command-index/help framing and `docs/cli.md`. It does not delete core/API/storage artifact, review, lesson, profile, broker or provider modules; those belong in Phase 3 because they require shared schema and runtime migration tests.

## Component Library Preflight

This phase changes static copy and command/help text only. It does not add or modify UI components, CSS, shadcn primitives, layout, icons or `packages/component` usage. No new app-local component gap exists; `packages/ui` preflight is therefore limited to confirming that no UI primitive change is needed. Because visible Web strings change but no component styles change, run focused Web i18n tests and skip `bun run ui:check` unless implementation unexpectedly edits UI component/style files.

## File Structure

- Modify `apps/cli/src/aiworker.ts`: keep deprecated compatibility commands registered, but make `commands --all` group them as deprecated compatibility and update their help descriptions away from active product language.
- Modify `apps/cli/src/aiworker.test.ts`: assert the compact command index is still lightweight, full index labels deprecated compatibility, and `--help --all` describes deprecated compatibility honestly.
- Modify `docs/cli.md`: remove `profile promote` as a normal Work Objects flow and document artifact/review/lesson/profile commands as deprecated hidden compatibility only.
- Modify `apps/web/src/features/i18n/locales/en.ts`: replace default shell copy values that present artifact/review/memory/platform connector language as the main experience.
- Modify `apps/web/src/features/i18n/locales/zh-CN.ts`: same copy convergence in Chinese.
- Modify `apps/web/src/features/i18n/locales/ja.ts`: same copy convergence in Japanese so locale switching does not reintroduce the old default surface.
- Modify `apps/web/src/features/i18n/locales/de.ts`: same copy convergence in German so locale switching does not reintroduce the old default surface.
- Create `apps/web/src/features/i18n/locales/local-shell-copy.test.ts`: focused copy guard for default shell strings across supported locales.

### Task 1: Deprecate Generic Work Object Commands In CLI Entry

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`
- Modify: `docs/cli.md`

- [ ] **Step 1: Update CLI command descriptions**

In `apps/cli/src/aiworker.ts`, keep command registrations in place, but change the compatibility command descriptions to the following exact meanings:

```ts
cli.command('template list', 'list app-declared session templates')
cli.command('files list', 'list workspace files')
cli.command('files show <path>', 'print workspace file')
cli.command('artifacts list', 'deprecated compatibility: list app output descriptors')
cli.command('artifacts show <id>', 'deprecated compatibility: show one app output descriptor')
cli.command('artifacts open <id>', 'deprecated compatibility: open one app output file')
cli.command('profile promote', 'deprecated HR compatibility: promote app output into a workspace README')
cli.command('review list', 'deprecated compatibility: list app confirmation records')
cli.command('review show <id>', 'deprecated compatibility: show one app confirmation record')
cli.command('lessons list', 'deprecated compatibility: list reusable app notes')
cli.command('lessons propose', 'deprecated compatibility: propose a reusable app note')
cli.command('lessons accept <id>', 'deprecated compatibility: accept a reusable app note')
cli.command('lessons reject <id>', 'deprecated compatibility: reject a reusable app note')
```

Do not rename the commands in this phase. Existing automation and tests may still call them until Phase 3 removes or migrates the runtime compatibility layer.

- [ ] **Step 2: Replace full command index grouping**

In `apps/cli/src/aiworker.ts`, replace the old individual full-index lines:

```ts
'template list',
'files list|show',
'artifacts list|show|open',
'profile promote',
'review list|show',
'lessons list|propose|accept|reject',
```

with:

```ts
'compatibility inspection: template list; files list|show',
'deprecated compatibility: artifacts list|show|open; profile promote; review list|show; lessons list|propose|accept|reject',
```

Keep the compact `OPERATOR_COMMAND_INDEX` unchanged.

- [ ] **Step 3: Update command-index tests**

In `apps/cli/src/aiworker.test.ts`, inside `shows a compact operator command index by default and full index on request`, after the existing `commands --all` assertions, add:

```ts
expect(output).toContain('compatibility inspection: template list; files list|show')
expect(output).toContain('deprecated compatibility: artifacts list|show|open; profile promote; review list|show; lessons list|propose|accept|reject')
```

In `shows compact top-level help unless all commands are requested`, after `expect(output).toContain('app create <id>')`, add:

```ts
expect(output).toContain('deprecated compatibility: list app output descriptors')
expect(output).toContain('deprecated HR compatibility: promote app output into a workspace README')
```

- [ ] **Step 4: Run the focused CLI test before docs edits**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: PASS. If it fails because another dirty file changed unrelated CLI behavior, stop and inspect before editing outside this task.

- [ ] **Step 5: Rewrite `docs/cli.md` Work Objects**

In `docs/cli.md`, replace the final two bullets of `## Work Objects`:

```markdown
- `template list`, `files list|show`, `artifacts list|show|open`,
  `profile promote`, `review list|show` and `lessons list|propose|accept|reject`
  remain callable advanced commands for diagnostics, automation and focused
  app-owned workflow checks. They are hidden from the default command index
  because fine-grained agent-operable surfaces should normally go through the
  local daemon API and manifest/protocol/action/search descriptors.
- `profile promote --workspace <id> --artifact <id>` promotes a reviewed
  artifact into the workspace `README.md`. By default the artifact must contain
  a clean `aiworker-profile-readme` fenced draft; `--profile-markdown <path>`
  can provide an explicit reviewed markdown file.
```

with:

```markdown
- `template list` and `files list|show` are compatibility inspection commands
  for app-declared templates and workspace files. They are available through
  `aiworker commands --all`, not the default operator surface.
- `artifacts list|show|open`, `profile promote`, `review list|show` and
  `lessons list|propose|accept|reject` are deprecated compatibility commands.
  They remain callable only to inspect or repair existing local workspaces while
  Phase 3 migrates these generic Host records into app-owned output,
  confirmation and note surfaces. Do not design new Host flows around them.
- HR profile updates, QA release decisions and similar domain confirmations
  should be exposed by the owning Soul App through mounted UI, app-owned actions
  or app-owned files. Host CLI should locate workspace/session context and open
  the app surface instead of promoting generic artifacts.
```

- [ ] **Step 6: Verify docs contract**

Run:

```bash
bun run docs:check
```

Expected: PASS with `docs contract ok`.

- [ ] **Step 7: Commit Task 1**

Stage only Task 1 files:

```bash
git add apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts docs/cli.md
git commit -m "docs: 标记 CLI 兼容命令退场"
```

Do not stage unrelated existing dirty files.

### Task 2: Reword Web Default Shell Copy

**Files:**
- Modify: `apps/web/src/features/i18n/locales/en.ts`
- Modify: `apps/web/src/features/i18n/locales/zh-CN.ts`
- Modify: `apps/web/src/features/i18n/locales/ja.ts`
- Modify: `apps/web/src/features/i18n/locales/de.ts`
- Create: `apps/web/src/features/i18n/locales/local-shell-copy.test.ts`

- [ ] **Step 1: Add focused copy guard test**

Create `apps/web/src/features/i18n/locales/local-shell-copy.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'

import { messagesFor, supportedLocales } from '..'

type ShellCopy = ReturnType<typeof messagesFor>

function defaultShellCopy(copy: ShellCopy): string[] {
  return [
    copy.accessibility.artifactSettings,
    copy.accessibility.businessArtifactPreview,
    copy.accessibility.closeSettings,
    copy.accessibility.openSettings,
    copy.accessibility.soulProjectsAndArtifacts,
    copy.app.subtitle,
    copy.artifact.defaultHint,
    copy.artifact.empty,
    copy.artifact.label,
    copy.artifact.loading,
    copy.artifact.memoryCandidates(2),
    copy.artifact.pending,
    copy.artifact.review,
    copy.artifact.reviewCount(2),
    copy.navigation.topTabs.artifacts,
    copy.projects.empty.detail('HR'),
    copy.workspace.artifactCount(2),
    copy.workspace.createSessionPlaceholder,
    copy.workspace.firstRunDetail,
    copy.workspace.followUpPlaceholder,
    copy.workspace.memoryCandidates,
    copy.workspace.noMemoryCandidates,
    copy.workspace.noSelectionDetail,
    copy.workspace.proposed,
    copy.workspace.requestReview,
    copy.workspace.requestingReview,
    copy.workspace.reviewRubric,
    copy.workspace.reviewWaiting,
    copy.settings.connectors.hint,
    copy.settings.dialog.kicker,
    copy.settings.dialog.subtitle,
    copy.settings.dialog.title,
    copy.settings.externalMcp.pending,
    copy.settings.soulPacks.descriptorPermissionsTitle,
    copy.settings.soulPacks.permissionsTitle,
    copy.settings.soulPacks.permissionCount(2),
    copy.statuses.needs_review,
  ]
}

describe('local shell copy', () => {
  it('keeps deprecated platform concepts out of the default shell copy', () => {
    const forbidden = [
      /artifact/i,
      /review/i,
      /memory/i,
      /proposal/i,
      /broker/i,
      /governance/i,
      /grant/i,
      /audit/i,
      /permission/i,
      /platform connector/i,
      /产物/,
      /评审/,
      /记忆/,
      /提案/,
      /治理/,
      /授权/,
      /审计/,
      /权限/,
      /成果物/,
      /レビュー/,
      /メモリー/,
      /提案/,
      /ガバナンス/,
      /権限/,
      /監査/,
      /Artefakt/i,
      /Review/i,
      /Memory/i,
      /Vorschlag/i,
      /Governance/i,
      /Berechtigung/i,
      /Audit/i,
    ]

    for (const locale of supportedLocales) {
      for (const text of defaultShellCopy(messagesFor(locale))) {
        for (const pattern of forbidden)
          expect(text, `${locale}: ${text}`).not.toMatch(pattern)
      }
    }
  })

  it('describes the default path as Soul App workspace sessions', () => {
    expect(messagesFor('en').app.subtitle).toBe('Soul Apps, workspaces, sessions')
    expect(messagesFor('zh-CN').app.subtitle).toBe('Soul App、工作区、会话')
    expect(messagesFor('en').workspace.firstRunDetail).toContain('app-owned work')
    expect(messagesFor('zh-CN').workspace.firstRunDetail).toContain('应用自有工作')
  })
})
```

- [ ] **Step 2: Run the new Web test and confirm it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/features/i18n/locales/local-shell-copy.test.ts
```

Expected: FAIL on old artifact/review/memory/platform copy.

- [ ] **Step 3: Replace English default shell strings**

In `apps/web/src/features/i18n/locales/en.ts`, replace values for the keys covered by the new test with these exact values:

```ts
artifactSettings: 'Open output settings'
businessArtifactPreview: 'Session output preview'
closeSettings: 'Close local Host settings'
openSettings: 'Open local Host settings'
soulProjectsAndArtifacts: 'Soul workspaces and sessions'
subtitle: 'Soul Apps, workspaces, sessions'
defaultHint: 'Select or create a workspace to inspect app-owned output.'
empty: 'Session outputs appear here after a turn.'
label: 'Session output'
loading: 'Loading session output...'
memoryCandidates: count => `${count} reusable notes`
pending: 'output pending'
review: 'Confirmation'
reviewCount: count => `${count} app confirmations`
artifacts: 'Outputs'
detail: soulName => `Create a ${soulName} workspace to start app-owned work.`
artifactCount: count => `${count} outputs`
createSessionPlaceholder: 'Describe the goal, context, source material, or expected app-owned output...'
firstRunDetail: 'Start with the Soul App that matches the work. AIWorker creates its worker, then opens a workspace and session for app-owned work.'
followUpPlaceholder: 'Ask the selected Soul to continue the app-owned work, refine output, or add source context...'
memoryCandidates: 'Reusable notes'
noMemoryCandidates: 'No reusable app notes for this workspace yet.'
noSelectionDetail: 'Create or select a workspace to inspect sessions and app-owned work.'
proposed: 'Draft'
requestReview: 'Request confirmation'
requestingReview: 'Requesting confirmation...'
reviewRubric: 'Confirmation guide'
reviewWaiting: 'Create app-owned output before requesting confirmation.'
hint: 'Enable connector entries only when a Soul App needs source context from a team system.'
kicker: 'LOCAL AIWORKER'
subtitle: 'Configure session execution, local adapters, Soul Apps, language, and appearance for this Host.'
title: 'Local Host Settings'
pending: 'App-owned local MCP servers will be enabled from workspace binding with secret references when configured.'
descriptorPermissionsTitle: 'Descriptor access'
permissionsTitle: 'App access'
permissionCount: count => `${count} access ${count === 1 ? 'entry' : 'entries'}`
needs_review: 'Needs confirmation'
```

The snippet contains repeated property names from different nested objects. Replace the matching nested values; do not move keys between objects.

- [ ] **Step 4: Replace Chinese default shell strings**

In `apps/web/src/features/i18n/locales/zh-CN.ts`, use these values for the same nested keys:

```ts
artifactSettings: '打开输出设置'
businessArtifactPreview: '会话输出预览'
closeSettings: '关闭本地 Host 设置'
openSettings: '打开本地 Host 设置'
soulProjectsAndArtifacts: 'Soul 工作区与会话'
subtitle: 'Soul App、工作区、会话'
defaultHint: '选择或创建工作区以查看应用自有输出。'
empty: '会话运行后，输出会显示在这里。'
label: '会话输出'
loading: '正在加载会话输出...'
memoryCandidates: count => `${count} 条可复用记录`
pending: '输出待生成'
review: '确认'
reviewCount: count => `此 Soul 中有 ${count} 条确认记录`
artifacts: '输出'
detail: soulName => `创建一个 ${soulName} 工作区，开始应用自有工作。`
artifactCount: count => `${count} 个输出`
createSessionPlaceholder: '描述目标、上下文、输入材料或期望的应用自有输出...'
firstRunDetail: '先选择和业务匹配的 Soul App。AIWorker 会创建对应 worker，然后打开工作区和会话，进入应用自有工作。'
followUpPlaceholder: '让当前 Soul 继续应用自有工作、细化输出或补充来源上下文...'
memoryCandidates: '可复用记录'
noMemoryCandidates: '此工作区还没有可复用应用记录。'
noSelectionDetail: '创建或选择一个工作区，查看会话和应用自有工作。'
proposed: '草稿'
requestReview: '请求确认'
requestingReview: '正在请求确认...'
reviewRubric: '确认指引'
reviewWaiting: '先生成应用自有输出，然后再请求确认。'
hint: '仅在 Soul App 需要从团队系统读取来源上下文时启用连接器。'
kicker: '本地 AIWORKER'
subtitle: '配置此本地 Host 的会话执行、本地适配器、Soul App、语言和外观。'
title: '本地 Host 设置'
pending: 'App-owned local MCP server 会在配置后通过 workspace binding 和 secret reference 启用。'
descriptorPermissionsTitle: 'Descriptor 访问'
permissionsTitle: 'App 访问'
permissionCount: count => `${count} 个访问项`
needs_review: '待确认'
```

- [ ] **Step 5: Replace Japanese default shell strings**

In `apps/web/src/features/i18n/locales/ja.ts`, use these values for the same nested keys:

```ts
artifactSettings: '出力設定を開く'
businessArtifactPreview: 'セッション出力プレビュー'
closeSettings: 'ローカル Host 設定を閉じる'
openSettings: 'ローカル Host 設定を開く'
soulProjectsAndArtifacts: 'Soul ワークスペースとセッション'
subtitle: 'Soul App、ワークスペース、セッション'
defaultHint: 'ワークスペースを選択または作成して、App 所有の出力を確認します。'
empty: 'セッションターン後、出力がここに表示されます。'
label: 'セッション出力'
loading: 'セッション出力を読み込み中...'
memoryCandidates: count => `再利用メモ ${count} 件`
pending: '出力待ち'
review: '確認'
reviewCount: count => `この Soul の確認 ${count} 件`
artifacts: '出力'
detail: soulName => `${soulName} ワークスペースを作成して、App 所有の作業を開始します。`
artifactCount: count => `出力 ${count} 件`
createSessionPlaceholder: '目的、コンテキスト、入力資料、期待する App 所有の出力を記述します...'
firstRunDetail: '作業に合う Soul App から始めます。AIWorker は worker を作成し、ワークスペースとセッションを開いて App 所有の作業へ進みます。'
followUpPlaceholder: '選択中の Soul に App 所有の作業継続、出力の改善、ソースコンテキスト追加を依頼...'
memoryCandidates: '再利用メモ'
noMemoryCandidates: 'このワークスペースにはまだ再利用メモがありません。'
noSelectionDetail: 'ワークスペースを作成または選択して、セッションと App 所有の作業を確認します。'
proposed: '下書き'
requestReview: '確認を依頼'
requestingReview: '確認を依頼中...'
reviewRubric: '確認ガイド'
reviewWaiting: 'App 所有の出力を作成してから確認を依頼してください。'
hint: 'Soul App がチームシステムからソースコンテキストを必要とする場合だけコネクターを有効にします。'
kicker: 'ローカル AIWORKER'
subtitle: 'このローカル Host のセッション実行、ローカルアダプター、Soul App、言語、外観を設定します。'
title: 'ローカル Host 設定'
pending: 'App-owned local MCP server は設定後に workspace binding と secret reference で有効化されます。'
descriptorPermissionsTitle: 'Descriptor アクセス'
permissionsTitle: 'App アクセス'
permissionCount: count => `アクセス項目 ${count} 件`
needs_review: '確認待ち'
```

- [ ] **Step 6: Replace German default shell strings**

In `apps/web/src/features/i18n/locales/de.ts`, use these values for the same nested keys:

```ts
artifactSettings: 'Ausgabeeinstellungen öffnen'
businessArtifactPreview: 'Session-Ausgabevorschau'
closeSettings: 'Lokale Host-Einstellungen schließen'
openSettings: 'Lokale Host-Einstellungen öffnen'
soulProjectsAndArtifacts: 'Soul-Workspaces und Sessions'
subtitle: 'Soul Apps, Workspaces, Sessions'
defaultHint: 'Wähle oder erstelle einen Workspace, um app-eigene Ausgaben zu prüfen.'
empty: 'Session-Ausgaben erscheinen hier nach einem Turn.'
label: 'Session-Ausgabe'
loading: 'Session-Ausgabe wird geladen...'
memoryCandidates: count => `${count} wiederverwendbare Notizen`
pending: 'Ausgabe ausstehend'
review: 'Bestätigung'
reviewCount: count => `${count} App-Bestätigungen`
artifacts: 'Ausgaben'
detail: soulName => `Erstelle einen ${soulName}-Workspace, um app-eigene Arbeit zu starten.`
artifactCount: count => `${count} Ausgaben`
createSessionPlaceholder: 'Beschreibe Ziel, Kontext, Quellmaterial oder erwartete app-eigene Ausgabe...'
firstRunDetail: 'Starte mit der passenden Soul App. AIWorker erstellt den Worker und öffnet dann Workspace und Session für app-eigene Arbeit.'
followUpPlaceholder: 'Bitte die ausgewählte Soul, app-eigene Arbeit fortzusetzen, Ausgabe zu verfeinern oder Quellkontext zu ergänzen...'
memoryCandidates: 'Wiederverwendbare Notizen'
noMemoryCandidates: 'Noch keine wiederverwendbaren App-Notizen für diesen Workspace.'
noSelectionDetail: 'Erstelle oder wähle einen Workspace, um Sessions und app-eigene Arbeit zu prüfen.'
proposed: 'Entwurf'
requestReview: 'Bestätigung anfordern'
requestingReview: 'Bestätigung wird angefordert...'
reviewRubric: 'Bestätigungsleitfaden'
reviewWaiting: 'Erstelle app-eigene Ausgabe, bevor du Bestätigung anforderst.'
hint: 'Aktiviere Konnektoren nur, wenn eine Soul App Quellkontext aus einem Teamsystem braucht.'
kicker: 'LOKALES AIWORKER'
subtitle: 'Konfiguriere Session-Ausführung, lokale Adapter, Soul Apps, Sprache und Darstellung für diesen Host.'
title: 'Lokale Host-Einstellungen'
pending: 'App-eigene lokale MCP-Server werden nach Konfiguration über Workspace-Binding und Secret-Referenzen aktiviert.'
descriptorPermissionsTitle: 'Descriptor-Zugriff'
permissionsTitle: 'App-Zugriff'
permissionCount: count => `${count} ${count === 1 ? 'Zugriffseintrag' : 'Zugriffseinträge'}`
needs_review: 'Bestätigung offen'
```

- [ ] **Step 7: Run the focused Web copy test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/features/i18n/locales/local-shell-copy.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run Web typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Stage only Task 2 files:

```bash
git add apps/web/src/features/i18n/locales/en.ts apps/web/src/features/i18n/locales/zh-CN.ts apps/web/src/features/i18n/locales/ja.ts apps/web/src/features/i18n/locales/de.ts apps/web/src/features/i18n/locales/local-shell-copy.test.ts
git commit -m "fix: 收敛 Web 默认入口文案"
```

Do not stage unrelated existing dirty files.

### Task 3: Final Verification And Review

**Files:**
- Review only: changed files from Task 1 and Task 2

- [ ] **Step 1: Run focused verification**

Run:

```bash
bun run docs:check
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
bun run --filter '@zonease/aiworker-web' test src/features/i18n/locales/local-shell-copy.test.ts
bun run --filter '@zonease/aiworker-web' typecheck
git diff --check
```

Expected: all PASS. If a command fails, fix only the related Task 1/Task 2 files.

- [ ] **Step 2: Run code-review-graph because TypeScript code changed**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: no Critical findings. Important findings must be fixed or explicitly justified with evidence.

- [ ] **Step 3: Confirm unrelated dirty files were not staged**

Run:

```bash
git status --short
git diff --name-only --cached
```

Expected: staged files, if any, are only Phase 2 files. Existing unrelated dirty files such as PMA index or HR workbench tests must remain unstaged unless they were already committed by another process.

- [ ] **Step 4: Commit the plan file if not committed yet**

If the plan file is still uncommitted, stage only:

```bash
git add docs/superpowers/plans/2026-05-21-local-shell-engine-bridge-phase-2.md
git commit -m "docs: 规划轻量 Host 产品入口"
```

If Task 1 or Task 2 commits already included the plan file by accident, do not create a duplicate commit.
