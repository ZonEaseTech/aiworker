import type {
  LocalArtifact,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
} from '@zonease/aiworker-shared'
import type { SupportedLocale } from '../features/i18n'

export type SessionProgressStage
  = | 'artifact_finalizing'
    | 'empty'
    | 'engine_running'
    | 'failed'
    | 'review_failed'
    | 'review_ready'
    | 'reviewed'

export type SessionProgressTone = 'finalizing' | 'muted' | 'ready' | 'reviewed' | 'risk' | 'working'

export interface SessionProgressSummary {
  detail: string
  label: string
  live: boolean
  previewDetail: string
  stage: SessionProgressStage
  title: string
  tone: SessionProgressTone
}

interface BuildSessionProgressInput {
  artifact: LocalArtifact | null
  events: LocalSessionEvent[]
  locale: SupportedLocale
  review: LocalReview | null
  session: LocalSession
  turns: LocalTurn[]
}

export function buildSessionProgress({
  artifact,
  events,
  locale,
  review,
  session,
  turns,
}: BuildSessionProgressInput): SessionProgressSummary {
  const copy = progressCopy(locale)
  const hasArtifact = Boolean(artifact)
  const hasActiveTurn = turns.some(turn => turn.status === 'queued' || turn.status === 'running')
  const hasFailedTurn = turns.some(turn => turn.status === 'failed')
  const hasCancelledTurn = turns.some(turn => turn.status === 'cancelled')

  if (session.status === 'failed' || hasFailedTurn)
    return copy.failed
  if (session.status === 'cancelled' || hasCancelledTurn)
    return copy.failed

  if (hasArtifact) {
    if (review?.verdict === 'pass' || review?.verdict === 'warn')
      return copy.reviewed
    if (review?.verdict === 'fail')
      return copy.review_failed
    return copy.review_ready
  }

  if (hasCompletedArtifactFileEvent(events))
    return copy.artifact_finalizing

  if (hasActiveTurn || (session.status === 'active' && turns.length === 0))
    return copy.engine_running

  return copy.empty
}

function hasCompletedArtifactFileEvent(events: LocalSessionEvent[]): boolean {
  return events.some((event) => {
    const payload = event.payloadJson
    const agentEvent = isRecord(payload.agentEvent) ? payload.agentEvent : null
    const label = readString(agentEvent?.label ?? payload.label)
    const status = readString(agentEvent?.status ?? payload.status)
    const detail = readString(agentEvent?.detail ?? payload.detail ?? payload.path)
    const path = readString(payload.path)

    const isFileChange = event.type === 'file_change' || label === 'file_change'
    const mentionsArtifact = /(?:^|\/)artifacts\//i.test(detail) || /(?:^|\/)artifacts\//i.test(path)
    const completed = /\bcompleted\b/i.test(detail) || status === 'completed' || status === 'succeeded'

    return isFileChange && mentionsArtifact && completed
  })
}

