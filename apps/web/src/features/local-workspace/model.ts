import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalLesson,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
  VerticalSoul,
} from '@zonease/aiworker-shared'
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

export function artifactsForWorkspace(workspace: LocalWorkspace, artifacts: LocalArtifact[]): LocalArtifact[] {
  return artifacts.filter(artifact => artifact.workspaceId === workspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function reviewsForWorkspace(workspace: LocalWorkspace, reviews: LocalReview[]): LocalReview[] {
  return reviews.filter(review => review.workspaceId === workspace.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function lessonsForWorkspace(workspace: LocalWorkspace, lessons: LocalLesson[]): LocalLesson[] {
  return lessons.filter(lesson => lesson.workspaceId === workspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function buildProjectPrompt(soul: VerticalSoul, template: CapabilityTemplate, context: string): string {
  return [
    `Soul: ${soul.name}`,
    `Domain system: ${soul.domain}`,
    `Capability template: ${template.name}`,
    `Output kind: ${template.outputKind}`,
    '',
    'Business context:',
    context.trim(),
    '',
    'Input hints:',
    ...template.inputHints.map(item => `- ${item}`),
    '',
    'Review rubric:',
    ...template.reviewRubric.map(item => `- ${item}`),
  ].join('\n')
}

export function artifactForWorkspace(item: LocalWorkspace, artifacts: LocalArtifact[], sessions: LocalSession[]): LocalArtifact | null {
  const session = sessionForWorkspace(item, sessions)
  return session ? artifactForSession(session, artifacts) : null
}

export function artifactForSession(session: LocalSession, artifacts: LocalArtifact[]): LocalArtifact | null {
  return artifacts.find(artifact => artifact.sessionId === session.id) ?? null
}

export function reviewForSession(session: LocalSession, reviews: LocalReview[]): LocalReview | null {
  return reviews.find(review => review.sessionId === session.id) ?? null
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

export function projectNamePlaceholder(soulId: string, copy: WorkerMessages): string {
  if (soulId === 'aiworker-hr' || soulId === 'hr')
    return copy.create.projectPlaceholders.hr
  if (soulId === 'pm')
    return copy.create.projectPlaceholders.pm
  if (soulId === 'aiworker-qa' || soulId === 'qa')
    return copy.create.projectPlaceholders.qa
  if (soulId === 'devops')
    return copy.create.projectPlaceholders.devops
  return copy.create.projectPlaceholders.default
}
