import type { Element as HastElement } from 'hast'
import type { Parent as MdastParent, Root as MdastRoot, PhrasingContent } from 'mdast'
import type { ComponentPropsWithoutRef } from 'react'
import type { Components } from 'react-markdown'

import { cn } from '#lib/utils'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface AssistantMarkdownProps {
  className?: string
  markdown: string
  streaming?: boolean
}

// react-markdown component overrides — preserve AIWorker transcript chrome
// (code/table scroll affordances, typed links, accessible task checkboxes,
// nested-list depth hints) that the focused renderer tests assert. Component
// functions referenced here are hoisted declarations defined below.
const ASSISTANT_MARKDOWN_COMPONENTS: Components = {
  h1: ({ node: _node, ...props }) => <h1 {...props} className={headingClassName(1)} />,
  h2: ({ node: _node, ...props }) => <h2 {...props} className={headingClassName(2)} />,
  h3: ({ node: _node, ...props }) => <h3 {...props} className={headingClassName(3)} />,
  h4: ({ node: _node, ...props }) => <h4 {...props} className={headingClassName(4)} />,
  h5: ({ node: _node, ...props }) => <h5 {...props} className={headingClassName(5)} />,
  h6: ({ node: _node, ...props }) => <h6 {...props} className={headingClassName(6)} />,
  p: ({ node: _node, ...props }) => <p {...props} className="whitespace-pre-wrap" />,
  ul: ({ node: _node, className: _className, ...props }) => <ul {...props} className="list-disc space-y-1 pl-5" />,
  ol: ({ node: _node, className: _className, start, ...props }) => (
    <ol {...props} start={start === 1 || start == null ? undefined : start} className="list-decimal space-y-1 pl-5" />
  ),
  li: AssistantListItem,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote {...props} className="border-l-2 border-border pl-3 text-muted-foreground" />
  ),
  strong: ({ node: _node, ...props }) => <strong {...props} className="font-semibold" />,
  a: AssistantLink,
  code: AssistantInlineCode,
  pre: AssistantPre,
  table: AssistantTable,
  thead: ({ node: _node, ...props }) => <thead {...props} className="bg-muted/40" />,
  th: ({ node: _node, ...props }) => <th {...props} className="border-b border-border px-3 py-2 text-left font-medium" />,
  td: ({ node: _node, ...props }) => <td {...props} className="px-3 py-2 align-top" />,
  tr: ({ node: _node, ...props }) => <tr {...props} className="border-t border-border/60 first:border-t-0" />,
  input: AssistantTaskCheckbox,
  // AIWorker inline path/branch semantic tokens, emitted by the rehype plugin.
  span: AssistantSemanticSpan,
}

