# Shadcn Full Import Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the complete shadcn component set into `packages/ui` and drive a shadcn-first migration across Host Web and official Soul App web surfaces.

**Architecture:** `packages/ui` owns generated shadcn components and shared shadcn styles. `apps/web` and Soul App web packages import shadcn primitives directly from `@zonease/aiworker-ui/components/*`. `packages/component` is legacy migration debt: use it only as a reference for existing behavior while consumers move off it, and do not add new primitives, package-owned styles or business-shell patterns there unless the user explicitly approves a temporary compatibility fix.

**Checkpoint Update 2026-05-20 01:05:** The first creation-dialog family has now moved past button-only adoption. `apps/web` create-worker/create-workspace dialogs directly compose shadcn `Dialog`, `Field`, `Input`, `Select` and `Button`; app-local dialog/form classes were removed from that path. Tailwind v4 source detection now scans `packages/ui/src` through the exported UI stylesheet, and `ui:check` recognizes `@zonease/aiworker-ui` as a shared primitive package.

**Checkpoint Update 2026-05-20 01:15:** Host Platform Settings shell now uses shadcn `Dialog`, vertical `Tabs`, `ScrollArea` and `Button` directly from `@zonease/aiworker-ui`. Legacy `.modal-backdrop`, `.modal-settings`, `.settings-sidebar` and `.settings-nav-item` styling has been removed from the settings shell path. The generated `Tabs` primitive now forwards `orientation` to Radix so the vertical settings nav has correct accessibility semantics.

**Checkpoint Update 2026-05-20 01:40:** Host Platform Settings internals now directly compose shadcn `Card`, `Field`, `Input`, `ToggleGroup`, `Switch`, `Badge` and `Button`; legacy `ActionCard`, `Field`, `SegmentedControl`, `.settings-action-button`, `.switch-row`, `.settings-card-row` and related local form/card selectors have been removed from that path. Host Web imports the legacy `@zonease/aiworker-component/styles.css` inside a lower cascade layer so it remains a temporary compatibility stylesheet instead of overriding shadcn `data-slot` primitives. HR product web proof surfaces now use `@zonease/aiworker-ui` `Card` / `Badge` directly and no longer depend on `@zonease/aiworker-component`.

**Checkpoint Update 2026-05-20 02:15:** User correction accepted into the active contract: `packages/component` is no longer treated as a package to improve. `AGENTS.md`, `docs/architecture.md`, `aiworker-host-dev` and `ui:check` now route new UI work to `packages/ui` and classify remaining `@zonease/aiworker-component` usage as documented migration debt.

**Checkpoint Update 2026-05-20 02:35:** Host shell controls and visible HR mounted workbench chrome now use shadcn `Button` / `InputGroup` directly. Legacy `IconButton`, `.icon-button`, `.shell-primary-action` and raw toolbar input paths were removed from Host topbar, worker rail, generic mounted workbench actions/search, HR profile chrome and session chat header controls. Browser radius metrics on the operator-running `localhost:5173` desktop/mobile views report zero legacy icon buttons, zero shell primary actions, zero large-radius buttons/elements and no horizontal overflow.

**Checkpoint Update 2026-05-20 02:55:** Local workspace primitives were thinned further: `WorkspaceCard` now renders as shadcn `Button`, `WorkerIdentityBlock` renders as shadcn `Card`, `SessionProgressPanel` composes shadcn `Card`, `Badge` and `Progress` instead of the legacy `ProgressCard`, and HR profile list cards now use shadcn `Button` / `Badge` for the visible profile card action and lifecycle tag.

**Checkpoint Update 2026-05-20 03:15:** Session and HR visible paths were moved further off legacy class-driven styling. `SessionComposer`, `SessionTimeline` and `MessageFlow` now use shadcn slot/data attributes plus `Button`, `InputGroup`, `Alert`, `Badge`, `Card`, `Dialog`, `Select` and `Spinner` composition instead of legacy `.session-composer-*` / `.session-*` visual classes. The HR people profile list and profile tools side panel now render as shadcn `Card` regions with shadcn `Button` / `Badge` inner actions, while profile patch status and patch strip use shadcn `Alert`.

**Checkpoint Update 2026-05-20 03:50:** The user-reported multi-border / custom-style interference was treated as a blocking visual debt. Host Web no longer imports any app-local CSS except `apps/web/src/styles/index.css`, which now only imports Tailwind and `@zonease/aiworker-ui/styles.css`; the 60-line `shadcn-legacy-bridge.css` alias layer was removed after confirming no runtime consumers of old `--bg` / `--text` / `--accent` tokens. `SessionTimeline` and `SessionDetail` no longer use native `details` / `summary`; they now compose shadcn `Collapsible` + `Item`. HR profile reading/review sections now use `ItemGroup` / `Item` instead of stacking many `Card` shells, and the HR people layout no longer uses the app-local `--hr-people-columns` variable.

**Checkpoint Update 2026-05-20 04:20:** The second visual-debt pass addressed the screenshot feedback more directly. `MarkdownPreview` now maps GFM tables onto shadcn `Table`, `TableHeader`, `TableRow`, `TableHead` and `TableCell`, removing app-local cell-grid borders from HR profile summaries and patch review markdown. The HR profile patch-ready strip now uses shadcn `AlertAction` instead of a custom grid layout inside `Alert`, so the action no longer fights the generated alert composition. `check-web-ui-components --all --audit` now has a second self-check dimension: a class-density report that ranks app files by visual utility token count so future completion attempts cannot ignore high-custom-style areas just because they technically import shadcn primitives.

**Checkpoint Update 2026-05-20 04:35:** The shell/header residual pass cleared the remaining raw-styled-native audit findings instead of classifying them away. `StudioMainFrame`, generic Worker Studio fallback headers, the session chat header and artifact rail headings now compose shadcn `CardHeader`, `CardContent` and `Item` slots for kicker/title/action structure. The session chat header keeps progress as a small shadcn `Badge` instead of embedding a full progress `Card`, after Playwright caught the first attempt expanding the header to 226px in dark session view.

**Checkpoint Update 2026-05-20 04:40:** Settings section intros and the visible Test/Rescan action row now use shadcn `Item`, `ItemTitle`, `ItemDescription` and `ItemActions` slots instead of local raw heading/action wrappers. The shared `StudioSectionHeader` was converted to shadcn `Item` slots and reused by session detail memory headers. `MarkdownPreview` now owns the standard markdown/prose class stack, so HR reading room and patch review no longer carry long app-local typography selectors for each markdown surface.

**Checkpoint Update 2026-05-20 05:00:** The stricter user intervention was folded into the migration gate. `check-web-ui-components --all --audit` now emits explicit app-local semantic class and shadcn theme-token audits in addition to class-density, so completion attempts must show custom class count and the active shadcn style/base color/icon/radius/font/primary/chart tokens. HostTopBar breadcrumb now uses shadcn `Breadcrumb`; session detail card headers no longer add extra `border-b`; HR profile tools, profile cards, profile detail headings, patch review section headings and shared collapsible group headings now use shadcn `ItemTitle` / `ItemDescription` slots. The visible Settings Test/Rescan actions now use shadcn `ButtonGroup`, and the HR empty profile selection state no longer draws an app-local full-panel dashed border. A Playwright color audit found `Button` variant selectors overriding nested shadcn slot colors; `packages/ui` `Button` now scopes direct-span color selectors to `span:not([data-slot])`, preserving nested `Badge` primary foreground color.

**Checkpoint Update 2026-05-20 05:20:** The self-check gate now includes a `class dimension audit` that reports slotless native `className` count plus border/radius/font/dark/arbitrary token counts per file. This was added because the earlier semantic-class audit could report `0` while raw native layout and visual utility classes still shaped the UI. `od-*` is now included in the custom class prefix scan, and the old `od-loading-shell` fallback class was removed. `packages/ui` `ItemContent`, `ItemTitle` and `ItemDescription` now support `asChild`, allowing shadcn Item slots to be reused legally inside inline primitives such as `Badge`, `SelectItem`, `ToggleGroupItem` and `Button`. The latest app migration pass moved SessionComposer select options and usage badges, Settings tabs/toggles/Test/Rescan labels, Worker Studio workbench actions/search/status/sidebar footer labels, profile patch columns and `SessionProgressPanel` title/detail text onto shadcn Item slots. The operator-running `localhost:5173` viewport was checked with Playwright screenshots at `output/playwright/shadcn-current-playwright-audit.png` and `output/playwright/shadcn-current-playwright-forced-dark-audit.png`; forced dark mode reads `--primary=oklch(0.432 0.232 292.759)`, `--background=oklch(0.141 0.005 285.823)` and `--foreground=oklch(0.985 0 0)`, confirming the shadcn dark token branch is active.

