// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StreamingPlaceholder } from './streaming-placeholder'

afterEach(() => cleanup())

describe('StreamingPlaceholder', () => {
  it('renders a stable polite loading placeholder', () => {
    render(<StreamingPlaceholder label="Preparing response" />)

    const status = screen.getByRole('status', { name: 'Preparing response' })
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.className).toContain('min-h-')
    expect(screen.getByText('Preparing response')).toBeTruthy()
    expect(status.closest('[data-transcript-slot="streaming-placeholder"]')).toBeTruthy()
  })
})
