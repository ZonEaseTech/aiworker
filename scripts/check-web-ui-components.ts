#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface Issue {
  file: string
  message: string
}

interface ProductWebSurfaceEntry {
  file: string
  status: 'legacy' | 'metadata-only' | 'shadcn' | 'unclassified'
}

interface SoulAppWebAdapterEntry {
  file: string
  status: 'metadata-only' | 'raw-html' | 'shadcn-ssr'
}

interface ClassDensityEntry {
  classNameCount: number
  file: string
  totalTokens: number
  visualTokens: number
}

interface CustomClassEntry {
  file: string
  tokens: string[]
}

interface ClassDimensionEntry {
  arbitraryTokens: number
  borderTokens: number
  classNameCount: number
  darkTokens: number
  file: string
  fontTokens: number
  largeRadiusTokens: number
  nativeClassNameCount: number
  radiusTokens: number
  slotlessNativeClassNameCount: number
  totalTokens: number
  zIndexTokens: number
}

interface ResidualVisualUtilityEntry {
  count: number
  file: string
  token: string
}

interface RawNativeControlEntry {
  asChildButtonCount: number
  file: string
  hiddenFileInputCount: number
  rawButtonCount: number
  rawInputCount: number
}

interface SurfaceCompositionEntry {
  alertCount: number
  cardCount: number
  file: string
  framedSurfaceCount: number
  inputFrameCount: number
  outlineButtonCount: number
  outlineItemCount: number
  scopedNativeClassNameCount: number
  slotlessNativeClassNameCount: number
}

interface ThemeTokenEntry {
  count: number
  file: string
  token: string
}

interface AcceptedResidualVisualUtility {
  file: string
  reason: string
  token: string
}

type SurfaceClassificationCategory
  = | 'alert'
    | 'card'
    | 'input-frame'
    | 'outline-button'
    | 'outline-item'
    | 'scoped-native-layout'
    | 'slotless-native-class'

type RawNativeControlCategory
  = | 'as-child-button'
    | 'hidden-file-input'
    | 'raw-button'
    | 'raw-input'

interface AcceptedSurfaceClassification {
  category: SurfaceClassificationCategory
  file: string
  reason: string
}

interface AcceptedRawNativeControlClassification {
  category: RawNativeControlCategory
  file: string
  reason: string
}

interface HostEmbeddedSoulRendererDebt {
  introducedIn: string
  next: string
  path: string
  reason: string
}

