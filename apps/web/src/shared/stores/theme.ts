import { useEffect, useRef } from 'react'
import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type ThemeScope = 'fleet' | 'worker'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const THEME_STORAGE_PREFIX = 'aiworker-theme'
const THEMES = new Set<Theme>(['light', 'dark', 'system'])

export const useThemeStore = create<ThemeState>()(set => ({
  theme: 'system',
  setTheme: theme => set({ theme }),
}))

function getStorageKey(scope: ThemeScope) {
  return `${THEME_STORAGE_PREFIX}:${scope}`
}

function isTheme(value: string | null): value is Theme {
  return value !== null && THEMES.has(value as Theme)
}

function readStoredTheme(scope: ThemeScope): Theme | null {
  const storedTheme = window.localStorage.getItem(getStorageKey(scope))
  return isTheme(storedTheme) ? storedTheme : null
}

function prefersDark() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(theme: Theme) {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme)
  root.dataset.theme = resolvedTheme
  root.dataset.themePreference = theme
}

export function bootstrapTheme(scope: ThemeScope) {
  const theme = readStoredTheme(scope) ?? 'system'
  useThemeStore.setState({ theme })
  applyTheme(theme)
}

export function ThemeInitializer({ scope }: { scope: ThemeScope }) {
  const theme = useThemeStore(s => s.theme)
  const setTheme = useThemeStore(s => s.setTheme)
  const hydratedRef = useRef(false)
  const skipInitialPersistRef = useRef(true)

  useEffect(() => {
    const storedTheme = readStoredTheme(scope)
    if (storedTheme)
      setTheme(storedTheme)
    hydratedRef.current = true
  }, [scope, setTheme])

  useEffect(() => {
    applyTheme(theme)
    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false
    }
    else if (hydratedRef.current) {
      window.localStorage.setItem(getStorageKey(scope), theme)
    }

    if (theme !== 'system' || typeof window.matchMedia !== 'function')
      return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [scope, theme])

  return null
}
