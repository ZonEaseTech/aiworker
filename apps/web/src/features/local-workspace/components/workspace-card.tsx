import type { LocalSession, LocalTurn, LocalWorkspace } from '@zonease/aiworker-shared'
import type { normalizeLocale } from '../../i18n'
import type { CapabilityTemplate } from '../types.compat'

import { File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { displayTemplate, formatRelativeTime, formatStatus, messagesFor } from '../../i18n'

export function WorkspaceCard({
  active,
  item,
  locale,
  onSelect,
  session,
  template,
  turn,
}: {
  active: boolean
  item: LocalWorkspace
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  session: LocalSession | null
  template?: CapabilityTemplate
  turn: LocalTurn | null
}) {
  const copy = messagesFor(locale)
  const templateCopy = template ? displayTemplate(template, locale) : null
  const status = formatStatus(turn?.status ?? session?.status ?? item.status, locale)
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="lg"
      className="h-auto min-h-28 w-full min-w-0 flex-col items-stretch justify-between gap-3 p-3 whitespace-normal"
      aria-pressed={active}
      onClick={onSelect}
    >
      <ItemActions className="min-w-0 items-start gap-3">
        <ItemMedia variant="icon" aria-hidden="true">
          <HugeiconsIcon icon={File02Icon} strokeWidth={2} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full" title={item.name}>{item.name}</ItemTitle>
          <ItemDescription className="max-w-full">
            {templateCopy?.name ?? session?.capabilityTemplateId ?? copy.common.workspace}
          </ItemDescription>
        </ItemContent>
      </ItemActions>
      <ItemActions className="min-w-0 justify-between gap-2">
        <Badge variant={active ? 'default' : 'outline'}>{status}</Badge>
        <ItemDescription asChild className="max-w-full truncate">
          <span>{formatRelativeTime(item.updatedAt, locale)}</span>
        </ItemDescription>
      </ItemActions>
    </Button>
  )
}