const repoRoot = process.cwd()
const completionAudit = process.argv.includes('--completion-audit')
const checkAll = completionAudit || process.argv.includes('--all')
const customAudit = completionAudit || checkAll || process.argv.includes('--audit')
const issues: Issue[] = []
const auditFindings: Issue[] = []
const shadcnPackageNames = ['@zonease/aiworker-ui']
const retiredPackageNames = ['@zonease/aiworker-component']
const shadcnAdapterImportPattern = /from\s+['"][^'"]*session\/session-composer['"]/
const disallowedIconLibraryPattern = /from\s+['"]lucide-react['"]/
const localOkPattern = /@aiworker-ui-local-ok:\s*\S.{10,}/
const appLocalUiClassPattern = /\b(?:button|btn|card|chip|pill|badge)\b/i
const appLocalUiAuditClassPattern = /\b(?:avatar|badge|button|btn|card|chat|chip|composer|detail|drawer|empty|field|footer|grid|header|icon|layout|list|modal|panel|pill|rail|section|select|sidebar|status|summary|surface|toolbar)\b/i
const appLocalClassPrefixPattern = /^(?:agent|artifact|design|entry|host|hr|message|modal|newproj|od|rail|section|session|settings|shell|soul|studio|subtab|toolbar|tool|worker|workspace|workbench)-/
const rawNativePrimitivePattern = /<\s*(?:button|details|dialog|input|select|summary|textarea)\b/i
const rawStyledNativeElementPattern = /<\s*(?:article|aside|div|footer|header|pre|section|span)\s[^>\n]*className\s*=\s*(?:\{[^}\n]*|["'][^"'\n]*)(?:bg-(?:card|input|muted|popover)|border(?:\s|-[a-z])|font-(?:bold|medium|mono|sans|semibold|serif)|ring-|rounded-|shadow-|text-\[[^\]\n]+\])/
const literalThemeOverridePattern = /\bdark:|#[0-9A-Fa-f]{3,8}|style=\{\{/
const scopedSlotAttributePattern = /\bdata-(?:slot|host-slot|hr-slot|profile-slot|section-slot|session-slot|settings-slot)\s*=/
const visualUtilityTokenPattern = /^(?:bg-|border(?:$|-)|decoration-|fill-|font-|outline-|ring-|rounded(?:$|-)|shadow(?:$|-)|stroke-|text-)/
const unscopedSharedSelectorPattern = /^(?:button\.(?:primary|secondary|ghost)|\.(?:icon-btn|modal|seg-control|studio-select|count-pill|status-event-pill|studio-pill|session-progress-card))\b/
const customVisualPropertyPattern = /^\s*(?:background|border(?:-(?:bottom|color|left|radius|right|top))?|box-shadow|color|font-family|font-size|padding)\s*:/

const hostEmbeddedSoulRendererDebts: HostEmbeddedSoulRendererDebt[] = []
const acceptedResidualVisualUtilities: AcceptedResidualVisualUtility[] = [
  {
    file: 'apps/web/src/features/session/markdown-preview.tsx',
    token: 'text-sm/relaxed',
    reason: 'markdown artifact body keeps compact prose line-height while shadcn Table and ScrollArea own structure',
  },
  {
    file: 'apps/web/src/features/session/markdown-preview.tsx',
    token: 'text-xs',
    reason: 'markdown artifact inline code needs a small prose scale; this remains content typography, not chrome styling',
  },
  {
    file: 'apps/web/src/worker/components/studio-shell.tsx',
    token: 'bg-background',
    reason: 'Host shell canvas must bind to the shadcn background surface token',
  },
  {
    file: 'apps/web/src/worker/components/studio-shell.tsx',
    token: 'bg-sidebar',
    reason: 'Host left rail must bind to the shadcn sidebar surface token',
  },
  {
    file: 'apps/web/src/worker/components/studio-shell.tsx',
    token: 'text-foreground',
    reason: 'Host shell canvas must use the shadcn foreground pair for bg-background',
  },
  {
    file: 'apps/web/src/worker/components/studio-shell.tsx',
    token: 'text-sidebar-foreground',
    reason: 'Host left rail must use the shadcn foreground pair for bg-sidebar',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    token: 'bg-sidebar',
    reason: 'HostTopBar is Host chrome and must visually align with the shadcn sidebar surface token',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    token: 'text-sidebar-foreground',
    reason: 'HostTopBar must use the shadcn foreground pair for bg-sidebar',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    token: 'bg-card',
    reason: 'HR create-profile dialog preview card binds to the shadcn card surface token',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    token: 'text-card-foreground',
    reason: 'HR create-profile dialog preview card uses the matching shadcn card foreground token',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    token: 'ring-1',
    reason: 'HR create-profile dialog preview card uses a subtle tokenized ring instead of a second Card frame',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    token: 'ring-foreground/10',
    reason: 'HR create-profile dialog preview card uses a low-contrast semantic foreground ring',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    token: 'rounded-lg',
    reason: 'HR create-profile dialog preview card keeps the shadcn radius scale inside the 8px product limit',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'bg-muted/20',
    reason: 'HR empty recent-session placeholder uses a muted semantic background inside the domain column',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'bg-transparent',
    reason: 'HR composer column card removes extra fill so the Host-mounted shell owns the page canvas',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'border',
    reason: 'HR empty recent-session placeholder uses a dashed semantic border to signal no object rows',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'border-border/60',
    reason: 'HR composer column divider uses a soft shadcn border token for the app-owned workbench split',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'border-border/70',
    reason: 'HR empty recent-session placeholder uses a slightly stronger semantic border than the column divider',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'border-dashed',
    reason: 'HR empty recent-session placeholder uses dashed border styling for empty-state affordance',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'border-l',
    reason: 'HR composer column uses a single left divider in the three-column workbench layout',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'ring-0',
    reason: 'HR composer column disables Card ring noise because the column divider owns separation',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'rounded-md',
    reason: 'HR empty recent-session placeholder stays on the shadcn radius scale',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'rounded-none',
    reason: 'HR composer column removes Card rounding when mounted as an edge-to-edge workbench pane',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    token: 'text-center',
    reason: 'HR empty recent-session placeholder centers its empty-state copy inside the muted block',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'bg-muted/20',
    reason: 'HR empty profile-list placeholder uses a muted semantic background inside the domain column',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'bg-transparent',
    reason: 'HR profile list column card removes extra fill so the Host-mounted shell owns the page canvas',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'border',
    reason: 'HR empty profile-list placeholder uses a dashed semantic border to signal no object rows',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'border-border/60',
    reason: 'HR profile list column divider uses a soft shadcn border token for the app-owned workbench split',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'border-border/70',
    reason: 'HR empty profile-list placeholder uses a slightly stronger semantic border than the column divider',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'border-dashed',
    reason: 'HR empty profile-list placeholder uses dashed border styling for empty-state affordance',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'border-r',
    reason: 'HR profile list column uses a single right divider in the three-column workbench layout',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'ring-0',
    reason: 'HR profile list column disables Card ring noise because the column divider owns separation',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'rounded-md',
    reason: 'HR empty profile-list placeholder stays on the shadcn radius scale',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'rounded-none',
    reason: 'HR profile list column removes Card rounding when mounted as an edge-to-edge workbench pane',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'text-center',
    reason: 'HR empty profile-list placeholder centers its empty-state copy inside the muted block',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'text-left',
    reason: 'HR profile row button text aligns with list scanning expectations',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    token: 'text-right',
    reason: 'HR profile row metadata aligns to the row edge for quick comparison',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    token: 'bg-background/45',
    reason: 'HR profile patch strip uses a subtle semantic background while preserving the selected profile surface',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    token: 'ring-0',
    reason: 'HR reading room disables Card ring noise because the selected profile surface owns the frame',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    token: 'rounded-none',
    reason: 'HR reading room removes Card rounding when mounted as the center workbench pane',
  },
]
const acceptedSurfaceClassifications: AcceptedSurfaceClassification[] = [
  {
    file: 'apps/aiworker-hr/product/web/panels/profile-panel.tsx',
    category: 'card',
    reason: 'official HR product panel is a rendered Soul App object surface and should expose shadcn Card metadata',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/surface.tsx',
    category: 'scoped-native-layout',
    reason: 'HR app-owned workbench uses one semantic section marker to place shadcn Card columns without Host-owned HR layout CSS',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    category: 'input-frame',
    reason: 'HR app-owned create-profile dialog and workbench filters use generated shadcn form frames',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    category: 'outline-button',
    reason: 'HR app-owned create-profile dialog uses an outline cancel action beside the primary submit action',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/app.tsx',
    category: 'scoped-native-layout',
    reason: 'HR app-owned workbench root uses a semantic layout marker while columns compose shadcn primitives',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    category: 'card',
    reason: 'HR composer column is a domain workbench pane framed by one shadcn Card',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    category: 'scoped-native-layout',
    reason: 'HR composer column uses scoped native layout markers for pane regions around shadcn content',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx',
    category: 'slotless-native-class',
    reason: 'HR recent-session list uses one non-visual overflow wrapper around shadcn ItemGroup rows',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    category: 'card',
    reason: 'HR profile list column is a domain workbench pane framed by one shadcn Card',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    category: 'input-frame',
    reason: 'HR profile list filter is a domain search field using a generated shadcn input frame',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    category: 'scoped-native-layout',
    reason: 'HR profile list column uses scoped native layout markers for the domain list region',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx',
    category: 'slotless-native-class',
    reason: 'HR profile list scroll wrapper is non-visual overflow layout around shadcn button rows',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    category: 'alert',
    reason: 'HR profile reading room uses shadcn Alert for profile patch status callouts',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    category: 'card',
    reason: 'HR profile reading room uses one shadcn Card for the selected profile surface',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx',
    category: 'scoped-native-layout',
    reason: 'HR profile reading room uses scoped native section markers for app-owned profile sections',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx',
    category: 'scoped-native-layout',
    reason: 'HR profile composer wrapper owns only the domain pane mount marker around the shared shadcn SessionComposer',
  },
  {
    file: 'apps/aiworker-hr/product/web/widgets/people-widget.tsx',
    category: 'card',
    reason: 'official HR product widget is a compact shadcn Card proof surface for standalone and mounted rendering',
  },
  {
    file: 'apps/aiworker-qa/product/web/panels/release-panel.tsx',
    category: 'card',
    reason: 'official QA product panel is a rendered Soul App object surface and should expose shadcn Card metadata',
  },
  {
    file: 'apps/aiworker-qa/product/web/widgets/release-widget.tsx',
    category: 'card',
    reason: 'official QA product widget is a compact shadcn Card proof surface for standalone and mounted rendering',
  },
  {
    file: 'apps/web/src/features/local-workspace/components/creation-dialogs.tsx',
    category: 'input-frame',
    reason: 'create-worker and create-workspace dialogs are form surfaces; generated Field/Input/Select controls own the frames',
  },
  {
    file: 'apps/web/src/features/local-workspace/components/worker-identity.tsx',
    category: 'card',
    reason: 'worker identity is a compact Host object summary surface and is intentionally a shadcn Card',
  },
  {
    file: 'apps/web/src/features/session/message-flow.tsx',
    category: 'card',
    reason: 'tool result output is an object payload surface; shadcn Card provides the single frame around streamed content',
  },
  {
    file: 'apps/web/src/features/session/markdown-preview.tsx',
    category: 'scoped-native-layout',
    reason: 'markdown renderer maps prose-only HTML nodes with data-slot markers while tables and headings use shadcn primitives',
  },
  {
    file: 'apps/web/src/features/session/session-timeline.tsx',
    category: 'alert',
    reason: 'turn error detail is a destructive status callout and should remain a shadcn Alert',
  },
  {
    file: 'apps/web/src/features/settings/components/settings-dialog.tsx',
    category: 'alert',
    reason: 'Settings engine test and Soul App security-block feedback are status callouts and should render through shadcn Alert',
  },
  {
    file: 'apps/web/src/features/settings/components/settings-dialog.tsx',
    category: 'card',
    reason: 'installed Soul App rows are app object cards inside Settings and use generated shadcn Card composition',
  },
  {
    file: 'apps/web/src/features/settings/components/settings-dialog.tsx',
    category: 'input-frame',
    reason: 'Settings BYOK and external-MCP fields are form controls; generated shadcn Input frames are expected',
  },
  {
    file: 'apps/web/src/worker/components/studio-shell.tsx',
    category: 'scoped-native-layout',
    reason: 'Host shell viewport uses semantic native layout with data-host-slot markers; shadcn primitives own inner chrome',
  },
  {
    file: 'apps/web/src/worker/session-chat.tsx',
    category: 'scoped-native-layout',
    reason: 'session chat pane uses a scoped native layout marker for the scroll/workbench region, not a visual frame',
  },
  {
    file: 'apps/web/src/worker/session-detail.tsx',
    category: 'alert',
    reason: 'artifact loading/error states are localized callouts and should remain shadcn Alert surfaces',
  },
  {
    file: 'apps/web/src/worker/session-detail.tsx',
    category: 'card',
    reason: 'artifact preview and review panels are right-rail object surfaces and keep one shadcn Card frame each',
  },
  {
    file: 'apps/web/src/worker/session-detail.tsx',
    category: 'scoped-native-layout',
    reason: 'artifact rail expanded/collapsed states are semantic aside layout markers with data-slot ownership',
  },
  {
    file: 'apps/web/src/worker/session-progress-panel.tsx',
    category: 'card',
    reason: 'session progress is a compact status object surface with a single shadcn Card frame',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    category: 'card',
    reason: 'Soul App install/enable rows are app object cards in Host workbench surfaces',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    category: 'alert',
    reason: 'Host-displayed Soul App action results are protocol status callouts and should use shadcn Alert instead of raw text wrappers',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    category: 'input-frame',
    reason: 'Host workbench search/filter controls use generated shadcn InputGroup frames',
  },
]
const acceptedRawNativeControlClassifications: AcceptedRawNativeControlClassification[] = [
  {
    file: 'apps/web/src/features/local-workspace/components/session-composer.tsx',
    category: 'hidden-file-input',
    reason: 'workspace session source-material picker is visually controlled by shadcn SessionComposer attachment actions',
  },
  {
    file: 'apps/web/src/features/session/session-timeline.tsx',
    category: 'as-child-button',
    reason: 'timeline disclosure triggers use a real button as the shadcn Item asChild target for keyboard semantics',
  },
  {
    file: 'apps/web/src/worker/session-detail.tsx',
    category: 'as-child-button',
    reason: 'detail disclosure triggers use a real button as the shadcn Item asChild target for keyboard semantics',
  },
  {
    file: 'apps/web/src/worker/session-turn-composer.tsx',
    category: 'hidden-file-input',
    reason: 'follow-up source-material picker is visually controlled by shadcn SessionComposer attachment actions',
  },
  {
    file: 'apps/web/src/worker/worker-studio.tsx',
    category: 'as-child-button',
    reason: 'workbench search result rows use shadcn Item asChild with real button semantics',
  },
  {
    file: 'apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx',
    category: 'hidden-file-input',
    reason: 'HR candidate-material picker is visually controlled by shared shadcn SessionComposer attachment actions',
  },
]
const classDensityEntries: ClassDensityEntry[] = []
const customClassEntries: CustomClassEntry[] = []
const classDimensionEntries: ClassDimensionEntry[] = []
const residualVisualUtilityEntries: ResidualVisualUtilityEntry[] = []
const rawNativeControlEntries: RawNativeControlEntry[] = []
const productWebSurfaceEntries: ProductWebSurfaceEntry[] = []
const soulAppWebAdapterEntries: SoulAppWebAdapterEntry[] = []
const surfaceCompositionEntries: SurfaceCompositionEntry[] = []
const themeTokenEntries: ThemeTokenEntry[] = []

main()

function main(): void {
  validateShadcnPrimitiveVisualContract()

  const changedFiles = checkAll ? listAllUiFiles() : listChangedFiles()
  for (const file of changedFiles) {
    if (!existsSync(abs(file)))
      continue
    if (isUiTsxFile(file))
      checkWebTsxFile(file)
    if (isUiCssFile(file))
      checkWebCssFile(file)
    if (customAudit && isOfficialSoulWebAdapterFile(file))
      recordSoulAppWebAdapterSurface(file, read(file))
  }

  if (issues.length > 0) {
    console.error('web UI component governance check failed:')
    for (const issue of issues)
      console.error(`- ${issue.file}: ${issue.message}`)
    console.error(`\nUse packages/ui shadcn primitives first. @zonease/aiworker-component has been retired and must not be reintroduced.`)
    process.exit(1)
  }

  if (customAudit && auditFindings.length > 0) {
    const shownFindings = auditFindings.slice(0, 80)
    console.log(`web UI custom style audit (${auditFindings.length} findings, informational):`)
    for (const issue of shownFindings)
      console.log(`- ${issue.file}: ${issue.message}`)
    if (auditFindings.length > shownFindings.length)
      console.log(`- ... ${auditFindings.length - shownFindings.length} more custom style findings`)
  }

  if (customAudit && classDensityEntries.length > 0) {
    const denseFiles = classDensityEntries
      .filter(entry => entry.visualTokens > 0)
      .sort((a, b) => b.visualTokens - a.visualTokens || b.totalTokens - a.totalTokens)
      .slice(0, 12)
    if (denseFiles.length > 0) {
      console.log('web UI class density audit (top visual utility files, informational):')
      for (const entry of denseFiles) {
        console.log(`- ${entry.file}: ${entry.visualTokens} visual tokens / ${entry.totalTokens} total tokens across ${entry.classNameCount} className values`)
      }
    }
  }

  if (customAudit && classDimensionEntries.length > 0) {
    const dimensionFiles = classDimensionEntries
      .sort((a, b) =>
        b.slotlessNativeClassNameCount - a.slotlessNativeClassNameCount
        || b.borderTokens - a.borderTokens
        || b.largeRadiusTokens - a.largeRadiusTokens
        || b.fontTokens - a.fontTokens
        || b.darkTokens - a.darkTokens
        || b.arbitraryTokens - a.arbitraryTokens
        || b.zIndexTokens - a.zIndexTokens
        || b.totalTokens - a.totalTokens
        || a.file.localeCompare(b.file),
      )
      .slice(0, 12)
    if (dimensionFiles.length > 0) {
      console.log('web UI class dimension audit (slotless native className, border/radius/font/dark/arbitrary tokens, informational):')
      for (const entry of dimensionFiles) {
        console.log(`- ${entry.file}: ${entry.classNameCount} className / ${entry.totalTokens} tokens; native=${entry.nativeClassNameCount} slotless=${entry.slotlessNativeClassNameCount}; border=${entry.borderTokens} radius=${entry.radiusTokens} largeRadius=${entry.largeRadiusTokens} font=${entry.fontTokens} dark=${entry.darkTokens} arbitrary=${entry.arbitraryTokens} z=${entry.zIndexTokens}`)
      }
    }
  }

  if (customAudit) {
    reportProductWebSurfaceCoverage()
    reportSoulAppWebAdapterCoverage()
    reportSurfaceComposition()
    reportSurfaceCompositionClassification()
    reportRawNativeControlClassification()
    reportHostEmbeddedSoulRendererDebt()
    reportThemeTokenUsage()
    reportResidualVisualUtilityClassification()

    const entries = customClassEntries
      .filter(entry => entry.tokens.length > 0)
      .sort((a, b) => b.tokens.length - a.tokens.length || a.file.localeCompare(b.file))
      .slice(0, 12)
    if (entries.length > 0) {
      console.log('web UI custom class token audit (app-local semantic class tokens, informational):')
      for (const entry of entries)
        console.log(`- ${entry.file}: ${entry.tokens.length} tokens (${sample(entry.tokens)})`)
    }
    else {
      console.log('web UI custom class token audit: 0 app-local semantic tokens found')
    }

    console.log(shadcnThemeAuditLine())
  }

  const scope = checkAll ? 'full tree' : `${changedFiles.length} changed files`
  console.log(`web UI component governance ok (${scope})`)
}

function checkWebTsxFile(file: string): void {
  if (isTestFile(file))
    return

  const content = read(file)
  if (disallowedIconLibraryPattern.test(content)) {
    issues.push({
      file,
      message: 'imports lucide-react even though the active shadcn preset uses hugeicons; use @hugeicons/core-free-icons with HugeiconsIcon to keep icon language aligned',
    })
  }

  if (customAudit)
    recordProductWebSurface(file, content)
  if (localOkPattern.test(content))
    return

  const importsShadcnPackage = shadcnPackageNames.some(packageName => content.includes(packageName)) || shadcnAdapterImportPattern.test(content)
  const importsRetiredPackage = retiredPackageNames.some(packageName => content.includes(packageName))
  const classNames = classNameValues(content)
  if (customAudit)
    recordClassDensity(file, classNames)
  if (customAudit)
    recordClassDimensions(file, content, classNames)
  if (customAudit)
    recordCustomClassTokens(file, classNames)
  if (customAudit)
    recordRawNativeControls(file, content)
  const localClassNames = customUiClassTokens(classNames, appLocalUiClassPattern)
  const auditClassNames = customUiClassTokens(classNames, appLocalUiAuditClassPattern)
  const usesRawNativePrimitive = rawNativePrimitivePattern.test(content)
  const rawStyledNativeElements = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => rawStyledNativeElementPattern.test(line))
  const literalThemeOverrides = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => literalThemeOverridePattern.test(line))

  if (customAudit && auditClassNames.length > 0) {
    auditFindings.push({
      file,
      message: `custom UI class names still present (${sample(auditClassNames)}); verify each is layout/domain-only or migrate to shadcn composition`,
    })
  }

  if (customAudit && rawStyledNativeElements.length > 0) {
    auditFindings.push({
      file,
      message: `raw native elements still carry visual utility classes (${sample(rawStyledNativeElements)}); prefer shadcn primitives, or classify as shell layout/domain content`,
    })
  }

  if (customAudit && literalThemeOverrides.length > 0) {
    auditFindings.push({
      file,
      message: `literal theme overrides still present (${sample(literalThemeOverrides)}); use preset tokens unless this is generated/third-party glue`,
    })
  }

  if (importsRetiredPackage) {
    issues.push({
      file,
      message: 'imports retired @zonease/aiworker-component; migrate to @zonease/aiworker-ui shadcn primitives',
    })
  }

  if (usesRawNativePrimitive && !importsShadcnPackage) {
    issues.push({
      file,
      message: `raw native UI changed without importing a shadcn UI package (${shadcnPackageNames.join(', ')}); use a shadcn primitive or add @aiworker-ui-local-ok with a reason`,
    })
  }

  if (localClassNames.length > 0 && !importsShadcnPackage) {
    issues.push({
      file,
      message: `changed local button/card/chip-style classes (${sample(localClassNames)}) without shadcn import or explicit local UI exception`,
    })
  }
}

function recordProductWebSurface(file: string, content: string): void {
  if (!isOfficialSoulProductWebFile(file))
    return

  const importsShadcnPackage = shadcnPackageNames.some(packageName => content.includes(packageName))
  const importsAppOwnedShadcnSurface = /from\s+['"][^'"]*people-workbench['"]/.test(content)
    || /from\s+['"]\.\/(?:app|surface)['"]/.test(content)
  const importsLegacyPackage = retiredPackageNames.some(packageName => content.includes(packageName))
  const status: ProductWebSurfaceEntry['status'] = importsLegacyPackage
    ? 'legacy'
    : importsShadcnPackage || importsAppOwnedShadcnSurface
      ? 'shadcn'
      : isMetadataOnlyProductWebFile(content)
        ? 'metadata-only'
        : 'unclassified'
  productWebSurfaceEntries.push({ file, status })
}

function reportProductWebSurfaceCoverage(): void {
  if (productWebSurfaceEntries.length === 0)
    return

  const counts = new Map<ProductWebSurfaceEntry['status'], number>()
  for (const entry of productWebSurfaceEntries)
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)

  console.log(`web UI official Soul App product web audit: shadcn=${counts.get('shadcn') ?? 0} metadataOnly=${counts.get('metadata-only') ?? 0} legacy=${counts.get('legacy') ?? 0} unclassified=${counts.get('unclassified') ?? 0}`)

  const unclassified = productWebSurfaceEntries.filter(entry => entry.status === 'legacy' || entry.status === 'unclassified')
  if (unclassified.length > 0) {
    console.error('web UI official Soul App product web audit has unclassified or legacy surfaces:')
    for (const entry of unclassified)
      console.error(`- ${entry.file}: ${entry.status}`)
    process.exit(1)
  }
}

function recordSoulAppWebAdapterSurface(file: string, content: string): void {
  if (!isOfficialSoulWebAdapterFile(file))
    return

  const emitsHtml = content.includes('<!doctype html>') || content.includes('<main>') || content.includes('<h1>') || content.includes('<p')
  const usesShadcnSsr = content.includes('renderToStaticMarkup') && content.includes('/product/web/')
  const status: SoulAppWebAdapterEntry['status'] = usesShadcnSsr
    ? 'shadcn-ssr'
    : emitsHtml
      ? 'raw-html'
      : 'metadata-only'
  soulAppWebAdapterEntries.push({ file, status })
}

function reportSoulAppWebAdapterCoverage(): void {
  if (soulAppWebAdapterEntries.length === 0)
    return

  const counts = new Map<SoulAppWebAdapterEntry['status'], number>()
  for (const entry of soulAppWebAdapterEntries)
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1)

  console.log(`web UI official Soul App adapter web audit: shadcnSsr=${counts.get('shadcn-ssr') ?? 0} metadataOnly=${counts.get('metadata-only') ?? 0} rawHtml=${counts.get('raw-html') ?? 0}`)

  const rawHtml = soulAppWebAdapterEntries.filter(entry => entry.status === 'raw-html')
  if (rawHtml.length > 0) {
    console.error('web UI official Soul App adapter web audit has raw HTML surfaces:')
    for (const entry of rawHtml)
      console.error(`- ${entry.file}: ${entry.status}`)
    process.exit(1)
  }
}

