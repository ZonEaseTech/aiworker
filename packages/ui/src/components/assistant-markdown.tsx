import type { ReactNode } from 'react'

import { cn } from '#lib/utils'

export interface AssistantMarkdownProps {
  className?: string
  markdown: string
  streaming?: boolean
}

type MarkdownBlock
  = | { code: string, kind: 'code', language?: string }
    | { depth: number, kind: 'heading', text: string }
    | { items: MarkdownListItem[], kind: 'unordered-list' }
    | { items: MarkdownListItem[], kind: 'ordered-list', start: number }
    | { kind: 'paragraph', text: string }
    | { kind: 'quote', text: string }
    | { headers: string[], kind: 'table', rows: string[][] }

interface MarkdownListItem {
  checked?: boolean
  depth: number
  id: string
  task?: boolean
  text: string
}

export function AssistantMarkdown({ className, markdown, streaming = false }: AssistantMarkdownProps) {
  const repaired = repairStreamingMarkdown(markdown, streaming)
  const blocks = parseMarkdownBlocks(repaired)

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
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}

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

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length)
        index += 1
      blocks.push({ code: codeLines.join('\n'), kind: 'code', language })
      continue
    }

    const heading = matchHeadingLine(line)
    if (heading) {
      blocks.push({ depth: heading.depth, kind: 'heading', text: heading.text })
      index += 1
      continue
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ kind: 'quote', text: quoteLines.join('\n') })
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index] ?? '')
      const rows: string[][] = []
      index += 2
      while (index < lines.length && isTableDataLine(lines[index] ?? '')) {
        rows.push(splitTableRow(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ headers, kind: 'table', rows })
      continue
    }

    if (isUnorderedListLine(line)) {
      const items: MarkdownListItem[] = []
      while (index < lines.length && isUnorderedListLine(lines[index] ?? '')) {
        const listLine = lines[index] ?? ''
        const content = readUnorderedListContent(listLine)
        const task = parseTaskListContent(content)
        items.push({
          checked: task?.checked,
          depth: listDepthForLine(listLine),
          id: `ul-line-${index}`,
          task: Boolean(task),
          text: task?.text ?? content,
        })
        index += 1
      }
      blocks.push({ items, kind: 'unordered-list' })
      continue
    }

    if (isOrderedListLine(line)) {
      const start = readOrderedListStart(line)
      const items: MarkdownListItem[] = []
      while (index < lines.length && isOrderedListLine(lines[index] ?? '')) {
        const listLine = lines[index] ?? ''
        items.push({
          depth: listDepthForLine(listLine),
          id: `ol-line-${index}`,
          text: readOrderedListContent(listLine),
        })
        index += 1
      }
      blocks.push({ items, kind: 'ordered-list', start })
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length
      && (lines[index] ?? '').trim()
      && !(lines[index] ?? '').startsWith('```')
      && !(lines[index] ?? '').startsWith('>')
      && !matchHeadingLine(lines[index] ?? '')
      && !isTableStart(lines, index)
      && !isUnorderedListLine(lines[index] ?? '')
      && !isOrderedListLine(lines[index] ?? '')
    ) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}

function matchHeadingLine(line: string): { depth: number, text: string } | null {
  let depth = 0
  while (depth < line.length && line[depth] === '#')
    depth += 1
  if (depth < 1 || depth > 6 || !isWhitespace(line[depth] ?? ''))
    return null
  const text = line.slice(depth).trim()
  return text ? { depth, text } : null
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index] ?? ''
  const next = lines[index + 1] ?? ''
  return isTableDataLine(current) && isTableSeparatorLine(next)
}

function isTableDataLine(line: string): boolean {
  const value = line.trim()
  return value.startsWith('|') && value.endsWith('|') && value.length > 2
}

function isTableSeparatorLine(line: string): boolean {
  if (!isTableDataLine(line))
    return false
  const cells = splitTableRow(line)
  return cells.length > 1 && cells.every(isTableSeparatorCell)
}

function isTableSeparatorCell(cell: string): boolean {
  const value = cell.trim()
  let hyphenCount = 0
  for (const char of value) {
    if (char === '-') {
      hyphenCount += 1
      continue
    }
    if (char !== ':')
      return false
  }
  return hyphenCount >= 3
}

function splitTableRow(line: string): string[] {
  let value = line.trim()
  if (value.startsWith('|'))
    value = value.slice(1)
  if (value.endsWith('|'))
    value = value.slice(0, -1)
  return value.split('|').map(cell => cell.trim())
}

function isUnorderedListLine(line: string): boolean {
  const markerIndex = firstNonWhitespaceIndex(line)
  const marker = line[markerIndex]
  return (marker === '-' || marker === '*') && isWhitespace(line[markerIndex + 1] ?? '')
}

function readUnorderedListContent(line: string): string {
  return readListContentAfter(line, firstNonWhitespaceIndex(line) + 1)
}

function isOrderedListLine(line: string): boolean {
  const start = firstNonWhitespaceIndex(line)
  let index = start
  while (isDigit(line[index] ?? ''))
    index += 1
  return index > start && line[index] === '.' && isWhitespace(line[index + 1] ?? '')
}

