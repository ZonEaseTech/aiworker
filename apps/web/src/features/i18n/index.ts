import type { CapabilityTemplate, VerticalSoul } from '../local-workspace/types.compat'
import type { BuiltinSoulCopy, BuiltinTemplateCopy, StaticMessages, StatusKey, SupportedLocale } from './types'

import { builtinSoulCopy, builtinTemplateCopy } from './catalog'
import { de, en, ja, zhCN } from './locales'
import { supportedLocales } from './types'

export { supportedLocales } from './types'
export type { BuiltinSoulCopy, BuiltinTemplateCopy, StaticMessages, SupportedLocale } from './types'

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

export function displaySoul(soul: VerticalSoul, locale: SupportedLocale): BuiltinSoulCopy {
  return builtinSoulCopy[locale][soul.id] ?? { description: soul.description, domain: soul.domain, name: soul.name }
}

export function displayTemplate(template: CapabilityTemplate, locale: SupportedLocale): BuiltinTemplateCopy {
  return builtinTemplateCopy[locale][template.id] ?? {
    description: template.description,
    inputHints: template.inputHints,
    name: template.name,
    outputKind: template.outputKind,
    reviewRubric: template.reviewRubric,
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