function recordClassDensity(file: string, values: string[]): void {
  const tokens = values.flatMap(value => value.split(/\s+/).map(token => token.trim()).filter(Boolean))
  const visualTokens = tokens
    .map(token => baseUtilityToken(token))
    .filter(token => visualUtilityTokenPattern.test(token))
  recordThemeTokens(file, tokens)
  if (tokens.length === 0)
    return
  const visualTokenCounts = new Map<string, number>()
  for (const token of visualTokens)
    visualTokenCounts.set(token, (visualTokenCounts.get(token) ?? 0) + 1)
  for (const [token, count] of visualTokenCounts.entries())
    residualVisualUtilityEntries.push({ count, file, token })
  classDensityEntries.push({
    classNameCount: values.length,
    file,
    totalTokens: tokens.length,
    visualTokens: visualTokens.length,
  })
}

function recordThemeTokens(file: string, tokens: string[]): void {
  const themeTokens = new Map<string, number>()
  for (const token of tokens.map(token => baseUtilityToken(token))) {
    const semantic = semanticThemeToken(token)
    if (semantic)
      themeTokens.set(semantic, (themeTokens.get(semantic) ?? 0) + 1)
  }
  for (const [token, count] of themeTokens.entries())
    themeTokenEntries.push({ count, file, token })
}