function readOrderedListContent(line: string): string {
  const start = firstNonWhitespaceIndex(line)
  let index = start
  while (isDigit(line[index] ?? ''))
    index += 1
  return readListContentAfter(line, index + 1)
}

function readOrderedListStart(line: string): number {
  const start = firstNonWhitespaceIndex(line)
  let index = start
  while (isDigit(line[index] ?? ''))
    index += 1
  return Number.parseInt(line.slice(start, index), 10)
}

function readListContentAfter(line: string, markerEndIndex: number): string {
  let index = markerEndIndex
  while (isWhitespace(line[index] ?? ''))
    index += 1
  return line.slice(index)
}

function parseTaskListContent(content: string): { checked: boolean, text: string } | null {
  if (content[0] !== '[' || content[2] !== ']' || !isWhitespace(content[3] ?? ''))
    return null
  const marker = content[1]?.toLowerCase()
  if (marker !== 'x' && marker !== ' ')
    return null
  return { checked: marker === 'x', text: content.slice(4).trimStart() }
}

function listDepthForLine(line: string): number {
  let indent = 0
  for (const char of line) {
    if (char === ' ') {
      indent += 1
      continue
    }
    if (char === '\t') {
      indent += 2
      continue
    }
    break
  }
  return Math.floor(indent / 2)
}

function firstNonWhitespaceIndex(line: string): number {
  let index = 0
  while (index < line.length && isWhitespace(line[index] ?? ''))
    index += 1
  return index
}

function isWhitespace(value: string): boolean {
  return value === ' ' || value === '\t'
}

function isDigit(value: string): boolean {
  return value >= '0' && value <= '9'
}

