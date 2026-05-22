// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Toggle } from './toggle'

afterEach(() => cleanup())

describe('shadcn toggle', () => {
  it('uses accent hover and active states from the shared primitive', () => {
    render(<Toggle pressed>Local CLI</Toggle>)

    const toggle = screen.getByRole('button', { name: 'Local CLI' })
    expect(toggle.className).not.toContain('cursor-pointer')
    expect(toggle.className).toContain('hover:bg-accent')
    expect(toggle.className).toContain('aria-pressed:bg-accent')
    expect(toggle.className).toContain('data-[state=on]:bg-accent')
    expect(toggle.className).not.toContain('hover:bg-muted')
  })
})
