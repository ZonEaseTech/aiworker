// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AssistantMarkdown, repairStreamingMarkdown } from './assistant-markdown'

afterEach(() => cleanup())

describe('AssistantMarkdown', () => {
  it('renders common assistant markdown syntax', () => {
    render(
      <AssistantMarkdown
        markdown={[
          'Hello **bold** and *italic* with `inline` code.',
          '',
          '- first',
          '- second',
          '',
          '1. one',
          '2. two',
          '',
          '> quoted',
          '',
          '[docs](https://example.com)',
          '',
          '```ts',
          'const value = 1',
          '```',
        ].join('\n')}
      />,
    )

    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('inline').tagName).toBe('CODE')
    expect(screen.getAllByRole('list').map(list => list.tagName)).toEqual(['UL', 'OL'])
    expect(screen.getByText('quoted')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'docs' }).getAttribute('href')).toBe('https://example.com')
    expect(within(screen.getByTestId('assistant-code-block')).getByText('const value = 1')).toBeTruthy()
  })

  it('repairs incomplete streaming fences before rendering', () => {
    expect(repairStreamingMarkdown('```ts\nconst value = 1', true)).toBe('```ts\nconst value = 1\n```')
    expect(repairStreamingMarkdown('**bold', true)).toBe('**bold**')
    expect(repairStreamingMarkdown('*italic', true)).toBe('*italic*')
    expect(repairStreamingMarkdown('`inline', true)).toBe('`inline`')
  })
})