**Checkpoint Update 2026-05-20 07:52:** The app icon layer now follows the shadcn preset instead of mixing libraries. `apps/web` visible UI moved off `lucide-react` and now uses `@hugeicons/core-free-icons` + `HugeiconsIcon`, matching `packages/ui/components.json` `iconLibrary=hugeicons` and the generated shadcn components. `scripts/check-web-ui-components.ts --all --audit` now fails future Host Web / official Soul App web TSX that reintroduces `lucide-react`, and `UI-001` / agent instructions record icon-library alignment as part of the shadcn-first contract. The audit also scans `*ClassName` string constants, making `MarkdownPreview` prose typography visible as accepted content-style residue instead of an unscanned custom-style pocket.

Browser checkpoint on the operator-running `localhost:5173` HR profile workspace: desktop, profile-selected and forced-dark audits report document overflow 0, offscreen visible elements 0, native `details` / `summary` count 0, old custom class prefix count 0, raw border utility on non-slot elements 0, large non-badge radius 0, body font `"Oxanium Variable", sans-serif` plus mono only where explicitly intended, shadcn primary token changing between light `oklch(0.491 0.27 292.581)` and dark `oklch(0.432 0.232 292.759)`, and chart token `--chart-1` present from the applied preset. After the table migration, HR profile markdown table cells have `data-slot="table-cell"` / `data-slot="table-head"` and computed left/right/top/bottom borders of `0px`; row separators now come from the generated shadcn `TableRow` primitive. Build no longer emits the previous Recharts chart selector CSS warnings; the remaining build warning is only the existing large JS chunk warning.

**Checkpoint Update 2026-05-20 08:10:** The latest intervention was treated as a stricter self-check checkpoint, not a scope interruption. `MarkdownPreview` now removes the long descendant-selector class constant and renders headings through shadcn `ItemTitle` with `asChild`; GFM table slots remain shadcn `Table` primitives, and residual typography utilities are explicit content-renderer classes rather than hidden selector pockets. HR profile reading-room and patch-review sections were thinned from `muted` panel blocks to default shadcn `Item` composition, which removes the stacked muted-card effect visible in dark mode. `MessageFlow` now composes shadcn `ItemGroup` / `Item` instead of anonymous `div` / `article` containers, and arbitrary `[overflow-wrap:anywhere]` escapes were replaced with standard `break-words`.

Current self-check state after the 08:10 pass: `bun scripts/check-web-ui-components.ts --all --audit` reports 0 governance failures, 0 legacy migration entries, 0 app-local semantic class tokens and `shadcn=4 metadataOnly=9 legacy=0 unclassified=0` for official Soul App product web. The class-dimension audit now also surfaces arbitrary-only layout density; current top entries are `studio-shell.tsx`, `worker-studio.tsx`, `settings-dialog.tsx`, `session-chat.tsx` and HR people workbench layout files. These are not completion blockers by themselves, but they must be classified or thinned before any final goal completion claim. Light/dark screenshots were refreshed as `output/playwright/current-hr-light-after-reading-room-thin.png` and `output/playwright/current-hr-dark-after-reading-room-thin.png`, and appearance was restored to light mode.

**Checkpoint Update 2026-05-20 08:25:** The next pass treated the user's explicit arbitrary/custom-class concern as a blocking self-check item. The Host shell, artifact rail and HR people workbench moved off bespoke arbitrary grid templates and now use standard flex layout around shadcn primitives. Settings Dialog moved off arbitrary `calc()` / `minmax()` layout sizing and now composes shadcn `Dialog` + vertical `Tabs` with standard viewport/width utilities. Session and HR preview height escapes such as `72vh` / `440px` were replaced with standard Tailwind utilities, and the audit script now checks source-level arbitrary utility tokens without mistaking TypeScript indexed access like `items[0]` for class utilities.

Current self-check state after the 08:25 pass: `bun scripts/check-web-ui-components.ts --all --audit` reports 0 governance failures, no class-dimension findings, 0 app-local semantic class tokens, 0 legacy migration entries and `shadcn=4 metadataOnly=9 legacy=0 unclassified=0` for official Soul App product web. The visible residual density is now explicit content typography only: markdown renderer heading/body/code classes, compact page titles, and semantic destructive text. Browser screenshots on the operator-running `localhost:5173` HR profile workspace were refreshed as `output/playwright/current-hr-after-flex-thin-light.png`, `output/playwright/current-hr-after-flex-thin-dark.png`, `output/playwright/current-hr-after-flex-thin-dark-mobile.png` and `output/playwright/current-settings-execution-dialog-thin-dark.png`; they show the previous multi-border stack reduced to thin shadcn `Item`, `Alert`, `Table` and `Button` composition across desktop light, desktop dark, mobile dark and Settings execution dialog dark mode. This remains a progress checkpoint, not completion; the final acceptance scan must still cover all Host Web and official Soul App rendered surfaces.

**Checkpoint Update 2026-05-20 08:32:** The next self-check expanded the dimension audit to app-local z-index utilities because shadcn overlay components should own stacking. Settings Dialog removed the last manual `z-10` from its close/autosave action container, and `check-web-ui-components --all --audit` now reports `z=` in class-dimension findings whenever app code reintroduces `z-*`. `MarkdownPreview` also removed the redundant `text-foreground` root class, lowering residual visual density while leaving heading/body/code typography explicitly classified as content rendering.

Current self-check state after the 08:32 pass: `bun scripts/check-web-ui-components.ts --all --audit` passes with no class-dimension findings, 0 app-local semantic class tokens and 0 legacy migration entries. Focused `MarkdownPreview` and Worker Studio tests pass, and `output/playwright/current-settings-execution-dialog-zfree-dark.png` confirms the Settings execution surface still renders as thin shadcn composition with Test/Rescan as ghost icon buttons and no app-local z-index layer. This remains a progress checkpoint, not completion.

**Checkpoint Update 2026-05-20 08:50:** The user intervention on hidden custom-style residue was treated as a blocking migration-quality failure. `packages/ui` `Item` no longer carries a default `border` class; only the explicit `outline` variant frames rows, preventing default `Item` usage in HR profile sections from creating visible nested-border stacks. `check-web-ui-components --all --audit` now reports a framed-surface audit, app-level semantic theme-token audit, shadcn primitive semantic-token audit, always-on class-dimension leaderboard, and a contract check that fails if `Item` reintroduces a base border. `SessionTimeline` duplicate detail keys were fixed and covered by a focused test, and session log/code blocks now carry `min-w-0` / `max-w-full` containment so long tool output no longer collapses across the session pane.

Current self-check state after the 08:50 pass: focused `SessionTimeline`, Worker Studio and `packages/ui` `Item` tests pass; Web/UI typechecks pass; `bun scripts/check-web-ui-components.ts --all --audit` passes with 0 governance failures, 0 legacy migration entries, 0 app-local semantic class tokens, `shadcn=4 metadataOnly=9 legacy=0 unclassified=0`, active `radix-mira` / `zinc` / `hugeicons` / Oxanium / violet primary / chart tokens, and a primitive semantic-token count showing shadcn components actively use `primary`, `accent`, `muted`, `foreground`, `destructive`, `input`, `ring`, `border` and sidebar tokens. Browser screenshots on the operator-running `localhost:5173` were refreshed as `output/playwright/hr-workbench-after-item-thin-light.png`, `output/playwright/hr-workbench-after-item-thin-dark-wide.png` and `output/playwright/session-after-log-layout-fix-light.png`; new session-tab console logs report 0 errors and 0 warnings. Appearance was restored to light. This remains a progress checkpoint, not completion.

