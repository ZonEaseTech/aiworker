import type { LocalWorker } from '@zonease/aiworker-soul-protocol'
import type { displaySoul, messagesFor, normalizeLocale } from '../../i18n'
import type { VerticalSoul } from '../model-types'

import { Card } from '@zonease/aiworker-ui/components/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import { formatStatus } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function WorkerIdentityBlock({
  compact = false,
  copy,
  locale,
  soul,
  soulCopy,
  worker,
}: {
  compact?: boolean
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  soul: VerticalSoul
  soulCopy: ReturnType<typeof displaySoul>
  worker: LocalWorker | null
}) {
  return (
    <Card
      data-testid="worker-identity-card"
      size="sm"
      className={cn('min-w-0 gap-3 p-3', compact && 'gap-2 p-2.5')}
    >
      <Item variant="default" size="xs" className="px-0 py-0">
        <ItemContent>
          <ItemDescription>{copy.workspace.currentWorker}</ItemDescription>
          <ItemTitle className="max-w-full">{worker?.name ?? copy.workspace.noWorker}</ItemTitle>
        </ItemContent>
      </Item>
      <ItemGroup className="gap-1">
        <WorkerIdentityRow label={copy.workspace.workerId} value={worker?.id ?? '-'} />
        <WorkerIdentityRow label={copy.workspace.workerStatus} value={worker ? formatStatus(worker.status, locale) : copy.workspace.noWorker} />
        <WorkerIdentityRow label={copy.workspace.workerEngine} value={worker?.defaultEngineId ?? '-'} />
        <WorkerIdentityRow label={copy.workspace.workerSoul} value={`${soulCopy.name} / ${soul.id}`} />
      </ItemGroup>
    </Card>
  )
}

function WorkerIdentityRow({ label, value }: { label: string, value: string }) {
  return (
    <Item variant="default" size="xs" className="flex items-baseline justify-between gap-2.5 px-0 py-0">
      <ItemDescription className="line-clamp-1 shrink-0">{label}</ItemDescription>
      <ItemTitle className="ml-auto max-w-full">{value}</ItemTitle>
    </Item>
  )
}