export function AssistantMarkdown({ className, markdown, streaming = false }: AssistantMarkdownProps) {
  const repaired = protectGlobstars(repairStreamingMarkdown(markdown, streaming))

  return (
    <div
      data-transcript-slot="assistant-markdown"
      data-streaming={streaming ? 'true' : undefined}
      className={cn(
        'min-w-0 space-y-3 text-sm/relaxed text-foreground',
        streaming && 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 after:ml-1 after:inline-block after:size-1.5 after:animate-pulse after:rounded-full after:bg-muted-foreground/55 after:align-middle after:content-[""]',
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm, remarkAiworkerInlineTokens]}
        rehypePlugins={[rehypeAssistantTaskLabels]}
        urlTransform={transformAssistantHref}
        components={ASSISTANT_MARKDOWN_COMPONENTS}
        skipHtml
      >
        {repaired}
      </Markdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Streaming repair (AIWorker-specific pre-process; runs before react-markdown).
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components -- exported for focused parser tests.
export function repairStreamingMarkdown(markdown: string, streaming: boolean): string {
  if (!streaming)
    return markdown

  let repaired = markdown
  const fenceCount = (repaired.match(/```/g) ?? []).length
  if (fenceCount % 2 === 1)
    repaired = `${repaired}\n\`\`\``

  const withoutFences = repaired.replace(/```[\s\S]*?```/g, '')
  const inlineBacktickCount = (withoutFences.match(/`/g) ?? []).length
  if (inlineBacktickCount % 2 === 1)
    repaired = `${repaired}\``

  if (hasUnclosedStrongOpener(withoutFences))
    repaired = `${repaired}**`

  if (hasUnclosedItalicOpener(withoutFences))
    repaired = `${repaired}*`

  return repaired
}

// ---------------------------------------------------------------------------
// Globstar protection (AIWorker-specific pre-process). CommonMark treats `**`
// adjacent to `/` as a strong-emphasis run, so glob patterns like `**/*.ts`,
// `src/**`, and `**/dist/**` would render as broken bold. The hand-rolled
// renderer rejected `**` openers followed by punctuation; we reproduce that by
// backslash-escaping globstar `**` outside fenced/inline code so react-markdown
// renders them literally while real `**bold**` keeps working.
// ---------------------------------------------------------------------------

function protectGlobstars(markdown: string): string {
  // Split into code and non-code segments so we never touch fenced or inline
  // code where literal `**/` must be preserved verbatim.
  const segments = markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  return segments
    .map((segment, index) => (index % 2 === 1 ? segment : escapeGlobstarRuns(segment)))
    .join('')
}

function escapeGlobstarRuns(text: string): string {
  // Escape a `**` run only when it is glob-like: immediately followed by `/`
  // (e.g. `**/`) or immediately preceded by `/` (e.g. `dist/**`). `**bold**`
  // is never adjacent to `/`, so it is left intact.
  return text.replace(/\*\*/g, (match, offset: number, full: string) => {
    const before = full[offset - 1]
    const after = full[offset + 2]
    if (after === '/' || before === '/')
      return '\\*\\*'
    return match
  })
}

// ---------------------------------------------------------------------------
// react-markdown component override implementations (referenced by
// ASSISTANT_MARKDOWN_COMPONENTS above).
// ---------------------------------------------------------------------------

function AssistantListItem({ node, className, children, ...props }: ComponentPropsWithoutRef<'li'> & { node?: HastElement }) {
  const classes = toClassList(node?.properties?.className)
  const isTask = classes.includes('task-list-item')
  const depth = listDepthForNode(node)

  return (
    <li
      {...props}
      data-list-depth={depth}
      className={cn(isTask && 'list-none', depth > 0 && 'ms-4', className)}
    >
      {children}
    </li>
  )
}

function AssistantLink({ node: _node, href, children, ...props }: ComponentPropsWithoutRef<'a'> & { node?: HastElement }) {
  const safe = typeof href === 'string' ? href : ''
  return (
    <a
      {...props}
      href={safe}
      target="_blank"
      rel="noreferrer"
      data-link-kind={linkKindForHref(safe)}
      className="inline-flex items-center rounded-sm px-0.5 underline underline-offset-4 hover:bg-muted/60 hover:text-primary"
    >
      {children}
    </a>
  )
}

function AssistantInlineCode({ node: _node, className: _className, children, ...props }: ComponentPropsWithoutRef<'code'> & { node?: HastElement }) {
  return (
    <code {...props} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  )
}

function AssistantPre({ node, children, ...props }: ComponentPropsWithoutRef<'pre'> & { node?: HastElement }) {
  const language = languageFromPreNode(node)
  return (
    <figure
      data-transcript-slot="assistant-code-block"
      data-testid="assistant-code-block"
      className="overflow-hidden rounded-md border border-border bg-muted/40"
    >
      {language
        ? <figcaption className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{language}</figcaption>
        : null}
      <pre {...props} className="no-scrollbar overflow-x-auto p-3 text-xs/relaxed" dir="ltr">{children}</pre>
    </figure>
  )
}

function AssistantTable({ node: _node, className: _className, ...props }: ComponentPropsWithoutRef<'table'> & { node?: HastElement }) {
  return (
    <div className="no-scrollbar min-w-0 overflow-x-auto rounded-md border border-border">
      <table {...props} className="w-full border-collapse text-left text-xs/relaxed" />
    </div>
  )
}

function AssistantTaskCheckbox({ node: _node, ...props }: ComponentPropsWithoutRef<'input'> & { node?: HastElement }) {
  if (props.type !== 'checkbox')
    return <input {...props} />

  // `aria-label` is stamped onto the hast node by rehypeAssistantTaskLabels and
  // arrives here as a normal prop, so the checkbox has an accessible name.
  return (
    <input
      {...props}
      readOnly
      className="mt-1 size-3 accent-primary"
    />
  )
}

function AssistantSemanticSpan({ node, children, ...props }: ComponentPropsWithoutRef<'span'> & { node?: HastElement }) {
  const inlineKind = node?.properties?.dataInlineKind
  if (inlineKind === 'path' || inlineKind === 'branch') {
    return (
      <code
        data-inline-kind={inlineKind}
        className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
      >
        {children}
      </code>
    )
  }
  return <span {...props}>{children}</span>
}

// ---------------------------------------------------------------------------
// AIWorker-specific inline tokens (no native remark-gfm equivalent), injected
// as mdast nodes so they survive react-markdown's standard pipeline:
//   - bare `localhost:PORT` / `127.0.0.1:PORT` autolinks (scheme-less)
//   - inline path/branch semantic tokens (`docs/runtime.md`, `codex/refactor`)
// ---------------------------------------------------------------------------

// Self-contained remark transform (no unist-util-visit dependency): walk every
// phrasing-bearing parent and split its text children into the AIWorker inline
// tokens. Path/branch tokens carry `data.hName`/`hProperties`, which
// mdast-util-to-hast (react-markdown's remark→rehype bridge) renders as a real
// `<span data-inline-kind>` element — no rehype-raw / no skipHtml bypass needed.
function remarkAiworkerInlineTokens() {
  return (tree: MdastRoot) => {
    transformPhrasingParents(tree)
  }
}

function transformPhrasingParents(node: MdastParent): void {
  const children = node.children as PhrasingContent[]
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]
    if (!child)
      continue
    // Never re-tokenize inside links or code spans.
    if (child.type === 'link' || child.type === 'inlineCode')
      continue
    if (child.type === 'text') {
      const replacement = tokenizeInlineText(child.value)
      if (replacement !== null)
        children.splice(index, 1, ...replacement)
      continue
    }
    if ('children' in child && Array.isArray((child as MdastParent).children))
      transformPhrasingParents(child as MdastParent)
  }
}

function tokenizeInlineText(value: string): PhrasingContent[] | null {
  const nodes: PhrasingContent[] = []
  let buffer = ''
  let index = 0
  let produced = false

  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', value: buffer })
      buffer = ''
    }
  }

  while (index < value.length) {
    const bareLink = matchBareLinkAt(value, index)
    if (bareLink) {
      flush()
      nodes.push({
        type: 'link',
        url: bareLink.href,
        children: [{ type: 'text', value: bareLink.label }],
      })
      if (bareLink.trailing)
        nodes.push({ type: 'text', value: bareLink.trailing })
      index = bareLink.end
      produced = true
      continue
    }

    const semantic = matchInlineSemanticAt(value, index)
    if (semantic) {
      flush()
      // An emphasis node with a `data.hName` override renders as a custom span;
      // mdast-util-to-hast honours hName/hProperties for any node.
      nodes.push({
        type: 'emphasis',
        children: [{ type: 'text', value: semantic.label }],
        data: {
          hName: 'span',
          hProperties: { dataInlineKind: semantic.kind },
        },
      })
      if (semantic.trailing)
        nodes.push({ type: 'text', value: semantic.trailing })
      index = index + semantic.label.length + (semantic.trailing?.length ?? 0)
      produced = true
      continue
    }

    buffer += value[index]
    index += 1
  }

  if (!produced)
    return null

  flush()
  return nodes
}

// ---------------------------------------------------------------------------
// hast/mdast node helpers
// ---------------------------------------------------------------------------

function toClassList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(item => String(item))
  if (typeof value === 'string')
    return value.split(/\s+/)
  return []
}

function listDepthForNode(node: HastElement | undefined): number {
  const column = node?.position?.start.column ?? 1
  // Markdown list nesting indents by ~2 columns per level; mirror legacy depth.
  return Math.max(0, Math.floor((column - 1) / 2))
}

function languageFromPreNode(node: HastElement | undefined): string | undefined {
  const codeChild = node?.children?.find(
    (child): child is HastElement => child.type === 'element' && child.tagName === 'code',
  )
  const classes = toClassList(codeChild?.properties?.className)
  const languageClass = classes.find(name => name.startsWith('language-'))
  if (!languageClass)
    return undefined
  const language = languageClass.slice('language-'.length).trim()
  return language || undefined
}

// Give GFM task-list checkboxes an accessible name. mdast-util-to-hast emits
// `<li class="task-list-item"><input type="checkbox" ...>label</li>` with no
// label association, so an unlabelled checkbox has an empty accessible name.
// This minimal self-contained rehype pass (no unist-util-visit dependency)
// stamps `aria-label` onto each task checkbox from its list-item text.
function rehypeAssistantTaskLabels() {
  return (tree: HastElement) => {
    walkHast(tree, (node) => {
      if (node.tagName !== 'li')
        return
      if (!toClassList(node.properties?.className).includes('task-list-item'))
        return
      const checkbox = node.children.find(
        (child): child is HastElement =>
          child.type === 'element'
          && child.tagName === 'input'
          && child.properties?.type === 'checkbox',
      )
      if (!checkbox)
        return
      const label = collectText(node).trim()
      if (label)
        checkbox.properties = { ...checkbox.properties, ariaLabel: label }
    })
  }
}

function walkHast(node: HastElement, visit: (node: HastElement) => void): void {
  visit(node)
  for (const child of node.children ?? []) {
    if (child.type === 'element')
      walkHast(child, visit)
  }
}

function collectText(node: HastElement): string {
  let text = ''
  for (const child of node.children ?? []) {
    if (child.type === 'text')
      text += child.value
    else if (child.type === 'element')
      text += collectText(child)
  }
  return text
}

// ---------------------------------------------------------------------------
// Heading styling (unchanged from the hand-rolled renderer).
// ---------------------------------------------------------------------------

function headingClassName(depth: number): string {
  if (depth === 1)
    return 'text-base/relaxed font-semibold tracking-tight'
  if (depth === 2)
    return 'text-sm/relaxed font-semibold tracking-tight'
  return 'text-sm/relaxed font-medium tracking-tight'
}

// ---------------------------------------------------------------------------
// Bare-link + inline-semantic tokenizers (ported verbatim from the hand-rolled
// renderer; these have no native remark-gfm equivalent).
// ---------------------------------------------------------------------------

function matchBareLinkAt(text: string, index: number): { end: number, href: string, label: string, trailing?: string } | null {
  const previous = text[index - 1]
  if (previous && !isInlineBoundary(previous))
    return null

  const raw = readBareLinkCandidate(text, index)
  if (!raw)
    return null

  const { label, trailing } = splitTrailingPunctuation(raw)
  // remark-gfm already autolinks http(s):// and www. URLs; we only claim the
  // scheme-less loopback host:port forms it would otherwise leave as plain text.
  if (label.startsWith('http://') || label.startsWith('https://'))
    return null

  const href = normalizeAssistantHref(`http://${label}`)
  if (!href)
    return null

  return {
    end: index + label.length + trailing.length,
    href,
    label,
    trailing,
  }
}

function matchInlineSemanticAt(text: string, index: number): { kind: 'branch' | 'path', label: string, trailing?: string } | null {
  const previous = text[index - 1]
  if (previous && isSemanticCandidateChar(previous))
    return null

  const candidate = readInlineSemanticCandidate(text, index)
  if (!candidate)
    return null

  const { label, trailing } = splitTrailingPunctuation(candidate)
  if (!label.includes('/'))
    return null

  const before = text.slice(Math.max(0, index - 16), index).toLowerCase()
  const hasFileExtension = hasPathFileExtension(label)
  const kind = before.endsWith('branch ') || before.endsWith('分支 ') ? 'branch' : (hasFileExtension ? 'path' : null)
  if (!kind)
    return null

  return { kind, label, trailing }
}

function isInlineBoundary(value: string): boolean {
  return isWhitespace(value) || value === '(' || value === '[' || value === '<' || value === '{'
}

function readBareLinkCandidate(text: string, index: number): string | null {
  let end = index
  while (end < text.length && !isBareLinkTerminator(text[end] ?? ''))
    end += 1
  if (end === index)
    return null

  const candidate = text.slice(index, end)
  if (candidate.startsWith('http://') || candidate.startsWith('https://'))
    return candidate
  if (startsWithLocalhostPort(candidate) || startsWithLoopbackPort(candidate))
    return candidate
  return null
}

function isBareLinkTerminator(value: string): boolean {
  return isWhitespace(value) || value === '<' || value === '>' || value === ')' || value === ']'
}

function startsWithLocalhostPort(value: string): boolean {
  return startsWithHostPort(value, 'localhost:')
}

function startsWithLoopbackPort(value: string): boolean {
  return startsWithHostPort(value, '127.0.0.1:')
}

function startsWithHostPort(value: string, prefix: string): boolean {
  if (!value.startsWith(prefix))
    return false
  const firstPortChar = value[prefix.length]
  return firstPortChar !== undefined && isDigit(firstPortChar)
}

function readInlineSemanticCandidate(text: string, index: number): string | null {
  let end = index
  while (end < text.length && isSemanticCandidateChar(text[end] ?? ''))
    end += 1
  return end > index ? text.slice(index, end) : null
}

function isSemanticCandidateChar(value: string): boolean {
  return isAsciiLetter(value) || isDigit(value) || value === '_' || value === '.' || value === '-' || value === '/'
}

function isAsciiLetter(value: string): boolean {
  const lower = value.toLowerCase()
  return lower >= 'a' && lower <= 'z'
}

function hasPathFileExtension(value: string): boolean {
  const slashIndex = value.lastIndexOf('/')
  const dotIndex = value.lastIndexOf('.')
  return slashIndex !== -1 && dotIndex > slashIndex + 1 && dotIndex < value.length - 1
}

// ---------------------------------------------------------------------------
// href safety whitelist (AIWorker-specific; tighter than react-markdown's
// default urlTransform which also permits mailto:/tel:).
// ---------------------------------------------------------------------------

function transformAssistantHref(href: string): string {
  return normalizeAssistantHref(href) ?? ''
}

function normalizeAssistantHref(href: string): string | null {
  const value = href.trim()
  if (!value || hasControlCharacter(value))
    return null

  try {
    const url = new URL(value, 'https://aiworker.local')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return value
  }
  catch {
    return null
  }

  return null
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127)
      return true
  }
  return false
}

