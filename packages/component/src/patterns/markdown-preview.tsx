import type { HTMLAttributes, ReactNode } from 'react'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cx } from '../utils/cx'

export interface MarkdownPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string
  empty?: ReactNode
}

export function MarkdownPreview({
  className,
  content,
  empty = null,
  ...props
}: MarkdownPreviewProps) {
  const normalizedContent = content.trim()

  if (!normalizedContent) {
    return (
      <div {...props} className={cx('markdown-preview', 'markdown-preview-empty', className)}>
        {empty}
      </div>
    )
  }

  return (
    <div {...props} className={cx('markdown-preview', className)}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml>
        {normalizedContent}
      </Markdown>
    </div>
  )
}
