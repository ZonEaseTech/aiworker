import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
} from '@zonease/aiworker-shared'
import type { SupportedLocale } from '../features/i18n'

export type SessionProgressStage
  = | 'empty'
    | 'engine_running'
    | 'failed'

export type SessionProgressTone = 'muted' | 'risk' | 'working'

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
  events: LocalSessionEvent[]
  locale: SupportedLocale
  session: LocalSession
  turns: LocalTurn[]
}

export function buildSessionProgress({
  locale,
  session,
  turns,
  // events intentionally not destructured — not used by buildSessionProgress
}: BuildSessionProgressInput): SessionProgressSummary {
  const copy = progressCopy(locale)
  const hasActiveTurn = turns.some(turn => turn.status === 'queued' || turn.status === 'running')
  const hasFailedTurn = turns.some(turn => turn.status === 'failed')
  const hasCancelledTurn = turns.some(turn => turn.status === 'cancelled')

  if (session.status === 'failed' || hasFailedTurn)
    return copy.failed
  if (session.status === 'cancelled' || hasCancelledTurn)
    return copy.failed
  if (hasActiveTurn || (session.status === 'active' && turns.length === 0))
    return copy.engine_running
  return copy.empty
}

function progressCopy(locale: SupportedLocale): Record<SessionProgressStage, SessionProgressSummary> {
  if (locale === 'zh-CN') {
    return {
      empty: {
        detail: '当前 session 还没有可预览产物。',
        label: '产物',
        live: false,
        previewDetail: '暂无产物预览。',
        stage: 'empty',
        title: '等待产物',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Agent 正在生成应用自有产物；事件流会继续更新。',
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
    }
  }

  if (locale === 'ja') {
    return {
      empty: {
        detail: 'このセッションにはまだプレビュー可能な成果物がありません。',
        label: 'Artifact',
        live: false,
        previewDetail: '成果物プレビューはまだありません。',
        stage: 'empty',
        title: '成果物待ち',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Agent が app-owned 成果物を生成しています。イベントストリームは更新され続けます。',
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
    }
  }

  if (locale === 'de') {
    return {
      empty: {
        detail: 'Diese Session hat noch kein sichtbares Artefakt.',
        label: 'Artifact',
        live: false,
        previewDetail: 'Noch keine Artefaktvorschau.',
        stage: 'empty',
        title: 'Wartet auf Artefakt',
        tone: 'muted',
      },
      engine_running: {
        detail: 'Der Agent erzeugt ein app-owned Artefakt. Der Event-Stream wird weiter aktualisiert.',
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
    }
  }

  return {
    empty: {
      detail: 'This session does not have a previewable artifact yet.',
      label: 'Artifact',
      live: false,
      previewDetail: 'No artifact preview yet.',
      stage: 'empty',
      title: 'Waiting for artifact',
      tone: 'muted',
    },
    engine_running: {
      detail: 'The agent is generating app-owned output. Streamed events will keep updating.',
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
  }
}