function linkKindForHref(href: string): string {
  try {
    const url = new URL(href, 'https://aiworker.local')
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1')
      return 'localhost'
    if (url.hostname === 'aiworker.local')
      return 'relative'
  }
  catch {
    return 'unknown'
  }
  return 'external'
}

function splitTrailingPunctuation(value: string): { label: string, trailing: string } {
  let end = value.length
  while (end > 0 && isTrailingPunctuation(value[end - 1] ?? ''))
    end -= 1
  return { label: value.slice(0, end), trailing: value.slice(end) }
}

function isTrailingPunctuation(value: string): boolean {
  return value === '.' || value === ',' || value === ';' || value === ':' || value === '!' || value === '?'
}

// ---------------------------------------------------------------------------
// Streaming-repair emphasis heuristics (unchanged from the hand-rolled
// renderer; only used by repairStreamingMarkdown).
// ---------------------------------------------------------------------------

function hasUnclosedItalicOpener(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (!isItalicOpener(text, index))
      continue

    const nextCloser = text.slice(index + 1).search(/\S\*(?!\*)/)
    if (nextCloser === -1)
      return true
  }

  return false
}

function hasUnclosedStrongOpener(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (!isStrongOpener(text, index))
      continue

    const nextCloser = text.slice(index + 2).search(/\S\*\*(?!\*)/)
    if (nextCloser === -1)
      return true
  }

  return false
}

