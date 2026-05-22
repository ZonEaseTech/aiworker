// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SidebarMenuButton } from './sidebar'

afterEach(() => cleanup())

describe('shadcn sidebar', () => {
  it('allows menu buttons inside Host-managed sidebar layouts', () => {
    render(<SidebarMenuButton isActive>Platform settings</SidebarMenuButton>)

    const button = screen.getByRole('button', { name: 'Platform settings' })
    expect(button.getAttribute('data-slot')).toBe('sidebar-menu-button')
    expect(button.getAttribute('data-sidebar')).toBe('menu-button')
    expect(button.getAttribute('data-active')).toBe('true')
    expect(button.className).toContain('hover:bg-sidebar-accent')
    expect(button.className).not.toContain('cursor-pointer')
  })
})
