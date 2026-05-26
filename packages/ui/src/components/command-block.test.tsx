// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommandBlock } from './command-block'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CommandBlock', () => {
  it('renders command metadata and code surfaces', () => {
    render(<CommandBlock command="bun test" language="bash" output="ok" status="running" title="Run tests" />)

    expect(screen.getByText('Run tests')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()

    const command = screen.getByTestId('command-command')
    const output = screen.getByTestId('command-output')
    expect(command.textContent).toBe('bun test')
    expect(command.getAttribute('dir')).toBe('ltr')
    expect(output.textContent).toBe('ok')
    expect(output.getAttribute('dir')).toBe('ltr')
    expect(output.closest('[data-transcript-slot="command-block"]')).toBeTruthy()
  })

  it('collapses and expands command output', () => {
    render(<CommandBlock command="bun test" output="ok" />)

    expect(screen.getByTestId('command-output')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse command output' }))
    expect(screen.queryByTestId('command-output')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand command output' }))
    expect(screen.getByTestId('command-output')).toBeTruthy()
  })

  it('copies command text and toggles wrapping for command and output', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<CommandBlock command="rg SessionThread packages/ui" output="match" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    expect(writeText).toHaveBeenCalledWith('rg SessionThread packages/ui')

    fireEvent.click(screen.getByRole('button', { name: 'Wrap command output' }))
    expect(screen.getByTestId('command-command').getAttribute('data-transcript-wrapped')).toBe('true')
    expect(screen.getByTestId('command-output').getAttribute('data-transcript-wrapped')).toBe('true')
  })

  it('marks failed commands while keeping output evidence visible', () => {
    render(<CommandBlock command="bun test" defaultExpanded={false} output="failed" status="failed" />)

    expect(screen.getAllByText('failed').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('command-output').textContent).toBe('failed')
    expect(screen.getByTestId('command-output').closest('[data-transcript-command-status="failed"]')).toBeTruthy()
  })
})
