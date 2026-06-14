import type { VerticalSoul } from '../local-workspace/model-types'
import type { BuiltinSoulCopy, StaticMessages, StatusKey, SupportedLocale } from './types'

import { de, en, ja, zhCN } from './locales'
import { supportedLocales } from './types'

export { supportedLocales } from './types'
export type { BuiltinSoulCopy, StaticMessages, SupportedLocale } from './types'

const messagesByLocale: Record<SupportedLocale, StaticMessages> = {
  de,
  en,
  ja,
  'zh-CN': zhCN,
}

export function normalizeLocale(language: string | null | undefined): SupportedLocale {
  return supportedLocales.includes(language as SupportedLocale) ? language as SupportedLocale : 'en'
}

// C2: pick the employee's initial locale. A saved worker setting always wins. Otherwise
// detect from the browser's ordered `navigator.languages` (BCP-47) — exact match (zh-CN)
// first, then base-language match (en-US → en, zh-Hans → zh-CN). When nothing matches, fall
// back to zh-CN rather than en: this is a zh-first product (AGENTS.md 默认中文), so an
// unrecognized browser locale should not silently land an employee on an English chrome.
export function detectInitialLocale(
  savedLanguage: string | null | undefined,
  navigatorLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [],
): SupportedLocale {
  if (savedLanguage && supportedLocales.includes(savedLanguage as SupportedLocale))
    return savedLanguage as SupportedLocale
  for (const lang of navigatorLanguages) {
    if (supportedLocales.includes(lang as SupportedLocale))
      return lang as SupportedLocale
    const base = lang.split('-')[0]?.toLowerCase()
    const match = supportedLocales.find(locale => locale.toLowerCase().split('-')[0] === base)
    if (match)
      return match
  }
  return 'zh-CN'
}

export function messagesFor(language: string | null | undefined): StaticMessages {
  return messagesByLocale[normalizeLocale(language)]
}

export function languageLabel(locale: SupportedLocale, activeLocale: SupportedLocale): string {
  return messagesByLocale[activeLocale].languageOptions[locale]
}

export function displaySoul(soul: VerticalSoul, _locale: SupportedLocale): BuiltinSoulCopy {
  return { description: soul.description, name: soul.name }
}

export function formatStatus(status: string, locale: SupportedLocale): string {
  const messages = messagesByLocale[locale]
  return messages.statuses[status as StatusKey] ?? status.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function formatRelativeTime(value: string, locale: SupportedLocale): string {
  const messages = messagesByLocale[locale]
  const ms = Date.now() - Date.parse(value)
  if (!Number.isFinite(ms) || ms < 0)
    return messages.relativeTime.now
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes < 60)
    return messages.relativeTime.minutesAgo(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 48)
    return messages.relativeTime.hoursAgo(hours)
  return messages.relativeTime.daysAgo(Math.floor(hours / 24))
}