**Checkpoint Update 2026-05-20 06:05:** The stricter visual self-check from the user intervention now blocks on class dimension and runtime token evidence, not only on smoke tests. The latest pass removed shell sidebar divider borders, replaced Settings Test/Rescan `ButtonGroup` styling with plain shadcn ghost `Button` actions, moved active profile/workspace/engine cards to shadcn `secondary` / `ghost` variants instead of app-local `aria-pressed:border-primary bg-primary/5`, added shadcn slot ownership for remaining native layout wrappers, removed redundant app-local `font-mono`, `bg-background`, `text-foreground`, `text-card-foreground` and `border-transparent` classes, and kept official Soul App product web surfaces directly on `@zonease/aiworker-ui` where they render UI.

Current self-check state after the 06:05 pass: runtime `@zonease/aiworker-component` imports in `apps/web/src` and official Soul App product web are cleared except negative proof assertions in tests. `bun scripts/check-web-ui-components.ts --all --audit` reports 0 governance failures, 0 legacy migration entries, 0 app-local semantic class tokens, no raw-styled-native findings, no class-dimension findings, and shadcn theme tokens from `radix-mira` / `zinc` / `hugeicons` / Oxanium / violet primary / amber chart. Runtime browser probes on `localhost:5173` report light `--primary=oklch(0.491 0.27 292.581)` and dark `--primary=oklch(0.432 0.232 292.759)`, `--chart-1=oklch(0.879 0.169 91.605)`, `--radius=0.5rem`, body font `"Oxanium Variable", sans-serif`, 0 slotless visible borders, 0 app-specific runtime class prefixes and 0 large non-badge radius.

Latest residual audit after the 06:06 pass: the visual utility density leaderboard is now `settings-dialog.tsx` 5, `session-composer.tsx` 5, `studio-shell.tsx` 5, `worker-studio.tsx` 4, `session-detail.tsx` 4, local workspace `session-composer.tsx` 4, `profile-list.tsx` 3, `session-timeline.tsx` 3 and `message-flow.tsx` 2. This is a major reduction from the previous class-dimension blockers, but it is not a completion claim: the remaining density entries still need follow-up thinning or final classification.

**Checkpoint Update 2026-05-20 06:18:** The latest thin-style pass targeted the user's visible border/radius/font concerns rather than treating the previous audit as enough. HR people workbench removed the extra outer profile-list `Card`, changed shared collapsible section triggers from outline to ghost shadcn `Button`, and replaced the current profile summary `Card` with a muted shadcn `Item`. The Host sidebar worker list also no longer adds an inner `Card` ring. Redundant `text-left`, `text-sm` / `text-xs`, duplicated textarea font sizing, muted icon color and nested muted background overrides were removed from Settings, session composer, session timeline, workspace cards, session detail, HR profile cards and profile tools where shadcn slots already own the behavior.

Current self-check state after the 06:18 pass: `bun scripts/check-web-ui-components.ts --all --audit` reports 0 governance failures, 0 legacy migration entries, 0 app-local semantic class tokens, no raw-styled-native findings, no class-dimension findings, and active shadcn theme tokens from `radix-mira` / `zinc` / `hugeicons` / Oxanium / violet primary / amber chart. The class-density leaderboard now tops out at 2 visual tokens per file: `worker-studio.tsx`, `studio-shell.tsx`, `session-detail.tsx` and `message-flow.tsx` at 2, with remaining listed files at 1. Browser probe on `localhost:5173` reports `ringLikeCount=0`; remaining visible borders are generated shadcn `alert`, `button` and `table-row` primitives. The Settings UI dark-mode toggle was exercised directly: dark mode applied `.dark`, `color-scheme: dark`, `--primary=oklch(0.432 0.232 292.759)`, dark background and foreground, then the page was restored to light mode. This is still not a completion claim; final completion remains blocked on the required full scan, screenshots and remaining-utility classification.

**Checkpoint Update 2026-05-20 06:25:** The residual visual-utility pass removed nonessential `text-left`, `text-right`, `text-sm`, `text-xs`, `text-muted-foreground` and preview-caption centering classes from shared collapsible triggers, HR profile cards, HR patch sections, unknown profile headings, worker identity rows, session composer previews and message-flow code blocks. The latest `bun scripts/check-web-ui-components.ts --all --audit` now reports only six residual visual-density files: `worker-studio.tsx`, `studio-shell.tsx` and `session-detail.tsx` at 2 tokens, plus `settings-dialog.tsx`, `profile-details.tsx` and local workspace `session-composer.tsx` at 1 token. Desktop and mobile screenshots were captured to `output/playwright/shadcn-hr-thin-style-0626-desktop.png` and `output/playwright/shadcn-hr-thin-style-0626-mobile.png`. Runtime probes report 0 app-local semantic class tokens, 0 ring-like shadows and 0 horizontal overflow; mobile also reports 0 large non-badge/non-scrollbar radius. The desktop large-radius sample is only the generated shadcn `ScrollArea` thumb. Completion remains blocked until the remaining title/error-state utilities are classified and a broader final rendered-surface review is complete.

**Checkpoint Update 2026-05-20 06:39:** The official Soul App product web gate now covers both HR and QA rendered product surfaces, not only Host Web and HR. QA product web adds direct `@zonease/aiworker-ui` `Card` / `Badge` proof components, React JSX typing support and a component-proof test; metadata-only product web files are explicitly classified. `bun scripts/check-web-ui-components.ts --all --audit` reports `shadcn=4 metadataOnly=9 legacy=0 unclassified=0` for official Soul App product web and fails future legacy/unclassified rendered surfaces. Settings engine Test/Rescan actions were thinned again into icon-only shadcn ghost `Button` controls with `aria-label` / `title` and `data-icon` on the icons, so the row no longer depends on a custom-looking text action treatment. A new creation-dialogs focused test covers shadcn `Dialog`, `Select`, `Input` and `Button` slot composition for create-worker/create-workspace, including close/submit icon contracts. Runtime probes on `localhost:5173` confirmed light primary/chart tokens, `.dark`, dark primary/background/foreground tokens, 0 custom runtime class tokens, 0 slotless bordered elements, 0 large non-badge radius samples and 0 horizontal overflow, then restored the setting to light. Desktop light/dark screenshots were refreshed as `shadcn-hr-active-profile-light-desktop-0658.png` and `shadcn-hr-active-profile-dark-desktop-0650.png`. Focused Web tests passed 48/48, QA/HR product web proof tests and typechecks passed, Web typecheck/build passed, `ui:check`, `docs:check` and `git diff --check` passed, and code-review-graph reports 0 affected flows. Static CRG test gaps remain listed for direct proof functions and `CreateDialogShell` despite the focused coverage, so this checkpoint is still not completion; the full-migration acceptance scan and final rendered-surface review remain required.

**Checkpoint Update 2026-05-20 06:56:** The next structural pass targeted the Host sidebar as component-library-shaped residue. Without replacing the full shell grid, `WorkerStudioLayout` now wraps left-rail contents with shadcn `SidebarContent`, and Host navigation, worker-list grouping and footer use shadcn `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem` and `SidebarFooter`. The focused Worker Studio test now asserts these sidebar slots so the left rail cannot quietly regress to anonymous app-local wrappers. Focused Web tests passed in stable groups (`creation-dialogs` + local workspace composer 3/3, markdown/collapsible 5/5, Worker Studio 40/40); the single 5-file vitest command hung without output again and was not counted as passed. Web typecheck/build passed, `ui:check`, `docs:check`, `git diff --check` and code-review-graph review passed, and `bun scripts/check-web-ui-components.ts --all --audit` still reports 0 legacy entries, 0 app-local semantic class tokens and `shadcn=4 metadataOnly=9 legacy=0 unclassified=0` for official Soul App product web. Fresh 5173 screenshots were captured as `shadcn-sidebar-structure-light-desktop-0656.png` and `shadcn-sidebar-structure-dark-desktop-0656.png`; light/dark sidebar spacing and contrast remain visually thin. This is still not completion; a broader app-local component/class acceptance scan remains required.