function semanticThemeToken(token: string): string | null {
  const match = token.match(/^(?:bg|border|decoration|fill|outline|ring|stroke|text)-(background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|border|input|ring|chart-[1-5]|sidebar(?:-[a-z]+)*)\b/u)
  return match?.[1] ?? null
}

function reportThemeTokenUsage(): void {
  const aggregate = new Map<string, number>()
  for (const entry of themeTokenEntries)
    aggregate.set(entry.token, (aggregate.get(entry.token) ?? 0) + entry.count)

  if (aggregate.size === 0) {
    console.log('web UI semantic theme token audit: 0 app-local semantic color tokens; color comes through shadcn primitives and packages/ui theme')
    console.log(`web UI shadcn primitive semantic token audit: ${packagePrimitiveThemeTokenSummary()}`)
    return
  }

  const summary = [...aggregate.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token, count]) => `${token}=${count}`)
    .join(' ')
  console.log(`web UI semantic theme token audit: ${summary}`)
  console.log(`web UI shadcn primitive semantic token audit: ${packagePrimitiveThemeTokenSummary()}`)
}

function packagePrimitiveThemeTokenSummary(): string {
  const aggregate = new Map<string, number>()
  for (const file of listFiles('packages/ui/src/components').filter(file => file.endsWith('.tsx') && !isTestFile(file))) {
    const tokens = stringLiterals(read(file))
      .flatMap(value => value.split(/\s+/).map(token => token.trim()).filter(Boolean))
      .map(token => baseUtilityToken(token))
    for (const token of tokens) {
      const semantic = semanticThemeToken(token)
      if (semantic)
        aggregate.set(semantic, (aggregate.get(semantic) ?? 0) + 1)
    }
  }

  if (aggregate.size === 0)
    return 'missing'

  return [...aggregate.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 14)
    .map(([token, count]) => `${token}=${count}`)
    .join(' ')
}

