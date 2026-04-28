import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { ThemeInitializer, useThemeStore } from './theme'

describe('theme store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-preference')
    useThemeStore.setState({ theme: 'system' })
  })

  it('hydrates the selected fleet theme from the fleet storage key', async () => {
    window.localStorage.setItem('aiworker-theme:fleet', 'dark')
    window.localStorage.setItem('aiworker-theme:worker', 'light')

    render(<ThemeInitializer scope="fleet" />)

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(document.documentElement.dataset.themePreference).toBe('dark')
    })
  })

  it('keeps worker theme persistence separate from fleet', async () => {
    window.localStorage.setItem('aiworker-theme:fleet', 'dark')
    window.localStorage.setItem('aiworker-theme:worker', 'light')

    render(<ThemeInitializer scope="worker" />)

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.dataset.themePreference).toBe('light')
    })
  })

  it('cycles predictably through system, light, and dark', async () => {
    render(
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Theme: System' }))
    expect(useThemeStore.getState().theme).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Theme: Light' }))
    expect(useThemeStore.getState().theme).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Theme: Dark' }))
    expect(useThemeStore.getState().theme).toBe('system')
  })

  it('persists toggle changes to the active bundle storage key', async () => {
    render(
      <TooltipProvider>
        <ThemeInitializer scope="fleet" />
        <ThemeToggle />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Theme: System' }))

    await waitFor(() => {
      expect(window.localStorage.getItem('aiworker-theme:fleet')).toBe('light')
      expect(window.localStorage.getItem('aiworker-theme:worker')).toBeNull()
    })
  })
})
