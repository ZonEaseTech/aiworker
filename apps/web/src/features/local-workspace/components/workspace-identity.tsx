import type { LocalWorkspace } from '@zonease/aiworker-shared'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { Card } from '@zonease/aiworker-component'
import { formatRelativeTime, formatStatus } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function WorkspaceIdentityBlock({
  artifactCount,
  copy,
  locale,
  sessionCount,
  workspace,
}: {
  artifactCount: number
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  sessionCount: number
  workspace: LocalWorkspace
}) {
  return (
    <Card className="worker-identity compact workspace-identity">
      <div className="worker-identity-head">
        <span className="kicker">{copy.workspace.currentWorkspace}</span>
        <strong>{workspace.name}</strong>
      </div>
      <div className="worker-identity-grid">
        <span>{copy.common.workspace}</span>
        <strong>{formatStatus(workspace.status, locale)}</strong>
        <span>{copy.workspace.workspaceSessions}</span>
        <strong>{String(sessionCount)}</strong>
        <span>{copy.artifact.label}</span>
        <strong>{copy.workspace.artifactCount(artifactCount)}</strong>
        <span>{copy.workspace.latest}</span>
        <strong>{copy.workspace.updated(formatRelativeTime(workspace.updatedAt, locale))}</strong>
      </div>
    </Card>
  )
}
