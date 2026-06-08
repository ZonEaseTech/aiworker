import { useSyncExternalStore } from 'react'

export type ResolvedTheme = 'dark' | 'light'

const themeMediaQuery = '(prefers-color-scheme: dark)'

export function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, readSystemTheme, () => 'light')
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {}
  const media = window.matchMedia(themeMediaQuery)
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }
  media.addListener(onChange)
  return () => media.removeListener(onChange)
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'light'
  return window.matchMedia(themeMediaQuery).matches ? 'dark' : 'light'
}

export function resolveTheme(appearance: 'dark' | 'light' | 'system', systemTheme: ResolvedTheme): ResolvedTheme {
  return appearance === 'system' ? systemTheme : appearance
}