function progressCopy(locale: SupportedLocale): Record<SessionProgressStage, SessionProgressSummary> {
  if (locale === 'zh-CN') {
    return {
      artifact_finalizing: {
        detail: 'Engine 已写入产物文件；AIWorker 正在结束 session，并把文件归集到产物预览。',
        label: '产物文件',
        live: true,
        previewDetail: '产物文件已经写入，预览会在 session 完成归集后出现。',
        stage: 'artifact_finalizing',
        title: '文件已写入，正在归集',
        tone: 'finalizing',
      },
      empty: {
        detail: '当前 session 还没有可 review 的产物。',
        label: '产物',
        live: false,
        previewDetail: '暂无产物预览。',
        stage: 'empty',
        title: '等待产物',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Agent 正在生成可 review 产物；事件流会继续更新。',
        label: '引擎',
        live: true,
        previewDetail: '产物预览会在第一个 artifact 进入索引后解锁。',
        stage: 'engine_running',
        title: 'Agent 正在生成',
        tone: 'working',
      },
      failed: {
        detail: 'Session 或 turn 已失败，需要查看事件流或重新发起。',
        label: '异常',
        live: false,
        previewDetail: '当前 session 未生成可用产物。',
        stage: 'failed',
        title: '需要处理',
        tone: 'risk',
      },
      review_failed: {
        detail: '人工 review 已发现风险；修订产物后再进入 lesson 或 memory。',
        label: 'Review',
        live: false,
        previewDetail: '产物已归集，但 review 未通过。',
        stage: 'review_failed',
        title: 'Review 未通过',
        tone: 'risk',
      },
      review_ready: {
        detail: '产物已进入索引；进入 lesson 或 memory 前必须由人类 review。',
        label: 'Review',
        live: false,
        previewDetail: '产物已可预览，请完成人工 review。',
        stage: 'review_ready',
        title: '产物已就绪，等待人工 review',
        tone: 'ready',
      },
      reviewed: {
        detail: '已有人工 review 记录；lesson 或 memory 沉淀仍需要显式接受。',
        label: 'Review',
        live: false,
        previewDetail: '产物已 review，可继续处理 lesson 候选。',
        stage: 'reviewed',
        title: 'Review 已记录',
        tone: 'reviewed',
      },
    }
  }

  if (locale === 'ja') {
    return {
      artifact_finalizing: {
        detail: 'エンジンは成果物ファイルを書き込み済みです。AIWorker がセッションを完了し、プレビュー索引へ反映しています。',
        label: 'Artifact file',
        live: true,
        previewDetail: '成果物ファイルは書き込み済みで、索引完了後にここへ表示されます。',
        stage: 'artifact_finalizing',
        title: 'ファイル書き込み済み、索引中',
        tone: 'finalizing',
      },
      empty: {
        detail: 'このセッションにはまだレビュー可能な成果物がありません。',
        label: 'Artifact',
        live: false,
        previewDetail: '成果物プレビューはまだありません。',
        stage: 'empty',
        title: '成果物待ち',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Agent がレビュー可能な成果物を生成しています。イベントストリームは更新され続けます。',
        label: 'Engine',
        live: true,
        previewDetail: '最初の artifact が索引化されるとプレビューが表示されます。',
        stage: 'engine_running',
        title: 'Agent 生成中',
        tone: 'working',
      },
      failed: {
        detail: 'セッションまたは turn が失敗しました。イベントストリームを確認して再実行してください。',
        label: 'Issue',
        live: false,
        previewDetail: 'このセッションには利用可能な成果物がありません。',
        stage: 'failed',
        title: '対応が必要',
        tone: 'risk',
      },
      review_failed: {
        detail: '人間の review がリスクを検出しました。lesson や memory の前に成果物を修正してください。',
        label: 'Review',
        live: false,
        previewDetail: '成果物は索引済みですが、review は未通過です。',
        stage: 'review_failed',
        title: 'Review failed',
        tone: 'risk',
      },
      review_ready: {
        detail: '成果物は索引済みです。lesson や memory へ進む前に人間の review が必要です。',
        label: 'Review',
        live: false,
        previewDetail: '成果物をプレビューできます。人間の review を完了してください。',
        stage: 'review_ready',
        title: 'Review 待ち成果物',
        tone: 'ready',
      },
      reviewed: {
        detail: '人間の review 記録があります。lesson や memory への反映は明示的な承認が必要です。',
        label: 'Review',
        live: false,
        previewDetail: '成果物は review 済みです。lesson 候補を処理できます。',
        stage: 'reviewed',
        title: 'Review recorded',
        tone: 'reviewed',
      },
    }
  }

  if (locale === 'de') {
    return {
      artifact_finalizing: {
        detail: 'Die Engine hat die Artefaktdatei geschrieben. AIWorker schliesst die Session ab und indexiert sie fuer die Vorschau.',
        label: 'Artifact file',
        live: true,
        previewDetail: 'Die Artefaktdatei ist geschrieben und erscheint nach der Indexierung hier.',
        stage: 'artifact_finalizing',
        title: 'Datei geschrieben, Indexierung laeuft',
        tone: 'finalizing',
      },
      empty: {
        detail: 'Diese Session hat noch kein review-faehiges Artefakt.',
        label: 'Artifact',
        live: false,
        previewDetail: 'Noch keine Artefaktvorschau.',
        stage: 'empty',
        title: 'Wartet auf Artefakt',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Der Agent erzeugt ein review-faehiges Artefakt. Der Event-Stream wird weiter aktualisiert.',
        label: 'Engine',
        live: true,
        previewDetail: 'Die Vorschau wird sichtbar, sobald das erste Artifact indexiert ist.',
        stage: 'engine_running',
        title: 'Agent generiert',
        tone: 'working',
      },
      failed: {
        detail: 'Session oder Turn ist fehlgeschlagen. Pruefe den Event-Stream oder starte erneut.',
        label: 'Issue',
        live: false,
        previewDetail: 'Diese Session hat kein nutzbares Artefakt erzeugt.',
        stage: 'failed',
        title: 'Handlung noetig',
        tone: 'risk',
      },
      review_failed: {
        detail: 'Human Review hat Risiken gefunden. Ueberarbeite das Artefakt vor Lesson oder Memory.',
        label: 'Review',
        live: false,
        previewDetail: 'Das Artefakt ist indexiert, aber Review ist fehlgeschlagen.',
        stage: 'review_failed',
        title: 'Review failed',
        tone: 'risk',
      },
      review_ready: {
        detail: 'Das Artefakt ist indexiert. Vor Lesson oder Memory ist Human Review erforderlich.',
        label: 'Review',
        live: false,
        previewDetail: 'Das Artefakt ist sichtbar. Bitte Human Review abschliessen.',
        stage: 'review_ready',
        title: 'Artefakt bereit fuer Review',
        tone: 'ready',
      },
      reviewed: {
        detail: 'Human Review liegt vor. Lesson oder Memory brauchen weiterhin explizite Annahme.',
        label: 'Review',
        live: false,
        previewDetail: 'Das Artefakt ist reviewed; Lesson-Kandidaten koennen bearbeitet werden.',
        stage: 'reviewed',
        title: 'Review recorded',
        tone: 'reviewed',
      },
    }
  }

  return {
    artifact_finalizing: {
      detail: 'The engine wrote an artifact file. AIWorker is finalizing the session before it appears in the artifact preview.',
      label: 'Artifact file',
      live: true,
      previewDetail: 'The artifact file is written and will appear here after session finalization.',
      stage: 'artifact_finalizing',
      title: 'File written, indexing',
      tone: 'finalizing',
    },
    empty: {
      detail: 'This session does not have a reviewable artifact yet.',
      label: 'Artifact',
      live: false,
      previewDetail: 'No artifact preview yet.',
      stage: 'empty',
      title: 'Waiting for artifact',
      tone: 'muted',
    },
    engine_running: {
      detail: 'The agent is generating a reviewable artifact. Streamed events will keep updating.',
      label: 'Engine',
      live: true,
      previewDetail: 'The preview will unlock after the first artifact enters the index.',
      stage: 'engine_running',
      title: 'Agent is generating',
      tone: 'working',
    },
    failed: {
      detail: 'The session or turn failed. Check the event stream or start a new turn.',
      label: 'Issue',
      live: false,
      previewDetail: 'This session did not produce a usable artifact.',
      stage: 'failed',
      title: 'Needs attention',
      tone: 'risk',
    },
    review_failed: {
      detail: 'Human review found risks. Revise the artifact before lesson or memory promotion.',
      label: 'Review',
      live: false,
      previewDetail: 'The artifact is indexed, but review did not pass.',
      stage: 'review_failed',
      title: 'Review failed',
      tone: 'risk',
    },
    review_ready: {
      detail: 'The artifact is indexed. Human review is required before lesson or memory promotion.',
      label: 'Review',
      live: false,
      previewDetail: 'The artifact is visible. Complete human review before promoting it.',
      stage: 'review_ready',
      title: 'Artifact ready for review',
      tone: 'ready',
    },
    reviewed: {
      detail: 'A human review exists. Lessons or memory still require explicit acceptance.',
      label: 'Review',
      live: false,
      previewDetail: 'The artifact is reviewed and lesson candidates can be handled.',
      stage: 'reviewed',
      title: 'Review recorded',
      tone: 'reviewed',
    },
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
