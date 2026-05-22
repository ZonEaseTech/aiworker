import type { HTMLAttributes, ReactNode } from 'react'
import type { Components } from 'react-markdown'

import { ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@zonease/aiworker-ui/components/table'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface MarkdownPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string
  empty?: ReactNode
}

const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <ItemTitle asChild size="base" className="mb-2 line-clamp-none max-w-full">
      <h1 {...props} />
    </ItemTitle>
  ),
  h2: ({ node: _node, ...props }) => (
    <ItemTitle asChild size="base" className="mb-2 line-clamp-none max-w-full">
      <h2 {...props} />
    </ItemTitle>
  ),
  h3: ({ node: _node, ...props }) => (
    <ItemTitle asChild size="sm" className="mb-2 line-clamp-none max-w-full">
      <h3 {...props} />
    </ItemTitle>
  ),
  p: ({ node: _node, className, ...props }) => <p data-slot="markdown-paragraph" className={cn('mb-3', className)} {...props} />,
  ul: ({ node: _node, className, ...props }) => <ul data-slot="markdown-list" className={cn('mb-3 pl-5', className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => <ol data-slot="markdown-list" className={cn('mb-3 pl-5', className)} {...props} />,
  code: ({ node: _node, className, ...props }) => <code data-slot="markdown-code" className={cn('text-xs', className)} {...props} />,
  table: ({ node: _node, ...props }) => <Table {...props} />,
  thead: ({ node: _node, ...props }) => <TableHeader {...props} />,
  tbody: ({ node: _node, ...props }) => <TableBody {...props} />,
  tr: ({ node: _node, ...props }) => <TableRow {...props} />,
  th: ({ node: _node, ...props }) => <TableHead className="whitespace-normal break-words align-top" {...props} />,
  td: ({ node: _node, ...props }) => <TableCell className="whitespace-normal break-words align-top" {...props} />,
}

const markdownPreviewClassName = 'min-h-0 min-w-0 max-w-full overflow-x-auto text-sm/relaxed'

export function MarkdownPreview({
  className,
  content,
  empty = null,
  ...props
}: MarkdownPreviewProps) {
  const normalizedContent = content.trim()

  if (!normalizedContent) {
    return (
      <div {...props} data-slot="markdown-preview" data-empty="true" className={cn(markdownPreviewClassName, className)}>
        {empty}
      </div>
    )
  }

  return (
    <div {...props} data-slot="markdown-preview" className={cn(markdownPreviewClassName, className)}>
      <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {normalizedContent}
      </Markdown>
    </div>
  )
}
