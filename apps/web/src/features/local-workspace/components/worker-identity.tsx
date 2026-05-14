import type { LocalWorker, VerticalSoul } from '@zonease/aiworker-shared'
import type { displaySoul, messagesFor, normalizeLocale } from '../../i18n'

import { Card } from '@zonease/aiworker-component'
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
    <Card className={`worker-identity ${compact ? 'compact' : ''}`}>
      <div className="worker-identity-head">
        <span className="kicker">{copy.workspace.currentWorker}</span>
        <strong>{worker?.name ?? copy.workspace.noWorker}</strong>
      </div>
      <div className="worker-identity-grid">
        <span>{copy.workspace.workerId}</span>
        <strong>{worker?.id ?? '-'}</strong>
        <span>{copy.workspace.workerStatus}</span>
        <strong>{worker ? formatStatus(worker.status, locale) : copy.workspace.noWorker}</strong>
        <span>{copy.workspace.workerEngine}</span>
        <strong>{worker?.defaultEngineId ?? '-'}</strong>
        <span>{copy.workspace.workerSoul}</span>
        <strong>{`${soulCopy.name} / ${soul.id}`}</strong>
      </div>
    </Card>
  )
}
