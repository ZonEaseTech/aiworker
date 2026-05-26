import type { ReactNode } from 'react'

import { cn } from '#lib/utils'

export interface AssistantMarkdownProps {
  className?: string
  markdown: string
  streaming?: boolean
}

type MarkdownBlock =
  | { code: string, kind: 'code', language?: string }
  | { items: string[], kind: 'ordered-list' | 'unordered-list' }
  | { kind: 'paragraph', text: string }
  | { kind: 'quote', text: string }

export function AssistantMarkdown({ className, markdown, streaming = false }: AssistantMarkdownProps) {
  const repaired = repairStreamingMarkdown(markdown, streaming)
  const blocks = parseMarkdownBlocks(repaired)

  return (
    <div
      data-transcript-slot="assistant-markdown"
      className={cn('min-w-0 space-y-3 text-sm/relaxed text-foreground', className)}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}

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

  const strongCount = (withoutFences.match(/\*\*/g) ?? []).length
  if (strongCount % 2 === 1)
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

    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ kind: 'quote', text: quoteLines.join('\n') })
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ items, kind: 'unordered-list' })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ items, kind: 'ordered-list' })
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length
      && (lines[index] ?? '').trim()
      && !(lines[index] ?? '').startsWith('```')
      && !(lines[index] ?? '').startsWith('>')
      && !/^\s*[-*]\s+/.test(lines[index] ?? '')
      && !/^\s*\d+\.\s+/.test(lines[index] ?? '')
    ) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
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
        <pre className="overflow-x-auto p-3 text-xs/relaxed" dir="ltr"><code>{block.code}</code></pre>
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
      <ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5">
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>)}
      </ol>
    )
  }

  if (block.kind === 'unordered-list') {
    return (
      <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>)}
      </ul>
    )
  }

  if (block.kind === 'paragraph')
    return <p key={`p-${index}`} className="whitespace-pre-wrap">{renderInlineMarkdown(block.text, `p-${index}`)}</p>

  return null
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|(^|[^*])\*([^\s*][^*\n]*?\S)\*(?!\*))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex)
      nodes.push(text.slice(lastIndex, match.index))

    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-primary"
        >
          {match[2]}
        </a>,
      )
    }
    else if (match[4]) {
      nodes.push(<code key={`${keyPrefix}-code-${match.index}`} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]">{match[4]}</code>)
    }
    else if (match[5]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">{match[5]}</strong>)
    }
    else if (match[7]) {
      if (match[6])
        nodes.push(match[6])
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{match[7]}</em>)
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length)
    nodes.push(text.slice(lastIndex))

  return nodes
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

  return !previous || /\s|[([{"']/.test(previous)
}

function isEmphasisContentStart(value: string): boolean {
  return !/[\s!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~-]/.test(value)
}
