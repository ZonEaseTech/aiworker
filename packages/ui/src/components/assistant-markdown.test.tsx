// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AssistantMarkdown, repairStreamingMarkdown } from './assistant-markdown'

afterEach(() => cleanup())

describe('assistant markdown', () => {
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

  it('marks streaming markdown with a subtle breathing tail instead of a caret cursor', () => {
    const { container } = render(<AssistantMarkdown markdown="Streaming answer" streaming />)

    const markdown = container.querySelector('[data-transcript-slot="assistant-markdown"]')
    expect(markdown?.getAttribute('data-streaming')).toBe('true')
    expect(markdown?.className).toContain('after:animate-pulse')
    expect(markdown?.className).toContain('after:rounded-full')
    expect(markdown?.className).not.toContain('after:animate-caret-blink')
    expect(markdown?.className).not.toContain('after:w-px')
    expect(markdown?.className).toContain('motion-safe:animate-in')
    expect(screen.getByText('Streaming answer')).toBeTruthy()
  })

  it('keeps wide code and table overflow scrollable without visible scrollbar chrome', () => {
    const { container } = render(
      <AssistantMarkdown
        markdown={[
          '```ts',
          'const value = "a very long code line that can overflow horizontally when needed"',
          '```',
          '',
          '| Wide | Value |',
          '|---|---|',
          '| command | bun run --filter @zonease/aiworker-worker-web test |',
        ].join('\n')}
      />,
    )

    const codeScroller = container.querySelector('[data-testid="assistant-code-block"] pre')
    const tableScroller = screen.getByRole('table').parentElement
    expect(codeScroller?.className).toContain('no-scrollbar')
    expect(tableScroller?.className).toContain('no-scrollbar')
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

  it('renders P0 rich transcript blocks without breaking nested or task lists', () => {
    const { container } = render(
      <AssistantMarkdown
        markdown={[
          '## Plan',
          '',
          '- parent',
          '  - child',
          '- [x] verified',
          '- [ ] pending',
          '',
          '| File | Status |',
          '|---|---|',
          '| docs/runtime.md | ok |',
        ].join('\n')}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeTruthy()
    expect(screen.getByText('child').closest('li')?.getAttribute('data-list-depth')).toBe('1')
    expect((screen.getByRole('checkbox', { name: 'verified' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'pending' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(container.textContent).toContain('docs/runtime.md')
  })

  it('preserves ordered list numbering when interrupted by nested content blocks', () => {
    const { container } = render(
      <AssistantMarkdown
        markdown={[
          '1. 会话身份',
          '',
          '- Soul worker: `w_kzqxxh894fbn`',
          '',
          '2. 工作区',
          '',
          '- 当前目录是 workspace',
          '',
          '3. 可用能力',
        ].join('\n')}
      />,
    )

    const orderedLists = [...container.querySelectorAll('ol')]
    expect(orderedLists).toHaveLength(3)
    expect(orderedLists.map(list => list.getAttribute('start'))).toEqual([null, '2', '3'])
  })

  it('renders safe typed links and inline semantic tokens for paths and commands', () => {
    render(
      <AssistantMarkdown markdown="Open http://localhost:5173 and see `bun test`, docs/runtime.md, branch codex/refactor." />,
    )

    const link = screen.getByRole('link', { name: 'http://localhost:5173' })
    expect(link.getAttribute('href')).toBe('http://localhost:5173')
    expect(link.getAttribute('data-link-kind')).toBe('localhost')
    expect(screen.getByText('bun test').tagName).toBe('CODE')
    expect(screen.getByText('docs/runtime.md').getAttribute('data-inline-kind')).toBe('path')
    expect(screen.getByText('codex/refactor').getAttribute('data-inline-kind')).toBe('branch')
  })
})