**Checkpoint Update 2026-05-20 09:45:** The surface-boundary feedback was
folded into the shadcn-first contract. The official shadcn theming model does
not define a separate `paper` token; it defines semantic surface pairs such as
`background` / `foreground`, `card` / `card-foreground`, `muted` /
`muted-foreground` and `sidebar` / `sidebar-foreground`. Host shell now binds
the canvas to `bg-background text-foreground`, the left rail to
`bg-sidebar text-sidebar-foreground`, and the HR People profile list/details
panels to shadcn `Card` surfaces. HR profile summary and section blocks now use
`Item variant="muted"` as the soft paper layer instead of returning to old
multi-border cards.

The full UI audit now explicitly classifies those four Host shell semantic
surface tokens as accepted shadcn surface usage. Any other residual
`bg-*`/`text-*` visual utility remains blocked unless it is classified with a
specific reason. The class-dimension audit now recognizes scoped native layout
markers such as `data-host-slot`, `data-session-slot` and `data-profile-slot`,
and the Host shell body, session chat pane and HR profile column wrapper now
carry explicit scoped slots instead of anonymous native wrappers. Playwright
runtime probes on `localhost:5173` confirmed light and dark backgrounds differ
through theme tokens: light shell/sidebar/card/muted surfaces resolve to the
light preset, while forced dark mode resolves to dark `background`, `sidebar`,
`card` and `muted` values. This remains a checkpoint; full completion still
requires the required acceptance scan across all Host Web and official Soul App
rendered surfaces.

**Checkpoint Update 2026-05-20 10:35:** The Settings interaction review was
traced to shared primitive and composition issues rather than fixed with
app-local styling. `packages/ui` `Button`, `TabsTrigger`, `Toggle` and clickable
`Item` surfaces now provide pointer cursor plus semantic `accent` hover/pressed
states from the generated shadcn layer. Settings router tabs now stay
content-height (`md:h-fit`) with overflow instead of stretching to the full
dialog height, and engine logos moved from shadcn `Avatar` to `ItemMedia
variant="image"` so logo media no longer gets an avatar outline.

HostTopBar now uses `bg-sidebar text-sidebar-foreground` because it is Host
chrome that visually belongs with the left rail, while the workspace and Soul
App content remains on `background` / `card` / `muted` surfaces. Focused
`@zonease/aiworker-ui` primitive tests and Worker Studio tests pass. Playwright
on `localhost:5173` confirmed the Settings tablist is 476px inside a 992px
dialog instead of equal-height splitting, all Settings tabs and engine/Test/
Rescan controls compute `cursor: pointer`, and HostTopBar/sidebar token colors
match in light and dark modes. This remains a progress checkpoint, not
completion.

**Checkpoint Update 2026-05-20 11:45:** The latest Settings/Host chrome review
keeps the distinction between generated shadcn primitive state and local app
composition. `cursor-pointer` is not added to individual component class
strings; enabled native button-like targets get pointer cursor from the shadcn
global base rule. HostTopBar remains part of Host chrome, so its icon buttons
now render as shadcn `SidebarMenuButton` controls and use `sidebar-accent` /
`data-active` state while the shell content stays on `background` / `card` /
`muted`.

The session composer action row now follows the official shadcn `InputGroup`
composition more closely. Attachment, secondary/status and submit actions
render through `InputGroupButton`, and attachment count renders as an inline
shadcn `Badge` instead of an absolute positioned badge. Playwright on the
operator-running `localhost:5173` confirmed the composer action buttons sit
inside `input-group-addon`, Settings router tabs remain a fixed 320px desktop
scroll region, engine glyph containers have no border/radius/shadow frame, and
no horizontal overflow is present. This remains a progress checkpoint, not
completion.

**Checkpoint Update 2026-05-20 11:56:** The next session framed-surface pass
removed three avoidable outline/card uses without adding app-local style.
Session timeline turn errors now render as shadcn `Alert` /
`AlertDescription`, the artifact rail Request review action uses the primary
`Button` variant, and the chat Latest jump action uses `secondary` instead of
`outline`. Focused tests and UI audit confirm `session-detail.tsx` dropped to
`framed=4 outlineButton=0`, `session-chat.tsx` no longer appears in the
framed-surface leaderboard, and custom semantic class tokens remain at 0. This
remains a progress checkpoint, not completion.

**Checkpoint Update 2026-05-20 11:59:** The composer attachment chip shell now
uses shadcn `Item variant="muted"` rows inside `InputGroupAddon` instead of
nested `Card` / `CardContent`. Image attachment preview and remove behavior are
unchanged, but the composer audit drops to `framed=3 card=0 outlineButton=0`
with focused tests proving attachment rows are not nested in a Card. This
remains a progress checkpoint, not completion.

**Checkpoint Update 2026-05-20 12:02:** The HR reading-room patch-ready strip
keeps shadcn `Alert` / `AlertAction`, but its Review action now uses the
default shadcn `Button` variant instead of outline. This removes
`profile-reading-room.tsx` from the framed-surface leaderboard. Playwright on
the operator-running `localhost:5173` confirms the action remains compact
inside the alert, computes to pointer cursor, has no oversized radius, and
does not introduce horizontal overflow. This remains a progress checkpoint,
not completion.

**Checkpoint Update 2026-05-20 12:06:** The HR profile tools recent-session
list now renders each entry as a clickable shadcn `Item variant="muted"` row
instead of an outline Button. Native button semantics and open-session behavior
are preserved, while the visual surface comes from the Item primitive.
Playwright confirms the row remains compact, computes to pointer cursor, has no
oversized radius and does not introduce horizontal overflow. This remains a
progress checkpoint, not completion.

**Checkpoint Update 2026-05-20 13:08:** The Settings router height regression
was traced to narrow-screen height/overflow classes being applied as base
layout on the shadcn `TabsList`. Those constraints are now scoped to
`max-md:*`; desktop uses natural content height with `md:max-h-none` and
`md:overflow-visible`, so the router no longer becomes a local 320px scroll
region inside a tall dialog. Focused Worker Studio coverage guards this class
contract, and Playwright on `localhost:5173` confirms the live tablist is
240px by 476px with `scrollHeight === clientHeight`, `overflowY=visible`, and
all eight settings routes visible.

**Checkpoint Update 2026-05-20 13:14:** The Settings engine icon row removed
its last raw native class pocket. Engine SVG masks now render directly on
shadcn `ItemMedia variant="icon"` instead of an extra
`span[data-slot="engine-logo"]` child. Focused Worker Studio coverage blocks
the child span from returning, the full UI audit now reports
`settings-dialog.tsx` at `native=0` and `rawNativeClassName=0`, and Playwright
on `localhost:5173` confirms Codex/Cursor icons are 16px ItemMedia nodes with
mask images active, no child classed element, no border/radius/shadow and no
horizontal overflow.

**Checkpoint Update 2026-05-20 13:21:** Creation dialogs now use a single
shadcn `FieldGroup` form stack instead of `FieldGroup` nested inside
`FieldGroup`. The direct children are shadcn `Field` rows plus
`DialogFooter`, which avoids stacked form spacing while preserving the
generated `Dialog`, `Field`, `Select`, `Input` and `Button` primitives.
Focused creation-dialog tests block the nested FieldGroup regression for
create-worker and create-workspace, and Playwright on `localhost:5173`
confirmed the live create-worker dialog has one field group, no nested group,
compact field/footer spacing, no horizontal overflow and stable bounds.

**Checkpoint Update 2026-05-20 13:36:** The framed-surface audit now separates
scoped native layout markers from true slotless native class usage. It reports
`scopedNativeClassName` and `slotlessNativeClassName` separately, and the
current full-tree audit keeps `slotlessNativeClassName=0`. The audit also
gained an enforced accepted-classification table for every remaining shadcn
`Card`, `Alert`, input frame and scoped native layout marker across Host Web
and official Soul App web. A focused script test locks this behavior by
verifying that `session-detail.tsx` no longer appears as ambiguous raw native
class usage and that its artifact rail is classified as scoped layout. Any
future framed surface or scoped/slotless native class pocket without an
explicit classification now blocks `check-web-ui-components --all --audit`.

