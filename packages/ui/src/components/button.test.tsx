// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from './button'

afterEach(() => cleanup())

describe('shadcn button', () => {
  it('renders the generated button with variant metadata', () => {
    render(<Button variant="secondary">Create workspace</Button>)

    const button = screen.getByRole('button', { name: 'Create workspace' })
    expect(button.getAttribute('data-slot')).toBe('button')
    expect(button.getAttribute('data-variant')).toBe('secondary')
  })

  it('does not override nested shadcn slot colors inside buttons', () => {
    render(<Button variant="secondary"><span data-slot="badge">Active</span></Button>)

    const button = screen.getByRole('button', { name: 'Active' })
    expect(button.className).toContain('[&>span:not([data-slot])]:text-secondary-foreground')
    expect(button.className).not.toContain('[&>span]:text-secondary-foreground')
  })

  it('keeps hover styles in the shared primitive and leaves pressed visuals to variants', () => {
    render(<Button variant="ghost" aria-pressed="true">Open panel</Button>)

    const button = screen.getByRole('button', { name: 'Open panel' })
    expect(button.className).toContain('hover:bg-muted')
    expect(button.className).not.toContain('aria-pressed:bg-accent')
    expect(button.className).not.toContain('cursor-pointer')
  })

  it('emits icon size selectors that Tailwind can match at runtime', () => {
    render(<Button size="icon">Icon action</Button>)

    const button = screen.getByRole('button', { name: 'Icon action' })
    expect(button.className).toContain('[&_svg:not([class*=size-])]:size-3.5')
    expect(button.className).not.toMatch(/\[class\*='size-'\]/)
    expect(button.className).not.toMatch(/\[class\*=\\'size-\\'\]/)
  })
})
