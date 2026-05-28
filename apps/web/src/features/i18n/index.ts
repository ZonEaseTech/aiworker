import type { VerticalSoul, WorkspaceCapability } from '../local-workspace/model-types'
import type { BuiltinCapabilityCopy, BuiltinSoulCopy, StaticMessages, StatusKey, SupportedLocale } from './types'

import { de, en, ja, zhCN } from './locales'
import { supportedLocales } from './types'

export { supportedLocales } from './types'
export type { BuiltinCapabilityCopy, BuiltinSoulCopy, StaticMessages, SupportedLocale } from './types'

const messagesByLocale: Record<SupportedLocale, StaticMessages> = {
  de,
  en,
  ja,
  'zh-CN': zhCN,
}

export function normalizeLocale(language: string | null | undefined): SupportedLocale {
  return supportedLocales.includes(language as SupportedLocale) ? language as SupportedLocale : 'en'
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

export function displayCapability(capability: WorkspaceCapability, _locale: SupportedLocale): BuiltinCapabilityCopy {
  return {
    description: capability.description,
    inputHints: capability.inputHints,
    name: capability.name,
    outputKind: capability.outputKind,
  }
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
