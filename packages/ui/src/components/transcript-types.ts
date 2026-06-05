import type { ReactNode } from 'react'

export type TranscriptTone = 'danger' | 'info' | 'muted' | 'warning'
export type TranscriptActivityStatus = 'failed' | 'idle' | 'running' | 'succeeded' | 'waiting'
export type TranscriptStepProvenance = 'engine' | 'optimistic'

export interface TranscriptArtifactModel {
  action?: ReactNode
  description?: ReactNode
  href?: string
  id: string
  status?: ReactNode
  title: ReactNode
}

export interface TranscriptCommandModel {
  command: string
  id?: string
  language?: string
  output?: string
  status?: TranscriptActivityStatus
  title?: ReactNode
}

export type TranscriptResourceKind = 'browser' | 'directory' | 'document' | 'file' | 'image' | 'unknown' | 'web'

export interface TranscriptResourceModel {
  actionLabel?: ReactNode
  description?: ReactNode
  href?: string
  id: string
  kind: TranscriptResourceKind
  location?: ReactNode
  status?: ReactNode
  title: ReactNode
}

export interface TranscriptTurnActionModel {
  disabled?: boolean
  href?: string
  id: string
  label: ReactNode
  onClick?: () => void
}

export interface TranscriptActivityModel {
  command?: TranscriptCommandModel
  description?: ReactNode
  detail?: ReactNode
  id: string
  meta?: ReactNode
  status?: TranscriptActivityStatus
  title: ReactNode
}

export interface TranscriptTimelineStepModel {
  body?: ReactNode
  category?: string
  id: string
  provenance: TranscriptStepProvenance
  status?: TranscriptActivityStatus
  title: ReactNode
}

export type TranscriptItemModel
  = | { body: ReactNode, id: string, kind: 'user-message' }
    | { id: string, kind: 'assistant-markdown', markdown: string, streaming?: boolean }
    | ({ kind: 'timeline-step' } & TranscriptTimelineStepModel)
    | { activities: TranscriptActivityModel[], defaultCollapsed?: boolean, id: string, kind: 'activity-group', summary: ReactNode }
    | ({ id: string, kind: 'command' } & TranscriptCommandModel)
    | { artifacts: TranscriptArtifactModel[], id: string, kind: 'artifact-strip' }
    | { id: string, kind: 'resource-card', resource: TranscriptResourceModel }
    | { actions: TranscriptTurnActionModel[], id: string, kind: 'turn-action-rail' }
    | { body: ReactNode, id: string, kind: 'status', tone?: TranscriptTone }
    | { id: string, kind: 'custom', node: ReactNode }

export interface TranscriptTurnModel {
  collapsed?: boolean
  id: string
  items: TranscriptItemModel[]
  meta?: ReactNode
  summary?: ReactNode
  title?: ReactNode
}

export interface TranscriptTurnSummary {
  activityCount: number
  artifactCount: number
  assistantCount: number
  commandCount: number
  itemCount: number
  resourceCount: number
}

export function summarizeTranscriptTurn(turn: TranscriptTurnModel): TranscriptTurnSummary {
  return turn.items.reduce<TranscriptTurnSummary>((summary, item) => {
    summary.itemCount += 1

    if (item.kind === 'assistant-markdown')
      summary.assistantCount += 1

    if (item.kind === 'command')
      summary.commandCount += 1

    if (item.kind === 'activity-group') {
      summary.activityCount += item.activities.length
      summary.commandCount += item.activities.filter(activity => activity.command).length
    }

    if (item.kind === 'artifact-strip')
      summary.artifactCount += item.artifacts.length

    if (item.kind === 'resource-card')
      summary.resourceCount += 1

    return summary
  }, {
    activityCount: 0,
    artifactCount: 0,
    assistantCount: 0,
    commandCount: 0,
    itemCount: 0,
    resourceCount: 0,
  })
}