function reportSurfaceComposition(): void {
  const entries = surfaceCompositionEntries
    .filter(entry => entry.framedSurfaceCount > 0 || entry.scopedNativeClassNameCount > 0 || entry.slotlessNativeClassNameCount > 0)
    .sort((a, b) =>
      b.framedSurfaceCount - a.framedSurfaceCount
      || b.slotlessNativeClassNameCount - a.slotlessNativeClassNameCount
      || b.scopedNativeClassNameCount - a.scopedNativeClassNameCount
      || a.file.localeCompare(b.file),
    )
    .slice(0, 12)
  if (entries.length === 0) {
    console.log('web UI framed surface audit: 0 framed surfaces found in app code')
    return
  }

  console.log('web UI framed surface audit (top shadcn framed primitives + native layout className, informational):')
  for (const entry of entries) {
    console.log(`- ${entry.file}: framed=${entry.framedSurfaceCount} card=${entry.cardCount} alert=${entry.alertCount} outlineItem=${entry.outlineItemCount} outlineButton=${entry.outlineButtonCount} inputFrame=${entry.inputFrameCount} scopedNativeClassName=${entry.scopedNativeClassNameCount} slotlessNativeClassName=${entry.slotlessNativeClassNameCount}`)
  }
}

function reportSurfaceCompositionClassification(): void {
  const actual = surfaceCompositionEntries
    .flatMap(entry => surfaceCompositionCategoryCounts(entry).map(item => ({ ...item, file: entry.file })))
    .sort((a, b) => a.file.localeCompare(b.file) || a.category.localeCompare(b.category))
  if (actual.length === 0)
    return

  const accepted = actual
    .map(entry => ({ ...entry, accepted: acceptedSurfaceClassifications.find(item => item.file === entry.file && item.category === entry.category) }))
    .filter((entry): typeof entry & { accepted: AcceptedSurfaceClassification } => Boolean(entry.accepted))
  const unclassified = actual
    .filter(entry => !acceptedSurfaceClassifications.some(item => item.file === entry.file && item.category === entry.category))
  const staleAccepted = acceptedSurfaceClassifications
    .filter(item => !actual.some(entry => entry.file === item.file && entry.category === item.category))

  if (accepted.length > 0) {
    console.log('web UI framed surface classification (accepted, enforced):')
    for (const entry of accepted)
      console.log(`- ${entry.file}: ${entry.category} x${entry.count} — ${entry.accepted.reason}`)
  }

  if (staleAccepted.length > 0) {
    console.error('web UI framed surface classification has stale accepted entries:')
    for (const entry of staleAccepted)
      console.error(`- ${entry.file}: ${entry.category} — ${entry.reason}`)
    process.exit(1)
  }

  if (unclassified.length > 0) {
    console.error('web UI framed surface classification has unclassified entries:')
    for (const entry of unclassified)
      console.error(`- ${entry.file}: ${entry.category} x${entry.count}`)
    process.exit(1)
  }
}