**Checkpoint Update 2026-05-20 13:56:** The long-running migration was checked
for loop risk after the user noticed many Playwright tabs and the
`apps/web/src/worker/souls/hr` directory. The active Playwright MCP session was
reset to a single target tab before browser verification. The HR workbench path
was traced to the pre-existing `0119b0f4` specialized renderer commit, not to a
new shadcn-migration hallucination. At that checkpoint it remained a
completion-sensitive boundary debt because the domain UI still lived under Host
Web; the later boundary slice removed the Host renderer tree and converted the
audits to a no-regression gate.

The HR configure action status was also moved from a raw `ItemDescription`
wrapper to shadcn `Alert` / `AlertDescription`, with a focused Worker Studio
test and audit classification covering the two success/error callout branches.
Playwright on `localhost:5173` confirmed the live Configure HR result renders
as `data-slot="alert"` with `role="status"`, `data-slot="alert-description"`,
8px radius, 1px generated alert border and no horizontal overflow. This remains
a progress checkpoint, not full goal completion.

**Checkpoint Update 2026-05-20 14:38:** The Host/Soul boundary debt is now
being migrated through an app-owned route surface instead of further polishing
the Host-embedded HR renderer. HR `ui.routes[hr-home]` now declares a
`sandboxed-frame` surface at `/frames/routes/hr-home`, and the HR mounted
service renders `HrHomeRouteSurface` from `apps/aiworker-hr/product/web` using
direct `@zonease/aiworker-ui` shadcn `Card`, `Badge`, `ItemGroup` and `Item`
composition. Worker Studio now prefers any selected Soul App route with
`renderer: "sandboxed-frame"` over the legacy specialized Host renderer.

Runtime verification required a state correction rather than more screenshot
iteration: the operator-running 5173 page had no reachable 9217 daemon, and the
local registry had stale official app manifests from the old
`ui.workbench.settings` contract. Reinstalling/enabling current HR and QA
manifests in `~/.aiworker-dev` cleared the stale key; `bun run dev:host`
started the daemon, and `/api/local/apps` now reports HR as
`sandboxed-frame:/frames/routes/hr-home` with no `settings` key. Playwright on
`localhost:5173/workers/shadcn-hr-worker/workspaces/b244dd6c-414e-4e4b-9945-1ba3c4c1796f`
confirmed a single `iframe[data-slot="soul-app-mounted-frame"]`, frame URL
`/api/local/apps/aiworker-hr/frames/routes/hr-home`, `hostEmbeddedHrCount=0`,
and iframe content titled `HR People Workbench` with one shadcn Card and one
shadcn ItemGroup.

Follow-up boundary slice: the historical `apps/web/src/worker/souls` tree has
now been removed from Host Web, `WorkerStudio` no longer imports a specialized
Soul renderer registry, and the shared built-in workbench catalog is empty. The
Soul App boundary and Web UI completion audits now pass for the Host-embedded
renderer dimension and reject any future Host Web Soul-specific renderer path.

Follow-up HR app-owned route slice: `apps/aiworker-hr/product/web/routes/hr-route.tsx`
now carries the first profile-first mounted workbench structure inside the HR
app boundary. It composes shadcn `Card`, `Item`, `Badge`, and `Button`
primitives for People Profiles, selected profile summary, readiness, and next
action instead of moving HR semantics back into Host Web. Focused HR proof tests
lock that the route contains shadcn slots and stays off the legacy component
package.

Follow-up mounted-frame theme/style slice: the browser pass found that the HR
iframe had received dark mode text but not the app-owned shadcn stylesheet. The
root cause was two-part: Worker Studio did not pass the resolved Host theme into
mounted surface resolution, and mounted app frames linked the standalone
`/styles.css` path instead of the Host proxy path. Worker Studio now requests
mounted frames with `?theme=dark|light`, HR/QA mounted adapters apply
`class="dark"` and `color-scheme` on the frame root, and mounted frames load
`/api/local/apps/<app-id>/styles.css` while standalone HTML keeps `/styles.css`.
Browser verification on `localhost:5173` confirms the HR mobile dark iframe
loads `http://localhost:5173/api/local/apps/aiworker-hr/styles.css`, uses
`"Oxanium Variable"`, applies dark card tokens, and renders 8px shadcn card
radii.

Follow-up status-feedback slice: protocol and runtime feedback such as
"HR configuration is owned by the HR app." must be shadcn feedback chrome
instead of plain wrapper text. A red/green sweep extended that rule beyond the
named HR case: Worker Studio startup load errors, Settings engine test feedback,
Settings Soul App security-block errors, and artifact preview file-read errors
now render through shadcn `Alert` / `AlertDescription`. The Web UI audit
classification now accounts for Settings Alert callouts explicitly, so future
feedback surfaces cannot sneak in as unclassified framed chrome.

Follow-up shell/composer visual check: desktop browser metrics on
`localhost:5173` confirm the Host left panel is not currently collapsed by the
shadcn migration. The sidebar body is fixed-width and full-height, Host primary
actions are `flex-shrink:0`, the worker list group is `flex-grow:1` with
scrolling content, and the settings footer is `flex-shrink:0` with a 16px
bottom inset. The session composer check confirms no horizontal overflow,
28px action buttons, and compact 14px / 10px / 14px icon rendering. Evidence
screenshots: `output/host-sidebar-workspace-desktop-current.png` and
`output/session-composer-desktop-dark-current-after-theme-fix.png`.

**Goal Completion Gate:** Before this migration goal can be marked complete,
run a full repository scan for remaining custom UI styles/components across
Host Web and official Soul App web surfaces. Classify every remaining custom
style/component as either:

- **accepted domain-owned UI**: justified by Soul App/domain/session behavior
  that shadcn primitives do not replace directly;
- **accepted temporary migration debt**: documented with the next migration
  owner/slice;
- **blocking omission**: must be migrated before goal completion.

Smoke tests are insufficient for goal completion. The final completion claim
requires this scan plus Playwright screenshot evidence for desktop/mobile and
the relevant Soul App surfaces. Any visible style collapse, unreasonable
spacing, overflow, or legacy large-radius override blocks completion until it is
fixed or explicitly classified as accepted domain-owned UI.

**Tech Stack:** Bun, shadcn CLI, React 19, Vite, Tailwind CSS v4, Vitest, happy-dom.

---

## File Structure

- Modify: `packages/ui/src/components/*` - official shadcn generated components.
- Modify: `packages/ui/src/hooks/*` - official shadcn generated hooks, if any.
- Modify: `packages/ui/package.json` and `bun.lock` - dependencies added by shadcn CLI.
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx` - first Host Web direct shadcn Button adoption.
- Modify: `apps/web/src/features/local-workspace/components/creation-dialogs.tsx` - first creation dialog direct shadcn Button adoption.
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx` - red tests proving visible app buttons now use shadcn metadata.
- Modify: `scripts/web-quality.ts` - Worker Studio critical CSS sentinel list must follow the shadcn Settings shell migration.
- Read only: `packages/component/src/primitives/*` - reference for current behavior and class names.

### Task 1: Full Import Shadcn Components

**Files:**
- Modify: `packages/ui/src/components/*`
- Modify: `packages/ui/src/hooks/*`
- Modify: `packages/ui/package.json`
- Modify: `bun.lock`

- [x] **Step 1: Preview official CLI full import**

Run:

```bash
bunx --bun shadcn@latest add --all -c packages/ui --dry-run
```

Expected: CLI reports the files and dependencies it would add through the existing `packages/ui/components.json` configuration, including `src/hooks/use-mobile.ts` inside `packages/ui`.

- [x] **Step 2: Run official CLI full import**

Run:

```bash
bunx --bun shadcn@latest add --all -c packages/ui -y
```

Expected: generated components and hooks land in `packages/ui/src/components` and `packages/ui/src/hooks`, not in `apps/web/src`.

- [x] **Step 3: Confirm shadcn project resolution**

Run:

```bash
bunx --bun shadcn@latest info -c apps/web --json
```

Expected: `resolvedPaths.ui` points to `packages/ui/src/components` and `components` lists more than `button`.

