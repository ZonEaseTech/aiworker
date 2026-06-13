// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionComposerDock } from './session-composer-dock'

const labels = {
  ariaLabel: 'Message composer',
  attachment: {
    add: 'Add',
    attached: 'Attached',
    closePreview: (name: string) => `Close ${name}`,
    materialReadError: 'Could not read material',
    preview: (name: string) => `Preview ${name}`,
    remove: (name: string) => `Remove ${name}`,
  },
  stop: 'Stop',
  stopAriaLabel: 'Stop generating',
  submitAriaLabel: 'Send message',
}

afterEach(() => cleanup())

describe('session composer dock', () => {
  it('keeps the input usable while a running invocation exposes a stop control', () => {
    const onCancel = vi.fn()
    render(<SessionComposerDock labels={labels} onCancel={onCancel} onSubmitDraft={vi.fn()} status="running" />)

    const textbox = screen.getByRole('textbox', { name: 'Message composer' }) as HTMLTextAreaElement
    expect(textbox.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps running state quiet without explanatory console copy', () => {
    render(<SessionComposerDock labels={labels} onCancel={vi.fn()} onSubmitDraft={vi.fn()} status="running" />)

    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Invocation is running')
    expect(document.body.textContent).not.toContain('You can prepare the next message')
  })

  it('does not expose model, permission, or context controls in the dock', () => {
    render(<SessionComposerDock labels={labels} onSubmitDraft={vi.fn()} status="completed" />)

    expect(document.querySelector('[data-session-composer-dock="true"]')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/model|permission|context remaining/i)
  })
})