function reportRawNativeControlClassification(): void {
  const actual = rawNativeControlEntries
    .flatMap(entry => rawNativeControlCategoryCounts(entry).map(item => ({ ...item, file: entry.file })))
    .sort((a, b) => a.file.localeCompare(b.file) || a.category.localeCompare(b.category))
  if (actual.length === 0)
    return

  const accepted = actual
    .map(entry => ({ ...entry, accepted: acceptedRawNativeControlClassifications.find(item => item.file === entry.file && item.category === entry.category) }))
    .filter((entry): typeof entry & { accepted: AcceptedRawNativeControlClassification } => Boolean(entry.accepted))
  const unclassified = actual
    .filter(entry => !acceptedRawNativeControlClassifications.some(item => item.file === entry.file && item.category === entry.category))
  const staleAccepted = acceptedRawNativeControlClassifications
    .filter(item => !actual.some(entry => entry.file === item.file && entry.category === item.category))

  if (accepted.length > 0) {
    console.log('web UI raw native control classification (accepted, enforced):')
    for (const entry of accepted)
      console.log(`- ${entry.file}: ${entry.category} x${entry.count} — ${entry.accepted.reason}`)
  }

  if (staleAccepted.length > 0) {
    console.error('web UI raw native control classification has stale accepted entries:')
    for (const entry of staleAccepted)
      console.error(`- ${entry.file}: ${entry.category} — ${entry.reason}`)
    process.exit(1)
  }

  if (unclassified.length > 0) {
    console.error('web UI raw native control classification has unclassified entries:')
    for (const entry of unclassified)
      console.error(`- ${entry.file}: ${entry.category} x${entry.count}`)
    process.exit(1)
  }
}

function reportHostEmbeddedSoulRendererDebt(): void {
  const rendererPaths = listHostEmbeddedSoulRendererPaths()
  const trackedPaths = new Set(hostEmbeddedSoulRendererDebts.map(entry => entry.path))
  const untrackedPaths = rendererPaths.filter(rendererPath => !trackedPaths.has(rendererPath))
  if (untrackedPaths.length > 0) {
    console.error('web UI Host-embedded Soul renderer gate found untracked renderer paths:')
    for (const rendererPath of untrackedPaths)
      console.error(`- ${rendererPath}`)
    process.exit(1)
  }

  const activeDebts = hostEmbeddedSoulRendererDebts.filter(entry => existsSync(abs(entry.path)))
  if (activeDebts.length === 0)
    return

  console.log('web UI Host-embedded Soul renderer debt (tracked, completion-sensitive):')
  for (const entry of activeDebts)
    console.log(`- ${entry.path}: introduced=${entry.introducedIn}; ${entry.reason}; next=${entry.next}`)

  if (completionAudit) {
    console.error('web UI completion audit blocked by Host-embedded Soul renderer debt:')
    for (const entry of activeDebts)
      console.error(`- ${entry.path}: ${entry.next}`)
    process.exit(1)
  }
}

