import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownPreview } from './markdown-preview'

describe('markdownPreview', () => {
  it('owns the shadcn markdown surface classes and table slots by default', () => {
    render(
      <MarkdownPreview
        content={[
          '## Profile README',
          '',
          '| Source | Relevance |',
          '| --- | --- |',
          '| README.md | Accepted profile state |',
        ].join('\n')}
      />,
    )

    const preview = screen.getByText('Profile README').closest('[data-slot="markdown-preview"]')
    expect(preview).toBeTruthy()
    expect(preview?.className).toContain('text-sm/relaxed')
    expect(preview?.className).not.toContain('text-foreground')
    expect(preview?.className).not.toContain('[&_')
    expect(preview?.className).not.toContain('font-mono')
    expect(screen.getByText('Profile README').getAttribute('data-slot')).toBe('item-title')
    expect(screen.getByText('Source').getAttribute('data-slot')).toBe('table-head')
    expect(screen.getByText('README.md').getAttribute('data-slot')).toBe('table-cell')
  })
})
