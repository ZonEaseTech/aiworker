import type { CapabilityTemplate, LocalArtifact, LocalSession, LocalTurn, LocalWorkspace } from '@zonease/aiworker-shared'
import type { normalizeLocale } from '../../i18n'

import { FileText } from 'lucide-react'
import { displayTemplate, formatRelativeTime, formatStatus, messagesFor } from '../../i18n'

export function ProjectCard({
  active,
  artifact,
  item,
  locale,
  onSelect,
  session,
  template,
  turn,
}: {
  active: boolean
  artifact: LocalArtifact | null
  item: LocalWorkspace
  locale: ReturnType<typeof normalizeLocale>
  onSelect: () => void
  session: LocalSession | null
  template?: CapabilityTemplate
  turn: LocalTurn | null
}) {
  const copy = messagesFor(locale)
  const templateCopy = template ? displayTemplate(template, locale) : null
  const artifactLabel = artifact ? templateCopy?.outputKind ?? artifact.kind : copy.artifact.pending
  return (
    <button type="button" className={`design-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="design-card-thumb" aria-hidden="true">
        <FileText size={22} />
      </div>
      <div className="design-card-meta-block">
        <div className="design-card-name" title={item.name}>{item.name}</div>
        <div className="design-card-meta">
          <span className="ds">{templateCopy?.name ?? session?.capabilityTemplateId ?? copy.common.workspace}</span>
          {` · ${artifactLabel} · `}
          <span className="design-card-status design-card-status-succeeded">{formatStatus(turn?.status ?? session?.status ?? item.status, locale)}</span>
          {` · ${formatRelativeTime(item.updatedAt, locale)}`}
        </div>
      </div>
    </button>
  )
}
