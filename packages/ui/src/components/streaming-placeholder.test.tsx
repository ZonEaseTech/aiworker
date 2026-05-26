// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StreamingPlaceholder } from './streaming-placeholder'

afterEach(() => cleanup())

describe('streaming placeholder', () => {
  it('renders a stable polite loading placeholder', () => {
    render(<StreamingPlaceholder label="Preparing response" />)

    const status = screen.getByRole('status', { name: 'Preparing response' })
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.className).toContain('min-h-')
    expect(screen.getByText('Preparing response')).toBeTruthy()
    expect(status.closest('[data-transcript-slot="streaming-placeholder"]')).toBeTruthy()
  })

  it('uses explicit aria label for non-string visible labels', () => {
    render(<StreamingPlaceholder ariaLabel="Preparing rich response" label={<span>Preparing rich response</span>} />)

    const status = screen.getByRole('status', { name: 'Preparing rich response' })
    expect(status.getAttribute('aria-label')).toBe('Preparing rich response')
    expect(screen.getByText('Preparing rich response')).toBeTruthy()
  })

  it('does not set a fixed aria label for non-string visible labels', () => {
    render(<StreamingPlaceholder label={<span>Preparing visible response</span>} />)

    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-label')).toBeNull()
    expect(screen.getByText('Preparing visible response')).toBeTruthy()
  })
})