- [x] **Step 4: Verify generated UI package**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
bun run --filter '@zonease/aiworker-ui' test
```

Expected: both commands pass. If generated files expose lint-only Fast Refresh constants, fix only the generated file export lint issue without changing shadcn behavior.

### Task 2: Add Red Tests For Direct App Button Adoption

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Add expectations for settings action buttons**

In the existing `opens settings, rescans/tests engines, and autosaves settings changes` test, after the existing class checks for `testButton` and `rescanButton`, add:

```ts
expect(testButton.getAttribute('data-slot')).toBe('button')
expect(testButton.getAttribute('data-variant')).toBe('ghost')
expect(rescanButton.getAttribute('data-slot')).toBe('button')
expect(rescanButton.getAttribute('data-variant')).toBe('ghost')
```

- [x] **Step 2: Add expectations for creation dialog primary buttons**

In the `creates a worker from the compact worker list dialog` test, after `const dialog = screen.getByRole('dialog', { name: 'Create worker' })`, add:

```ts
const createWorkerButton = within(dialog).getByRole('button', { name: 'Create worker' })
expect(createWorkerButton.getAttribute('data-slot')).toBe('button')
expect(createWorkerButton.getAttribute('data-variant')).toBe('default')
```

In the `creates a workspace session turn with selected Soul worker and skill metadata` test, after `const dialog = screen.getByRole('dialog', { name: 'Create workspace' })`, add:

```ts
const createWorkspaceButton = within(dialog).getByRole('button', { name: 'Create workspace' })
expect(createWorkspaceButton.getAttribute('data-slot')).toBe('button')
expect(createWorkspaceButton.getAttribute('data-variant')).toBe('default')
```

- [x] **Step 3: Verify red**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because the current app buttons still come from `@zonease/aiworker-component` and do not expose shadcn `data-slot` / `data-variant`.

### Task 3: Migrate First App Buttons To `packages/ui`

**Files:**
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx`
- Modify: `apps/web/src/features/local-workspace/components/creation-dialogs.tsx`

- [x] **Step 1: Update settings dialog imports**

Change the settings import block from:

```ts
import { ActionCard, Button, Field, NavItemButton, SegmentedControl, SettingsShell } from '@zonease/aiworker-component'
```

to:

```ts
import { ActionCard, Field, NavItemButton, SegmentedControl, SettingsShell } from '@zonease/aiworker-component'
import { Button } from '@zonease/aiworker-ui/components/button'
```

Then update component button props:

```tsx
<Button variant="ghost" size="icon" className="settings-close" onClick={onClose} aria-label={copy.accessibility.closeSettings} title={copy.accessibility.closeSettings}>
  <X size={16} strokeWidth={2} />
</Button>
```

Keep action buttons as `variant="ghost"` and keep existing class names:

```tsx
<Button variant="ghost" className="settings-action-button settings-test-btn" onClick={() => onTest(settings.engineId)}>
  <Gauge size={13} />
  <span>{settingsCopy.engine.test}</span>
</Button>
```

- [x] **Step 2: Update creation dialog imports**

Change:

```ts
import { Button, CreationDialog, Field, FieldGroup, StudioSelect } from '@zonease/aiworker-component'
```

to:

```ts
import { CreationDialog, Field, FieldGroup, StudioSelect } from '@zonease/aiworker-component'
import { Button } from '@zonease/aiworker-ui/components/button'
```

Then map existing variants:

```tsx
<Button variant="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</Button>
<Button type="submit" disabled={!workerName.trim() || availableSouls.length === 0}>
  <Plus aria-hidden="true" size={13} />
  <span>{copy.workspace.createWorker}</span>
</Button>
```

And:

```tsx
<Button variant="ghost" onClick={onClose}>{copy.accessibility.closeDialog}</Button>
<Button data-testid="create-project" type="submit" disabled={!workspaceTitle.trim() || submitting}>
  <Plus aria-hidden="true" size={13} />
  <span>{copy.workspace.createWorkspace}</span>
</Button>
```

- [x] **Step 3: Verify green**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

### Task 4: Focused Type, UI, And Browser Verification

**Files:**
- No planned code changes.

- [x] **Step 1: Run focused package checks**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
bun run --filter '@zonease/aiworker-ui' test
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' test
```

Expected: all pass.

- [x] **Step 2: Run style governance check**

Run:

```bash
bun run ui:check
```

Expected: pass.

- [x] **Step 3: Browser check on existing dev server**

Open `http://localhost:5173/`, verify:

- HR People Profiles still renders.
- Platform Settings opens.
- Test and Rescan buttons are visible and clickable.
- Create worker / workspace dialogs still render and submit buttons retain their labels.
- No browser console errors are emitted.

### Task 5: Record First Migration Slice

**Files:**
- Modify: `docs/changelog.md`

- [x] **Step 1: Add a concise changelog entry**

Add an entry describing:

- shadcn full import into `packages/ui`
- direct `apps/web` Button adoption for settings and creation dialogs
- verification commands run

- [x] **Step 2: Final verification**

Run:

```bash
bun run lint
bun run check
git diff --check
```

Expected: all pass.

### Task 6: Migrate Creation Dialog Family To Shadcn Primitives

**Files:**
- Modify: `apps/web/src/features/local-workspace/components/creation-dialogs.tsx`
- Modify: `apps/web/src/styles/creation.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `scripts/check-web-ui-components.ts`
- Modify: `docs/changelog.md`

- [x] **Step 1: Add shadcn-first RED assertions**

Extend Worker Studio creation dialog tests so create-worker/create-workspace dialogs must expose shadcn `data-slot` metadata for `dialog-content`, `select-trigger` and `input`, and must no longer depend on `.studio-select` or `.newproj-name`.

- [x] **Step 2: Verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL before migration because the dialogs still use legacy component primitives.

- [x] **Step 3: Replace legacy dialog primitives**

Replace `CreationDialog`, `StudioSelect` and raw `<input>` usage with direct imports from `@zonease/aiworker-ui/components/dialog`, `field`, `input`, `select` and `button`. Keep the dialog shell local only as app composition, not as a new shared component.

- [x] **Step 4: Wire Tailwind v4 package source detection**

Add `@source` directives to `packages/ui/src/styles/globals.css` so apps importing `@zonease/aiworker-ui/styles.css` generate utilities used by package-owned shadcn components.

- [x] **Step 5: Update UI governance for the new shared package**

Update `scripts/check-web-ui-components.ts` so `@zonease/aiworker-ui` counts as a shared primitive package, not an app-local bypass.

- [x] **Step 6: Verify checkpoint**

Run focused tests, Web/UI package checks, Web build, browser smoke on `localhost:5173`, `bun run lint`, `bun run check`, `git diff --check` and code-review-graph.

### Task 7: Migrate Platform Settings Shell To Shadcn Dialog And Tabs

**Files:**
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx`
- Modify: `apps/web/src/styles/settings.css`
- Modify: `apps/web/src/styles/responsive.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `packages/ui/src/components/tabs.tsx`
- Modify: `scripts/web-quality.ts`
- Modify: `docs/changelog.md`

- [x] **Step 1: Add shadcn shell RED assertions**

Extend the Worker Studio settings test so Platform Settings must expose shadcn `DialogContent`, `TabsList`, `TabsTrigger` and `TabsContent` `data-slot` metadata, no longer render `.modal-backdrop`, and use a vertical tablist.

- [x] **Step 2: Verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL before migration because the old settings shell is a custom modal with button navigation and no shadcn `data-slot` metadata.

- [x] **Step 3: Replace settings shell primitives**

Replace the old `SettingsShell` / `NavItemButton` / custom modal shell with direct shadcn `Dialog`, `Tabs`, `ScrollArea` and `Button` imports from `@zonease/aiworker-ui`. Keep section internals such as `ActionCard`, `Field` and `SegmentedControl` as explicit next migration targets.

- [x] **Step 4: Fix generated Tabs orientation pass-through**

Patch `packages/ui/src/components/tabs.tsx` so `orientation` is passed to `TabsPrimitive.Root`, preserving the CLI-generated component shape while making vertical settings tabs accessible.

- [x] **Step 5: Retire stale settings shell CSS sentinels**

Remove settings shell selectors owned by the old modal/sidebar implementation and update `scripts/web-quality.ts` so critical CSS checks follow `.settings-chrome` / `.settings-section` instead of `.modal-settings` / `.settings-sidebar`.

- [x] **Step 6: Verify checkpoint**

Run focused Worker Studio tests, Web/UI package checks, Web build, browser smoke on `localhost:5173`, `bun run lint`, `bun run check`, `git diff --check` and code-review-graph.

### Task 8: Settings Internals And Legacy Style Containment

**Files:**
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx`
- Modify: `apps/web/src/styles/index.css`
- Modify: `apps/web/src/styles/settings.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `scripts/check-web-ui-components.ts`
- Modify: `apps/aiworker-hr/product/web/widgets/people-widget.tsx`
- Modify: `apps/aiworker-hr/product/web/panels/profile-panel.tsx`
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`
- Modify: `apps/aiworker-hr/package.json`

