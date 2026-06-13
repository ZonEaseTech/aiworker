// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AssistantMarkdown, repairStreamingMarkdown } from './assistant-markdown'

afterEach(() => cleanup())

// Focused renderer tests for the react-markdown-backed AssistantMarkdown.
// They pin the WWB-1 bug flow (CJK bold boundary, ordered-list numbering, list
// keys, glob/globstar misjudgement, streaming half-fence) plus the AIWorker
// behaviours that have no native remark-gfm equivalent (href whitelist,
// scheme-less loopback autolink, inline path/branch semantic tokens).
describe('assistant markdown — react-markdown renderer', () => {
  it('renders strong emphasis after a CJK fullwidth colon without a space', () => {
    const { container } = render(
      <AssistantMarkdown markdown="按这个约束：**当前 workspace root 就是主战场**，其余只读。" />,
    )

    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('当前 workspace root 就是主战场')
    // The trailing CJK comma must stay outside the strong run.
    expect(container.textContent).toContain('，其余只读。')
  })

  it('keeps adjacent CJK emphasis runs from bleeding into each other', () => {
    const { container } = render(
      <AssistantMarkdown markdown="**第一项**和**第二项**都要做。" />,
    )

    const strongs = [...container.querySelectorAll('strong')]
    expect(strongs.map(node => node.textContent)).toEqual(['第一项', '第二项'])
  })

  it('renders a half-finished streaming code fence as a closed code block', () => {
    // bridge passes streaming=true; the repair closes the dangling fence.
    expect(repairStreamingMarkdown('```ts\nconst value = 1', true)).toBe('```ts\nconst value = 1\n```')

    render(<AssistantMarkdown markdown={['```ts', 'const value = 1'].join('\n')} streaming />)
    const codeBlock = screen.getByTestId('assistant-code-block')
    expect(within(codeBlock).getByText('const value = 1')).toBeTruthy()
    // Language caption is preserved.
    expect(within(codeBlock).getByText('ts')).toBeTruthy()
  })

  it('renders a GFM table with header and body cells', () => {
    render(
      <AssistantMarkdown
        markdown={[
          '| 文件 | 状态 |',
          '|---|---|',
          '| docs/runtime.md | ok |',
          '| docs/protocol.md | 待更新 |',
        ].join('\n')}
      />,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByText('文件')).toBeTruthy()
    expect(within(table).getByText('待更新')).toBeTruthy()
    // Table is wrapped in a horizontally scrollable container without scrollbar chrome.
    expect(table.parentElement?.className).toContain('no-scrollbar')
  })

  it('preserves ordered-list numbering across interrupting blocks', () => {
    const { container } = render(
      <AssistantMarkdown
        markdown={[
          '1. 第一步',
          '',
          '- 说明 A',
          '',
          '2. 第二步',
          '',
          '- 说明 B',
          '',
          '3. 第三步',
        ].join('\n')}
      />,
    )

    const orderedLists = [...container.querySelectorAll('ol')]
    expect(orderedLists).toHaveLength(3)
    // First list omits an explicit start (defaults to 1); the resumed lists keep their number.
    expect(orderedLists.map(list => list.getAttribute('start'))).toEqual([null, '2', '3'])
  })

  it('assigns stable React keys to list items so reordering does not warn', () => {
    // A render that mutates list content between passes would surface key
    // collisions as React warnings; assert the items render uniquely instead.
    const { container, rerender } = render(
      <AssistantMarkdown markdown={['- alpha', '- beta', '- gamma'].join('\n')} />,
    )
    expect([...container.querySelectorAll('li')].map(li => li.textContent)).toEqual(['alpha', 'beta', 'gamma'])

    rerender(<AssistantMarkdown markdown={['- alpha', '- beta', '- gamma', '- delta'].join('\n')} />)
    expect([...container.querySelectorAll('li')].map(li => li.textContent)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })

  it('does not misrender glob/globstar wildcards as emphasis', () => {
    const { container } = render(
      <AssistantMarkdown markdown="匹配 **/*.ts 和 src/** 以及 **/node_modules/** 和 *.tsx。" />,
    )

    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('em')).toBeNull()
    expect(container.textContent).toContain('**/*.ts')
    expect(container.textContent).toContain('src/**')
    expect(container.textContent).toContain('**/node_modules/**')
    expect(container.textContent).toContain('*.tsx')
  })

  it('still renders genuine bold next to glob patterns', () => {
    const { container } = render(
      <AssistantMarkdown markdown="**重要**：忽略 **/dist/** 目录。" />,
    )

    expect(container.querySelector('strong')?.textContent).toBe('重要')
    expect(container.textContent).toContain('**/dist/**')
  })

  it('does not escape globstars inside inline code', () => {
    render(<AssistantMarkdown markdown="用 `rm -rf **/dist` 清理。" />)

    expect(screen.getByText('rm -rf **/dist').tagName).toBe('CODE')
  })

  it('only links http/https hrefs and drops javascript: and other schemes', () => {
    const { container } = render(
      <AssistantMarkdown
        markdown={[
          '[safe](https://example.com)',
          '',
          '[xss](javascript:alert(1))',
          '',
          '[mailto](mailto:nobody@example.com)',
        ].join('\n')}
      />,
    )

    const safe = screen.getByRole('link', { name: 'safe' })
    expect(safe.getAttribute('href')).toBe('https://example.com')
    expect(safe.getAttribute('rel')).toBe('noreferrer')
    expect(safe.getAttribute('target')).toBe('_blank')

    // Disallowed schemes are neutralised: their anchors carry no dangerous href.
    for (const anchor of container.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') ?? ''
      expect(href.startsWith('javascript:')).toBe(false)
      expect(href.startsWith('mailto:')).toBe(false)
    }
  })

  it('autolinks scheme-less loopback host:port references', () => {
    render(<AssistantMarkdown markdown="打开 localhost:5173 或 127.0.0.1:9217 查看。" />)

    const localhost = screen.getByRole('link', { name: 'localhost:5173' })
    expect(localhost.getAttribute('href')).toBe('http://localhost:5173')
    expect(localhost.getAttribute('data-link-kind')).toBe('localhost')

    const loopback = screen.getByRole('link', { name: '127.0.0.1:9217' })
    expect(loopback.getAttribute('data-link-kind')).toBe('localhost')
  })

  it('renders inline path and branch semantic tokens', () => {
    render(
      <AssistantMarkdown markdown="编辑 docs/runtime.md 后切到 branch codex/refactor。" />,
    )

    expect(screen.getByText('docs/runtime.md').getAttribute('data-inline-kind')).toBe('path')
    expect(screen.getByText('docs/runtime.md').tagName).toBe('CODE')
    expect(screen.getByText('codex/refactor').getAttribute('data-inline-kind')).toBe('branch')
  })

  it('does not produce raw HTML elements from html-like markdown input', () => {
    const { container } = render(
      <AssistantMarkdown markdown={'<img src=x onerror="alert(1)">\n\n<b>not bold</b>'} />,
    )

    // skipHtml is on: no element is constructed from the literal HTML.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('gives GFM task checkboxes an accessible name from their item text', () => {
    render(
      <AssistantMarkdown
        markdown={[
          '- [x] 已完成的任务',
          '- [ ] 待办任务',
        ].join('\n')}
      />,
    )

    expect((screen.getByRole('checkbox', { name: '已完成的任务' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: '待办任务' }) as HTMLInputElement).checked).toBe(false)
  })
})
