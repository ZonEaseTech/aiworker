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

  it('does not treat whitespace-delimited asterisks as italic markdown', () => {
    const { container } = render(<AssistantMarkdown markdown="2 * 3 = 6 * 1" />)

    expect(screen.getByText('2 * 3 = 6 * 1')).toBeTruthy()
    expect(container.querySelector('em')).toBeNull()
  })

  it('does not repair ordinary single asterisks while streaming', () => {
    expect(repairStreamingMarkdown('2 * 3 = 6', true)).toBe('2 * 3 = 6')
    expect(repairStreamingMarkdown('* first', true)).toBe('* first')
    expect(repairStreamingMarkdown('Use * as wildcard', true)).toBe('Use * as wildcard')
    expect(repairStreamingMarkdown('Use foo* wildcard', true)).toBe('Use foo* wildcard')
    expect(repairStreamingMarkdown('Use *.ts wildcard', true)).toBe('Use *.ts wildcard')
    expect(repairStreamingMarkdown('glob *.ts', true)).toBe('glob *.ts')
    expect(repairStreamingMarkdown('*italic', true)).toBe('*italic*')
  })

  it('does not repair globstar wildcards as bold markdown while streaming', () => {
    expect(repairStreamingMarkdown('glob **/*.ts', true)).toBe('glob **/*.ts')
    expect(repairStreamingMarkdown('src/**', true)).toBe('src/**')
    expect(repairStreamingMarkdown('**/*.{ts,tsx}', true)).toBe('**/*.{ts,tsx}')
    expect(repairStreamingMarkdown('**bold', true)).toBe('**bold**')
  })

  it('does not render suffix wildcard asterisks as italic markdown', () => {
    const { container } = render(<AssistantMarkdown markdown="Use foo* wildcard" />)

    expect(screen.getByText('Use foo* wildcard')).toBeTruthy()
    expect(container.querySelector('em')).toBeNull()
  })

  it('does not render globstar wildcards as bold markdown', () => {
    const { container } = render(<AssistantMarkdown markdown="glob **/*.ts and **/node_modules/** and **/dist/**" />)

    expect(screen.getByText('glob **/*.ts and **/node_modules/** and **/dist/**')).toBeTruthy()
    expect(container.querySelector('strong')).toBeNull()
  })
})