- [x] **Step 1: Add shadcn-first RED assertions for settings internals**

Worker Studio tests now require Settings internals to expose shadcn
`ToggleGroup`, `Button`, `Card`, `Badge`, `Switch` and `Input` metadata and to
reject the legacy `.settings-action-button` path.

- [x] **Step 2: Replace remaining Settings internals**

Settings execution mode, engine cards, Soul App diagnostics, connector toggles,
MCP rows, external MCP fields, language and appearance selectors now compose
directly from `@zonease/aiworker-ui` primitives instead of legacy component
primitives.

- [x] **Step 3: Contain legacy component stylesheet at the app boundary**

Host Web imports `@zonease/aiworker-component/styles.css` as `layer(base)` so
legacy global control selectors no longer override shadcn `data-slot`
utilities. `ui:check` now guards this app-side compatibility import.

- [x] **Step 4: Migrate HR product web proof surfaces**

The HR Soul App product web proof widget and panel now render shadcn `Card` /
`Badge` composition directly from `@zonease/aiworker-ui`; the HR app no longer
declares `@zonease/aiworker-component` as a dependency.

- [x] **Step 5: Verify checkpoint with tests and screenshots**

Run focused Worker Studio and HR tests/typechecks, `bun run ui:check`, and
Playwright desktop/mobile screenshots for Platform Settings tabs. The
Playwright radius check must report `legacyPillOnShadcn: 0`.

### Task 9: Full Migration Backlog

**Files:** Host Web and official Soul App web surfaces.

- [ ] **Session/chat/composer:** treat as a dedicated product slice; prefer shadcn primitives for shell controls while preserving the domain-specific session timeline/composer behavior.
- [x] **Preset icon-language checkpoint:** Host Web visible icons now follow `packages/ui` shadcn `iconLibrary=hugeicons`; `lucide-react` is removed from `apps/web` and guarded by `ui:check`.
- [x] **ClassName-constant audit checkpoint:** `ui:check --all --audit` now scans `*ClassName` string constants; `MarkdownPreview` prose typography is explicitly classified as content residue rather than hidden custom styling.
- [x] **Host shell controls checkpoint:** migrated visible Host topbar, worker rail, generic mounted workbench action/search controls, HR mounted profile chrome, and session chat header icon controls to shadcn `Button` / `InputGroup`.
- [ ] **Host shell remaining controls:** continue migrating worker list cards, avatar/workspace chips, status pills and any route-specific list controls where shadcn primitives can replace local or legacy styling.
- [x] **Local workspace cards checkpoint:** migrated `WorkspaceCard`, `WorkerIdentityBlock`, `SessionProgressPanel` and HR profile list cards away from legacy/raw primitives to shadcn `Button`, `Card`, `Badge` and `Progress`.
- [x] **Official Soul App web proof checkpoint:** HR product web proof surfaces import `@zonease/aiworker-ui` directly for primitives and have no app-local className styling; QA product web currently exposes descriptor constants without rendered UI primitives, so it has no legacy component import or custom style surface in this checkpoint.
- [ ] **Package retirement:** after consumers move off `packages/component`, retire the package or reduce it to a compatibility stub only if a concrete runtime constraint still requires it; do not preserve it as the default shared business-pattern layer.
- [x] **Class-dimension self-check checkpoint:** expanded the active audit to report native slotless structures, explicit border/radius/font/arbitrary utilities, custom semantic class tokens, and shadcn style/base color/radius/font/primary/chart tokens together before any completion claim.
- [ ] **Thin-style blocker pass:** continue reducing `studio-shell.tsx`, `settings-dialog.tsx`, `session-composer.tsx`, `session-detail.tsx`, `profile-tools-panel.tsx`, local workspace surfaces, message flow, session chat/timeline, profile details and HR people workbench until residual custom classes are either replaced by shadcn slots or explicitly justified.
- [x] **Light/dark and preset-color checkpoint:** verified light and dark views on `localhost:5173`; runtime metrics show active shadcn primary/background/foreground/chart tokens, 0 slotless visible borders, 0 large non-badge radius, 0 app-specific runtime class prefixes and Oxanium as the only visible font family. This is a checkpoint, not final completion.
- [x] **Internal ScrollArea checkpoint:** moved HR profile list/detail and session timeline/message wrappers toward shadcn `ScrollArea`, `ItemGroup` and `ItemContent`, and removed raw form layout from creation dialogs by letting `FieldGroup` own form spacing.
- [x] **Top-level layout correction checkpoint:** browser verification caught that Radix `ScrollArea` cannot directly own the HR workbench multi-column flex layout because its internal viewport/content wrapper breaks the visible layout. The top HR layout is now a shadcn `ItemGroup` with `data-host-slot` for business identification, while scrolling remains inside shadcn-owned column/detail surfaces.
- [x] **Primitive API cleanup checkpoint:** moved app-side `ItemTitle` font scale,
  `ItemDescription` destructive tone and Badge label truncation into
  `packages/ui` shadcn primitives (`ItemTitle size`, `ItemDescription tone`,
  `BadgeLabel`) so business files no longer carry those visual class tokens.
- [x] **Remaining raw-wrapper review checkpoint:** the Host shell main wrapper is
  now a semantic `ItemGroup asChild` region and the HR source-label span is now
  `BadgeLabel`; the only accepted raw-wrapper residue in this slice is
  markdown artifact content rendering, where prose/body semantics remain local
  while shadcn owns `ItemTitle` headings and `Table` structure.
- [x] **Shell flex, composer and icon-size correction checkpoint:** fixed the
  Host shell sidebar regression by letting `SidebarContent` own the top-level
  flex column instead of wrapping the whole rail in Radix `ScrollArea`; bottom
  settings actions are `shrink-0` while the worker list consumes remaining
  height. The HR profile tools panel now gives recent sessions the scrollable
  remaining space and keeps the panel composer fixed-size at the bottom. The
  shadcn primitive icon selectors now use `[class*=size-]` without escaped
  quotes so Tailwind emits runtime selectors that actually size nested SVGs;
  `ui:check` guards against regressions.
- [x] **Settings router and interaction-state checkpoint:** fixed the Settings
  router list back to shadcn's vertical `h-fit` content-height behavior with a
  `max-h-full` overflow guard, moved pointer cursor handling into the shadcn global
  base rule, removed `Button` visual `aria-pressed` styling so hover and active
  state no longer collapse into the same class path, and rendered engine brand
  logos as current-color `ItemMedia variant="icon"` mask glyphs without avatar
  or image-frame outline.
- [x] **Sidebar token interaction checkpoint:** moved Host rail primary actions,
  worker options and the footer settings row onto shadcn `SidebarMenuButton`,
  so hover/active styles use `sidebar-accent` / `data-active` instead of
  generic button `muted` state. Settings router height is now content-height on
  desktop and bounded by the dialog with overflow only when needed. Browser
  verification confirmed Host top bar and left rail use matching sidebar token
  values, and engine glyph containers have no border, radius or shadow.
