import type { CapabilityTemplate, LocalSession, LocalTurn } from '@zonease/aiworker-shared'
import type { normalizeLocale } from '../../i18n'

import { ActionCard } from '@zonease/aiworker-component'
import { FileText } from 'lucide-react'
import { displayTemplate, formatRelativeTime, formatStatus, messagesFor } from '../../i18n'

export function WorkspaceSessionCard({
  active,
  locale,
  onSelect,
  session,
  template,
  turn,
}: {
  active: boolean
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  session: LocalSession
  template?: CapabilityTemplate
  turn: LocalTurn | null
}) {
  const copy = messagesFor(locale)
  const templateCopy = template ? displayTemplate(template, locale) : null
  return (
    <ActionCard active={active} className="design-card workspace-session-card" onClick={onSelect}>
      <div className="design-card-thumb" aria-hidden="true">
        <FileText size={22} />
      </div>
      <div className="design-card-meta-block">
        <div className="design-card-name" title={session.title}>{session.title}</div>
        <div className="design-card-meta">
          <span className="ds">{templateCopy?.name ?? session.capabilityTemplateId}</span>
          {` · ${copy.workspace.turnCount(turn?.seq ?? 0)} · `}
          <span className="design-card-status design-card-status-succeeded">{formatStatus(turn?.status ?? session.status, locale)}</span>
          {` · ${formatRelativeTime(session.updatedAt, locale)}`}
        </div>
      </div>
    </ActionCard>
  )
}