function listHostEmbeddedSoulRendererPaths(): string[] {
  const root = 'apps/web/src/worker/souls'
  if (!existsSync(abs(root)))
    return []

  const results: string[] = []
  const walk = (relativeDir: string) => {
    for (const entry of readdirSync(abs(relativeDir), { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const child = path.join(relativeDir, entry.name).replaceAll('\\', '/')
      if (child === `${root}/common`)
        continue
      if (existsSync(abs(path.join(child, 'index.tsx').replaceAll('\\', '/'))))
        results.push(child)
      walk(child)
    }
  }
  walk(root)
  return results.sort()
}

function surfaceCompositionCategoryCounts(entry: SurfaceCompositionEntry): Array<{ category: SurfaceClassificationCategory, count: number }> {
  const counts: Array<{ category: SurfaceClassificationCategory, count: number }> = []
  if (entry.cardCount > 0)
    counts.push({ category: 'card', count: entry.cardCount })
  if (entry.alertCount > 0)
    counts.push({ category: 'alert', count: entry.alertCount })
  if (entry.inputFrameCount > 0)
    counts.push({ category: 'input-frame', count: entry.inputFrameCount })
  if (entry.outlineButtonCount > 0)
    counts.push({ category: 'outline-button', count: entry.outlineButtonCount })
  if (entry.outlineItemCount > 0)
    counts.push({ category: 'outline-item', count: entry.outlineItemCount })
  if (entry.scopedNativeClassNameCount > 0)
    counts.push({ category: 'scoped-native-layout', count: entry.scopedNativeClassNameCount })
  if (entry.slotlessNativeClassNameCount > 0)
    counts.push({ category: 'slotless-native-class', count: entry.slotlessNativeClassNameCount })
  return counts
}

function rawNativeControlCategoryCounts(entry: RawNativeControlEntry): Array<{ category: RawNativeControlCategory, count: number }> {
  const counts: Array<{ category: RawNativeControlCategory, count: number }> = []
  if (entry.asChildButtonCount > 0)
    counts.push({ category: 'as-child-button', count: entry.asChildButtonCount })
  if (entry.hiddenFileInputCount > 0)
    counts.push({ category: 'hidden-file-input', count: entry.hiddenFileInputCount })
  if (entry.rawButtonCount > 0)
    counts.push({ category: 'raw-button', count: entry.rawButtonCount })
  if (entry.rawInputCount > 0)
    counts.push({ category: 'raw-input', count: entry.rawInputCount })
  return counts
}

function reportResidualVisualUtilityClassification(): void {
  const residuals = residualVisualUtilityEntries
    .filter(entry => entry.count > 0)
    .sort((a, b) => a.file.localeCompare(b.file) || a.token.localeCompare(b.token))
  if (residuals.length === 0)
    return

  const accepted = residuals
    .map(entry => ({ ...entry, accepted: acceptedResidualVisualUtilities.find(item => item.file === entry.file && item.token === entry.token) }))
    .filter((entry): entry is ResidualVisualUtilityEntry & { accepted: AcceptedResidualVisualUtility } => Boolean(entry.accepted))
  const unclassified = residuals
    .filter(entry => !acceptedResidualVisualUtilities.some(item => item.file === entry.file && item.token === entry.token))
  const staleAccepted = acceptedResidualVisualUtilities
    .filter(item => !residuals.some(entry => entry.file === item.file && entry.token === item.token))

  if (accepted.length > 0) {
    console.log('web UI residual visual utility classification (accepted, informational):')
    for (const entry of accepted)
      console.log(`- ${entry.file}: ${entry.token} x${entry.count} — ${entry.accepted.reason}`)
  }

  if (staleAccepted.length > 0) {
    console.error('web UI residual visual utility classification has stale accepted entries:')
    for (const entry of staleAccepted)
      console.error(`- ${entry.file}: ${entry.token} — ${entry.reason}`)
    process.exit(1)
  }

  if (unclassified.length > 0) {
    console.error('web UI residual visual utility classification has unclassified entries:')
    for (const entry of unclassified)
      console.error(`- ${entry.file}: ${entry.token} x${entry.count}`)
    process.exit(1)
  }
}

function recordClassDimensions(file: string, content: string, values: string[]): void {
  const tokens = values.flatMap(value => value.split(/\s+/).map(token => token.trim()).filter(Boolean))
  if (tokens.length === 0)
    return

  const arbitraryUtilityTokens = sourceArbitraryUtilityTokens(content)
  const nativeClassNameElements = [...content.matchAll(/<\s*(?:article|aside|div|footer|header|h[1-6]|p|pre|section|small|span|strong)([^>]*)>/g)]
    .filter(match => /\bclassName\s*=/.test(match[1] ?? ''))
  const slotlessNativeClassNameCount = nativeClassNameElements
    .filter(match => !scopedSlotAttributePattern.test(match[1] ?? ''))
    .length
  const scopedNativeClassNameCount = nativeClassNameElements.length - slotlessNativeClassNameCount
  const baseTokens = tokens.map(token => baseUtilityToken(token))
  classDimensionEntries.push({
    arbitraryTokens: arbitraryUtilityTokens.length,
    borderTokens: baseTokens.filter(token => token === 'border' || token.startsWith('border-') || token.startsWith('ring-')).length,
    classNameCount: values.length,
    darkTokens: tokens.filter(token => token.includes('dark:')).length,
    file,
    fontTokens: baseTokens.filter(token => token.startsWith('font-')).length,
    largeRadiusTokens: baseTokens.filter(token => /^rounded-(?:lg|xl|2xl|3xl|full|\[)/.test(token)).length,
    nativeClassNameCount: nativeClassNameElements.length,
    radiusTokens: baseTokens.filter(token => token === 'rounded' || token.startsWith('rounded-')).length,
    slotlessNativeClassNameCount,
    totalTokens: tokens.length,
    zIndexTokens: baseTokens.filter(token => /^z-(?:\d+|\[)/.test(token)).length,
  })
  surfaceCompositionEntries.push({
    alertCount: countMatches(content, /<Alert\b/g),
    cardCount: countMatches(content, /<Card\b/g),
    file,
    framedSurfaceCount: 0,
    inputFrameCount: countMatches(content, /<(?:Combobox|Input|InputGroup|NativeSelect|SelectTrigger|Textarea)\b/g),
    outlineButtonCount: countMatches(content, /<Button\s[^>\n]*variant=["']outline["']/g),
    outlineItemCount: countMatches(content, /<Item\s[^>\n]*variant=["']outline["']/g),
    scopedNativeClassNameCount,
    slotlessNativeClassNameCount,
  })
  const entry = surfaceCompositionEntries.at(-1)
  if (entry)
    entry.framedSurfaceCount = entry.cardCount + entry.alertCount + entry.inputFrameCount + entry.outlineButtonCount + entry.outlineItemCount
}

function recordRawNativeControls(file: string, content: string): void {
  const inputBlocks = [...content.matchAll(/<input\b[\s\S]*?\/>/g)].map(match => match[0])
  const hiddenFileInputCount = inputBlocks
    .filter(block =>
      /\btype=["']file["']/.test(block)
      && /\bclassName=["']sr-only["']/.test(block)
      && /\baria-hidden=["']true["']/.test(block),
    )
    .length
  const rawButtonBlocks = [...content.matchAll(/<button\b[\s\S]*?<\/button>/g)]
  const asChildButtonCount = rawButtonBlocks
    .filter(match => isAsChildButtonTarget(content, match.index ?? 0))
    .length
  const rawButtonCount = rawButtonBlocks.length - asChildButtonCount
  const rawInputCount = inputBlocks.length - hiddenFileInputCount

  if (asChildButtonCount === 0 && hiddenFileInputCount === 0 && rawButtonCount === 0 && rawInputCount === 0)
    return

  rawNativeControlEntries.push({
    asChildButtonCount,
    file,
    hiddenFileInputCount,
    rawButtonCount,
    rawInputCount,
  })
}

function isAsChildButtonTarget(content: string, index: number): boolean {
  const prefix = content.slice(Math.max(0, index - 700), index)
  return isInsideAsChildElement(prefix, '<Item', '</Item>')
    || isInsideAsChildElement(prefix, '<CollapsibleTrigger', '</CollapsibleTrigger>')
}

function isInsideAsChildElement(prefix: string, openTag: string, closeTag: string): boolean {
  const start = prefix.lastIndexOf(openTag)
  if (start < 0)
    return false
  const snippet = prefix.slice(start)
  return snippet.includes('asChild') && !snippet.includes(closeTag)
}

function sourceArbitraryUtilityTokens(content: string): string[] {
  const tokens = new Set<string>()
  const arbitraryUtilityPattern = /\b(?:[a-z0-9!-]+:|\[[^\]\s'"`]+\]:)*!?[a-z][a-z0-9-]*-\[[^\]\s'"`]+\]/gi
  for (const match of content.matchAll(arbitraryUtilityPattern))
    tokens.add(match[0])
  return [...tokens]
}

function recordCustomClassTokens(file: string, values: string[]): void {
  const tokens = [...new Set(values
    .flatMap(value => value.split(/\s+/))
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => !token.startsWith('${') && !token.includes(':'))
    .filter(token => appLocalClassPrefixPattern.test(token)))]
  customClassEntries.push({ file, tokens })
}

function shadcnThemeAuditLine(): string {
  const configPath = 'packages/ui/components.json'
  const cssPath = 'packages/ui/src/styles/globals.css'
  const config = JSON.parse(read(configPath)) as {
    iconLibrary?: string
    style?: string
    tailwind?: {
      baseColor?: string
    }
  }
  const css = read(cssPath)
  const theme = cssBlock(css, '@theme inline')
  const root = cssBlock(css, ':root')
  const dark = cssBlock(css, '.dark')
  return [
    'web UI shadcn theme audit:',
    `style=${config.style ?? 'unknown'}`,
    `baseColor=${config.tailwind?.baseColor ?? 'unknown'}`,
    `iconLibrary=${config.iconLibrary ?? 'unknown'}`,
    `radius=${cssVariable(root, '--radius') ?? 'missing'}`,
    `font=${cssVariable(theme, '--font-sans') ?? 'missing'}`,
    `primary=${cssVariable(root, '--primary') ?? 'missing'}`,
    `darkPrimary=${cssVariable(dark, '--primary') ?? 'missing'}`,
    `lightDarkPrimaryDifferent=${cssVariable(root, '--primary') !== cssVariable(dark, '--primary')}`,
    `chart1=${cssVariable(root, '--chart-1') ?? 'missing'}`,
    `darkChart1=${cssVariable(dark, '--chart-1') ?? 'missing'}`,
  ].join(' ')
}

function validateShadcnPrimitiveVisualContract(): void {
  const itemPath = 'packages/ui/src/components/item.tsx'
  if (existsSync(abs(itemPath))) {
    const itemSource = read(itemPath)
    if (/const itemVariants = cva\(\s*['"`][^'"`]*\bborder\b/.test(itemSource)) {
      issues.push({
        file: itemPath,
        message: 'shadcn Item base must not carry a default border; default Item is used as document/list chrome and visible borders create nested frame noise',
      })
    }
  }

  for (const file of listFiles('packages/ui/src/components').filter(file => file.endsWith('.tsx') && !isTestFile(file))) {
    const source = read(file)
    if (/\[class\*=\\?'size-\\?'\]/.test(source)) {
      issues.push({
        file,
        message: 'shadcn icon-size selectors must use [class*=size-] without quotes so Tailwind emits selectors that match runtime svg classes',
      })
    }
  }
}

function cssBlock(content: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  return match?.[1] ?? ''
}

function cssVariable(block: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`${escapedName}:\\s*([^;]+);`))
  return match?.[1]?.trim() ?? null
}

function baseUtilityToken(token: string): string {
  return token
    .split(':')
    .at(-1)!
    .replace(/^!/, '')
    .replace(/^\[&[^\]]+\]/, '')
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length
}

function checkWebCssFile(file: string): void {
  const content = read(file)
  if (localOkPattern.test(content))
    return

  if (content.includes('@zonease/aiworker-component')) {
    issues.push({
      file,
      message: 'imports retired @zonease/aiworker-component stylesheet; use @zonease/aiworker-ui/styles.css',
    })
  }

  const unscopedOverrides = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => unscopedSharedSelectorPattern.test(line))

  const visualDeclarations = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => customVisualPropertyPattern.test(line))

  if (customAudit && visualDeclarations.length > 0) {
    auditFindings.push({
      file,
      message: `custom visual CSS declarations remain (${sample(visualDeclarations)}); keep only thin layout CSS or migrate to shadcn tokens/components`,
    })
  }

  if (unscopedOverrides.length > 0) {
    issues.push({
      file,
      message: `changed CSS overrides retired shared selectors (${sample(unscopedOverrides)}); replace with shadcn primitives, scope as product-owned CSS, or add @aiworker-ui-local-ok with a reason`,
    })
  }
}

function classNameValues(content: string): string[] {
  const values: string[] = []
  const patterns = [
    /className\s*=\s*["']([^"']+)["']/g,
    /className\s*=\s*\{\s*["']([^"']+)["']\s*\}/g,
    /className\s*=\s*\{\s*`([^`]+)`\s*\}/g,
    /\b(?:const|let|var)\s+\w*ClassName\s*=\s*["']([^"']+)["']/g,
    /\b(?:const|let|var)\s+\w*ClassName\s*=\s*`([^`]+)`/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1]
      if (value)
        values.push(value)
    }
  }
  const cnPatterns = [
    /className\s*=\s*\{\s*cn\(([\s\S]*?)\)\s*\}/g,
    /className\s*=\s*\{\s*\[([\s\S]*?)\]\.filter/g,
  ]
  for (const pattern of cnPatterns) {
    for (const match of content.matchAll(pattern)) {
      const body = match[1]
      if (!body)
        continue
      values.push(...stringLiterals(body))
    }
  }
  return [...new Set(values)]
}

function stringLiterals(content: string): string[] {
  const values: string[] = []
  for (const match of content.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) {
    const value = match[2]
    if (value)
      values.push(value)
  }
  return values
}

function customUiClassTokens(values: string[], keywordPattern: RegExp): string[] {
  return [...new Set(values
    .flatMap(value => value.split(/\s+/))
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => !token.startsWith('${') && !token.includes(':'))
    .filter(token => appLocalClassPrefixPattern.test(token) && keywordPattern.test(token)))]
}

function listChangedFiles(): string[] {
  return unique([
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--', 'apps/web/src', 'apps/aiworker-hr/product/web', 'apps/aiworker-hr/host-adapter', 'apps/aiworker-qa/product/web', 'apps/aiworker-qa/host-adapter']),
    ...gitLines(['ls-files', '--others', '--exclude-standard', '--', 'apps/web/src', 'apps/aiworker-hr/product/web', 'apps/aiworker-hr/host-adapter', 'apps/aiworker-qa/product/web', 'apps/aiworker-qa/host-adapter']),
  ]).filter(file => isRelevantFile(file))
}

function listAllUiFiles(): string[] {
  return [
    ...listFiles('apps/web/src'),
    ...listFiles('apps/aiworker-hr/product/web'),
    ...listFiles('apps/aiworker-hr/host-adapter'),
    ...listFiles('apps/aiworker-qa/product/web'),
    ...listFiles('apps/aiworker-qa/host-adapter'),
  ].filter(file => isRelevantFile(file))
}

function listFiles(root: string): string[] {
  if (!existsSync(abs(root)))
    return []

  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'routeTree.gen.ts')
        continue
      const child = path.posix.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (entry.isFile())
        files.push(child)
    }
  }
  walk(root)
  return files
}

function gitLines(args: string[]): string[] {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }
  catch {
    return []
  }
}

function read(file: string): string {
  return readFileSync(abs(file), 'utf8')
}

function abs(file: string): string {
  return path.join(repoRoot, file)
}

function isRelevantFile(file: string): boolean {
  return isUiTsxFile(file) || isUiCssFile(file) || isOfficialSoulWebAdapterFile(file)
}

function isUiTsxFile(file: string): boolean {
  return isUiFile(file) && file.endsWith('.tsx') && isFile(file)
}

function isUiCssFile(file: string): boolean {
  return isUiFile(file) && file.endsWith('.css') && isFile(file)
}

function isUiFile(file: string): boolean {
  return file.startsWith('apps/web/src/')
    || file.startsWith('apps/aiworker-hr/product/web/')
    || file.startsWith('apps/aiworker-qa/product/web/')
}

function isOfficialSoulProductWebFile(file: string): boolean {
  return file.startsWith('apps/aiworker-hr/product/web/')
    || file.startsWith('apps/aiworker-qa/product/web/')
}

function isOfficialSoulWebAdapterFile(file: string): boolean {
  return /apps\/aiworker-(?:hr|qa)\/host-adapter\/(?:mounted|standalone)\/[^/]+\.ts$/.test(file)
}

function isMetadataOnlyProductWebFile(content: string): boolean {
  const normalized = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('//'))
  return normalized.length > 0
    && normalized.every(line => /^export const \w+ = ['"][^'"]+['"]$/.test(line))
}

function isTestFile(file: string): boolean {
  return /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.tsx?$/.test(file)
}

function isFile(file: string): boolean {
  try {
    return statSync(abs(file)).isFile()
  }
  catch {
    return false
  }
}

function sample(values: string[]): string {
  return values.slice(0, 3).map(value => JSON.stringify(value)).join(', ')
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.replaceAll('\\', '/')))].sort()
}
