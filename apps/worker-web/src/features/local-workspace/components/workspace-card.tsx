import type { LocalSession, LocalWorkspace } from '@zonease/aiworker-soul-descriptor'
import type { normalizeLocale } from '../../i18n'
import type { WorkspaceCapability } from '../model-types'

import { File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { displayCapability, formatRelativeTime, formatStatus, messagesFor } from '../../i18n'

export function WorkspaceCard({
  active,
  capability,
  item,
  locale,
  onSelect,
  session,
}: {
  active: boolean
  capability?: WorkspaceCapability
  item: LocalWorkspace
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  session: LocalSession | null
}) {
  const copy = messagesFor(locale)
  const capabilityCopy = capability ? displayCapability(capability, locale) : null
  const status = formatStatus(session?.status ?? item.status, locale)
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
            {capabilityCopy?.name ?? session?.capabilityId ?? copy.common.workspace}
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
