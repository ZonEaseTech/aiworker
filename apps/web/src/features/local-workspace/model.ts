import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-soul-protocol'
import type { messagesFor } from '../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function turnsForSession(session: LocalSession, turns: LocalTurn[]): LocalTurn[] {
  return turns.filter(turn => turn.sessionId === session.id).sort((a, b) => a.seq - b.seq)
}

export function upsertTurn(turns: LocalTurn[], nextTurn: LocalTurn): LocalTurn[] {
  const byId = new Map(turns.map(turn => [turn.id, turn]))
  byId.set(nextTurn.id, nextTurn)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

export function upsertSession(sessions: LocalSession[], nextSession: LocalSession): LocalSession[] {
  const byId = new Map(sessions.map(session => [session.id, session]))
  byId.set(nextSession.id, nextSession)
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function eventsForSession(session: LocalSession, events: LocalSessionEvent[]): LocalSessionEvent[] {
  return events.filter(event => event.sessionId === session.id).sort((a, b) => a.seq - b.seq)
}

export function sessionForWorkspace(item: LocalWorkspace | null, sessions: LocalSession[]): LocalSession | null {
  if (!item)
    return null
  return sessions.filter(session => session.workspaceId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

export function turnForSession(item: LocalSession | null, turns: LocalTurn[]): LocalTurn | null {
  if (!item)
    return null
  return turns.filter(turn => turn.sessionId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

export function latest<T extends { updatedAt: string }>(items: T[]): T | null {
  return items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

export function projectNamePlaceholder(_soulId: string, copy: WorkerMessages): string {
  return copy.create.projectPlaceholders.default
}