function headingClassName(depth: number): string {
  if (depth === 1)
    return 'text-base/relaxed font-semibold tracking-tight'
  if (depth === 2)
    return 'text-sm/relaxed font-semibold tracking-tight'
  return 'text-sm/relaxed font-medium tracking-tight'
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.kind === 'heading') {
    const Heading = `h${block.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return (
      <Heading key={`h-${index}`} className={headingClassName(block.depth)}>
        {renderInlineMarkdown(block.text, `h-${index}`)}
      </Heading>
    )
  }

  if (block.kind === 'code') {
    return (
      <figure
        key={`code-${index}`}
        data-transcript-slot="assistant-code-block"
        data-testid="assistant-code-block"
        className="overflow-hidden rounded-md border border-border bg-muted/40"
      >
        {block.language
          ? <figcaption className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{block.language}</figcaption>
          : null}
        <pre className="no-scrollbar overflow-x-auto p-3 text-xs/relaxed" dir="ltr"><code>{block.code}</code></pre>
      </figure>
    )
  }

  if (block.kind === 'quote') {
    return (
      <blockquote key={`quote-${index}`} className="border-l-2 border-border pl-3 text-muted-foreground">
        {renderInlineMarkdown(block.text, `quote-${index}`)}
      </blockquote>
    )
  }

  if (block.kind === 'ordered-list') {
    return (
      <ol key={`ol-${index}`} start={block.start === 1 ? undefined : block.start} className="list-decimal space-y-1 pl-5">
        {block.items.map(item => renderListItem(item))}
      </ol>
    )
  }

  if (block.kind === 'unordered-list') {
    return (
      <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
        {block.items.map(item => renderListItem(item))}
      </ul>
    )
  }

  if (block.kind === 'table') {
    return (
      <div key={`table-${index}`} className="no-scrollbar min-w-0 overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left text-xs/relaxed">
          <thead className="bg-muted/40">
            <tr>
              {block.headers.map(header => (
                <th key={`header-${header}`} className="border-b border-border px-3 py-2 font-medium">
                  {renderInlineMarkdown(header, `table-${index}-header-${header}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => {
              const rowKey = row.join('|')
              return (
                <tr key={`row-${rowKey}`} className="border-t border-border/60 first:border-t-0">
                  {block.headers.map((header, cellIndex) => {
                    const cell = row[cellIndex] ?? ''
                    return (
                      <td key={`cell-${rowKey}-${header}-${cell}`} className="px-3 py-2 align-top">
                        {renderInlineMarkdown(cell, `table-${index}-row-${rowKey}-${header}`)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  if (block.kind === 'paragraph')
    return <p key={`p-${index}`} className="whitespace-pre-wrap">{renderInlineMarkdown(block.text, `p-${index}`)}</p>

  return null
}

function renderListItem(item: MarkdownListItem): ReactNode {
  return (
    <li
      key={item.id}
      data-list-depth={item.depth}
      className={cn(item.depth > 0 && 'ms-4')}
    >
      {item.task
        ? (
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.checked}
                readOnly
                aria-label={item.text}
                className="mt-1 size-3 accent-primary"
              />
              <span>{renderInlineMarkdown(item.text, item.id)}</span>
            </label>
          )
        : renderInlineMarkdown(item.text, item.id)}
    </li>
  )
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let buffer = ''
  let index = 0

  function flushText() {
    if (!buffer)
      return
    nodes.push(buffer)
    buffer = ''
  }

  while (index < text.length) {
    const link = matchLinkAt(text, index)
    if (link) {
      flushText()
      nodes.push(
        <a
          key={`${keyPrefix}-link-${index}`}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          data-link-kind={link.kind}
          className="inline-flex items-center rounded-sm px-0.5 underline underline-offset-4 hover:bg-muted/60 hover:text-primary"
        >
          {link.label}
        </a>,
      )
      index = link.end
      continue
    }

    if (text[index] === '`') {
      const closeIndex = text.indexOf('`', index + 1)
      if (closeIndex > index + 1) {
        flushText()
        nodes.push(<code key={`${keyPrefix}-code-${index}`} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">{text.slice(index + 1, closeIndex)}</code>)
        index = closeIndex + 1
        continue
      }
    }

    const bareLink = matchBareLinkAt(text, index)
    if (bareLink) {
      flushText()
      nodes.push(
        <a
          key={`${keyPrefix}-bare-link-${index}`}
          href={bareLink.href}
          target="_blank"
          rel="noreferrer"
          data-link-kind={bareLink.kind}
          className="inline-flex items-center rounded-sm px-0.5 underline underline-offset-4 hover:bg-muted/60 hover:text-primary"
        >
          {bareLink.label}
        </a>,
      )
      if (bareLink.trailing)
        nodes.push(bareLink.trailing)
      index = bareLink.end
      continue
    }

    const semantic = matchInlineSemanticAt(text, index)
    if (semantic) {
      flushText()
      nodes.push(
        <code
          key={`${keyPrefix}-semantic-${index}`}
          data-inline-kind={semantic.kind}
          className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
        >
          {semantic.label}
        </code>,
      )
      if (semantic.trailing)
        nodes.push(semantic.trailing)
      index = semantic.end
      continue
    }

    if (isStrongOpener(text, index)) {
      const closeIndex = findStrongCloser(text, index + 2)
      if (closeIndex !== -1) {
        flushText()
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold">
            {renderInlineMarkdown(text.slice(index + 2, closeIndex), `${keyPrefix}-strong-${index}`)}
          </strong>,
        )
        index = closeIndex + 2
        continue
      }
    }

    if (isItalicOpener(text, index)) {
      const closeIndex = findItalicCloser(text, index + 1)
      if (closeIndex !== -1) {
        flushText()
        nodes.push(
          <em key={`${keyPrefix}-em-${index}`}>
            {renderInlineMarkdown(text.slice(index + 1, closeIndex), `${keyPrefix}-em-${index}`)}
          </em>,
        )
        index = closeIndex + 1
        continue
      }
    }

    buffer += text[index]
    index += 1
  }

  flushText()

  return nodes
}

function matchLinkAt(text: string, index: number): { end: number, href: string, kind: string, label: string } | null {
  if (text[index] !== '[')
    return null

  const labelEnd = text.indexOf(']', index + 1)
  if (labelEnd <= index + 1 || text[labelEnd + 1] !== '(')
    return null

  const hrefEnd = text.indexOf(')', labelEnd + 2)
  if (hrefEnd === -1)
    return null

  const href = text.slice(labelEnd + 2, hrefEnd)
  const safe = normalizeAssistantHref(href)
  if (!safe)
    return null

  return {
    end: hrefEnd + 1,
    href: safe,
    label: text.slice(index + 1, labelEnd),
    kind: linkKindForHref(safe),
  }
}

function matchBareLinkAt(text: string, index: number): { end: number, href: string, kind: string, label: string, trailing?: string } | null {
  const previous = text[index - 1]
  if (previous && !isInlineBoundary(previous))
    return null

  const raw = readBareLinkCandidate(text, index)
  if (!raw)
    return null

  const { label, trailing } = splitTrailingPunctuation(raw)
  const href = normalizeAssistantHref(label.startsWith('http') ? label : `http://${label}`)
  if (!href)
    return null

  return {
    end: index + label.length + trailing.length,
    href,
    kind: linkKindForHref(href),
    label,
    trailing,
  }
}

function matchInlineSemanticAt(text: string, index: number): { end: number, kind: 'branch' | 'path', label: string, trailing?: string } | null {
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

  return { end: index + candidate.length, kind, label, trailing }
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

function findStrongCloser(text: string, fromIndex: number): number {
  for (let index = fromIndex; index < text.length - 1; index += 1) {
    if (text[index] !== '*' || text[index + 1] !== '*')
      continue

    const previous = text[index - 1]
    if (previous && previous !== '*' && !/\s/.test(previous) && text[index + 2] !== '*')
      return index
  }

  return -1
}

function findItalicCloser(text: string, fromIndex: number): number {
  for (let index = fromIndex; index < text.length; index += 1) {
    if (text[index] !== '*')
      continue

    const previous = text[index - 1]
    if (previous && previous !== '*' && !/\s/.test(previous) && text[index + 1] !== '*')
      return index
  }

  return -1
}

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