- [x] **Settings router height correction checkpoint:** browser inspection
  caught that the previous fixed `md:h-80` / `md:max-h-80` cap overrode the
  generated shadcn vertical Tabs `h-fit` behavior and created a needless 320px
  scroll region inside a much taller dialog. The router now uses desktop
  content-height (`md:h-fit`) plus `md:max-h-full`, preserving overflow only
  when natural tab height exceeds the available dialog content area. Playwright
  on `localhost:5173` confirms a 476px tablist inside a 992px dialog with
  `scrollHeight === clientHeight`, no fixed-height class residue and no
  horizontal overflow.
- [x] **Settings framed-row thinning checkpoint:** connector rows and the
  pending Local MCP row moved from `Card` / `CardContent` shells to shadcn
  `Item variant="muted"` rows around `Field` and `Switch`. Soul App install
  entries remain `Card` because they are repeated installed app objects with
  manifest metadata and lifecycle actions rather than simple setting rows.
- [x] **HR section patch icon normalization checkpoint:** section-level
  added/changed review actions now render Hugeicons `Add01Icon` / `Edit02Icon`
  with `data-icon="inline-start"` inside shadcn `Button size="icon-sm"` instead
  of raw `+` / `~` text, aligning their runtime sizing with the other shadcn
  icon buttons.
- [x] **Generic mounted workbench action/search checkpoint:** protocol primary
  actions now use shadcn `Button variant="default"`, secondary actions use
  `secondary`, and search result rows render as clickable
  `Item variant="muted"` instead of outline Buttons. This keeps the generic
  mounted Soul App path on shadcn semantics without reintroducing list borders.
- [x] **Generic empty-workspace composer spacing checkpoint:** browser
  inspection of the QA workspace fallback showed the composer vertically
  centered too low inside a large blank canvas. The empty-workspace content now
  starts near the top of the available surface while keeping the composer as
  the primary work area. Playwright on `localhost:5173` confirms the composer
  heading starts 40px below the content area with no horizontal overflow.
- [x] **Host chrome and composer InputGroup checkpoint:** aligned HostTopBar
  icon buttons by rendering them as shadcn `SidebarMenuButton` controls, so
  `sidebar-accent` hover/active state is generated by the sidebar primitive
  while pointer cursor stays owned by the shadcn global base rule. Session
  composer action buttons now render through `InputGroupButton`, and the
  attachment count is an inline shadcn `Badge` instead of an absolute
  positioned custom badge. Browser verification on `localhost:5173` confirmed
  composer actions live inside `input-group-addon`, no horizontal overflow is
  present, and disabled submit correctly keeps default cursor.
- [x] **Session framed-surface thinning checkpoint:** changed session timeline
  errors from Card to Alert, changed artifact rail Request review from outline
  to default Button, and changed the chat Latest jump action from outline to
  secondary. UI audit confirms `session-detail` no longer has outline buttons
  and `session-chat` is out of the framed-surface leaderboard.
- [x] **Composer attachment chip checkpoint:** replaced session composer
  attachment `Card` shells with shadcn `Item variant="muted"` rows inside the
  `InputGroupAddon`; focused tests prove attachment rows are no longer nested
  in a Card, and UI audit reports `session-composer` as `card=0`.
- [x] **HR reading-room action checkpoint:** changed the profile patch-ready
  Alert action from outline to default shadcn Button; UI audit no longer lists
  `profile-reading-room.tsx` in the framed-surface leaderboard, and Playwright
  confirms no overflow or large-radius regression.
- [x] **HR profile tools recent-session checkpoint:** changed recent session
  rows from outline Buttons to clickable shadcn `Item variant="muted"` rows;
  focused tests assert the Item slot and Playwright confirms pointer cursor,
  compact radius and no overflow.
- [x] **Host workspace Card thinning checkpoint:** removed avoidable Card shells
  from Session detail Memory candidates, the first-run sidebar note and the
  worker capability template summary. These now compose shadcn `ItemGroup` /
  `Item variant="muted"` while product/object cards remain for worker identity,
  installed Soul App cards, artifact preview and review panels. Focused tests
  and Playwright on `localhost:5173` confirm the converted headings are not
  nested in Cards and have no horizontal overflow.
- [x] **HR patch-review status marker checkpoint:** changed the patch-review
  changed/added chips from raw `+` / `~` text to Hugeicons `Add01Icon` /
  `Edit02Icon` inside shadcn `Badge` with `data-icon="inline-start"` and
  status labels. Focused tests block raw-symbol regressions and Playwright
  confirms 20px badges with 10px icons, no horizontal overflow and active
  light/dark token rendering.
- [x] **Composer image attachment checkpoint:** changed image attachment
  previews from outline Button thumbnail frames to ghost shadcn Button actions
  with `ItemMedia variant="image"` thumbnails. Browser verification caught and
  fixed an over-compact 24px thumbnail; the live session composer now renders a
  56px thumbnail with no Card ancestor, no arbitrary class audit finding and no
  horizontal overflow.
- [x] **Official Soul App standalone CSS checkpoint:** HR and QA product web now
  build app-local Tailwind v4 CSS from `@zonease/aiworker-ui/styles.css` via the
  official Tailwind CLI before `build`, `dev`, `serve` and `smoke`; standalone
  adapter HTML loads `/styles.css`, while Host-mounted frames load
  `/api/local/apps/<app-id>/styles.css` through the Host proxy and serve the
  Oxanium font assets required by the active shadcn preset. Browser verification
  confirms HR standalone and mounted shadcn Card styles apply at runtime.
- [x] **Framed-surface classification checkpoint:** `check-web-ui-components
  --all --audit` now enforces accepted classifications for remaining shadcn
  Card/Alert/input frames and scoped native layout markers, while keeping
  slotless native class usage at zero.
- [x] **Host/Soul renderer boundary checkpoint:** `apps/web/src/worker/souls/hr`
  was traced to pre-existing commit `0119b0f4`, not this shadcn migration
  session. The later boundary slice removed the entire `apps/web/src/worker/souls`
  Host renderer tree, removed Worker Studio's specialized renderer registry
  path, and converted the UI and Soul App boundary completion audits to a
  no-regression gate for future Host-embedded Soul renderer paths.
- [x] **HR app-owned mounted route checkpoint:** HR now exposes `hr-home`
  through the HR app mounted service as a `sandboxed-frame`, and Worker Studio
  prefers that app-owned route frame over the legacy Host-specialized HR
  renderer. Browser verification confirms the frame is rendered and
  `hr-people-workbench` is absent on that route. Later focused verification
  confirms the old Host renderer directory is removed and both completion
  audits pass for the boundary dimension. The HR product route now also carries
  a profile-first app-owned People Profiles / Current Profile Summary surface
  using shadcn Card, Item, Badge, and Button primitives, with a focused proof
  test preventing the surface from drifting back to `@zonease/aiworker-component`
  or old Host HR layout classes.
- [x] **Raw native control audit checkpoint:** `check-web-ui-components
  --all --audit` now classifies remaining raw native controls separately from
  shadcn-framed surfaces. The only accepted cases are shadcn `asChild` button
  trigger targets and visually-hidden file inputs behind SessionComposer
  attachment actions; future unclassified raw controls block the audit.
- [x] **Mounted frame theme/style checkpoint:** Worker Studio passes the resolved
  Host theme into mounted frame resolution, and HR/QA mounted frames apply the
  theme root plus app-owned stylesheet through `/api/local/apps/<app-id>/styles.css`.
  The live HR mobile dark screenshot verifies dark tokens, Oxanium font and
  shadcn card radius inside the iframe.
- [x] **Host shell/composer sanity checkpoint:** desktop browser metrics confirm
  the Host left panel keeps a fixed footer and a growable worker list, while the
  session composer has no horizontal overflow and keeps compact shadcn action
  button/icon dimensions.
- [x] **Feedback surface checkpoint:** Worker Studio and Settings status/error
  messages that are user-visible callouts now use shadcn Alert /
  AlertDescription, with red/green Web tests covering startup failures, engine
  test feedback, security-block feedback and artifact preview read failures.
- [ ] **Next thin-style pass:** continue through the session/chat/composer slice
  and any remaining framed surfaces before claiming full migration completion;
  smoke tests alone are not sufficient.