function isStrongOpener(text: string, index: number): boolean {
  if (text[index] !== '*' || text[index + 1] !== '*')
    return false

  const previous = text[index - 1]
  const next = text[index + 2]
  if (previous === '*' || next === '*')
    return false

  if (!next || /\s/.test(next))
    return false

  if (!isEmphasisContentStart(next))
    return false

  return isEmphasisOpeningBoundary(previous)
}

function isItalicOpener(text: string, index: number): boolean {
  if (text[index] !== '*')
    return false

  const previous = text[index - 1]
  const next = text[index + 1]
  if (previous === '*' || next === '*')
    return false

  if (!next || /\s/.test(next))
    return false

  if (!isEmphasisContentStart(next))
    return false

  return isEmphasisOpeningBoundary(previous)
}

function isEmphasisContentStart(value: string): boolean {
  return !/[\s!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~-]/.test(value)
}

function isEmphasisOpeningBoundary(value: string | undefined): boolean {
  if (!value)
    return true

  return /\s/.test(value) || /[([{"']/.test(value) || isUnicodePunctuation(value)
}

function isUnicodePunctuation(value: string): boolean {
  return /\p{P}/u.test(value)
}

function isWhitespace(value: string): boolean {
  return value === ' ' || value === '\t'
}

function isDigit(value: string): boolean {
  return value >= '0' && value <= '9'
}
