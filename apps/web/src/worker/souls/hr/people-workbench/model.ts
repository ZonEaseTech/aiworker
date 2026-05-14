import type { LocalArtifact, LocalLesson, LocalReview, LocalSession, LocalWorkspace, SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { HrWorkbenchCopy } from './copy'
import type { HrLocale, LifecycleFilter, PersonLifecycle, PersonProfile, ProfileListSection, ProfileTimelineItem, ReviewDisplayState, StatusTone } from './types'

import { formatRelativeTime, formatStatus } from '../../../../features/i18n'

export function buildPersonProfiles(
  workspaces: LocalWorkspace[],
  sessions: LocalSession[],
  artifacts: LocalArtifact[],
  reviews: LocalReview[],
  lessons: LocalLesson[],
  labels: HrWorkbenchCopy,
  locale: HrLocale,
): PersonProfile[] {
  return workspaces.map((workspace) => {
    const workspaceSessions = sessions.filter(session => session.workspaceId === workspace.id)
    const workspaceArtifacts = artifacts.filter(artifact => artifact.workspaceId === workspace.id)
    const workspaceReviews = reviews.filter(review => review.workspaceId === workspace.id)
    const workspaceLessons = lessons.filter(lesson => lesson.workspaceId === workspace.id)
    const lifecycle = resolvePersonLifecycle(workspace, workspaceSessions, workspaceArtifacts)
    const latestSession = workspaceSessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    const hasArtifact = workspaceArtifacts.length > 0
    const reviewState = latestReviewState(workspaceReviews)
    const failed = latestSession?.status === 'failed'
    const statusTone: StatusTone = failed ? 'risk' : hasArtifact ? 'good' : 'warn'
    const reviewTone = reviewToneFor(reviewState)

    return {
      artifacts: workspaceArtifacts,
      detail: latestSession ? formatSessionDetail(latestSession) : labels.noSessionYet,
      evidenceTone: statusTone,
      id: workspace.id,
      initials: initialsFor(workspace.name),
      latestSession,
      lessons: workspaceLessons,
      lifecycle,
      moment: lifecycleMoment(lifecycle, workspaceSessions, workspaceArtifacts, reviewState, labels),
      name: workspace.name,
      nextStep: nextStepFor(lifecycle, workspaceSessions, workspaceArtifacts, reviewState, labels),
      reviews: workspaceReviews,
      reviewState,
      reviewStatus: labels.reviewStatus(reviewState),
      reviewTone,
      sessions: workspaceSessions,
      status: hasArtifact ? labels.status.evidenceReady : labels.status.evidenceMissing,
      statusTone,
      workspace: {
        ...workspace,
        updatedAt: workspace.updatedAt || new Date().toISOString(),
      },
    }
  }).sort((a, b) => {
    const aAttention = needsAttention(a) ? 1 : 0
    const bAttention = needsAttention(b) ? 1 : 0
    if (aAttention !== bAttention)
      return bAttention - aAttention
    return b.workspace.updatedAt.localeCompare(a.workspace.updatedAt)
  }).map(profile => ({
    ...profile,
    detail: `${profile.detail} · ${formatRelativeTime(profile.workspace.updatedAt, locale)}`,
  }))
}

export function resolvePersonLifecycle(workspace: LocalWorkspace, sessions: LocalSession[], artifacts: LocalArtifact[]): PersonLifecycle {
  const haystack = [
    workspace.name,
    workspace.type,
    ...sessions.map(session => `${session.title} ${session.capabilityTemplateId}`),
    ...artifacts.map(artifact => `${artifact.kind} ${artifact.title}`),
  ].join(' ').toLowerCase()

  if (/alumni|offboard|depart|exit|handoff|离职|交接|校友/.test(haystack))
    return 'alumni'
  if (/employee|onboard|new hire|check.?in|growth|retention|员工|入职|在职|试用/.test(haystack))
    return 'employee'
  return 'candidate'
}

export function lifecycleMoment(
  lifecycle: PersonLifecycle,
  sessions: LocalSession[],
  artifacts: LocalArtifact[],
  reviewState: ReviewDisplayState,
  labels: HrWorkbenchCopy,
): string {
  if (sessions.some(session => session.status === 'failed'))
    return labels.moments.riskReview
  if (reviewState === 'fail')
    return labels.moments.riskReview
  if (isReviewed(reviewState))
    return labels.moments.reviewed
  if (artifacts.length > 0)
    return labels.moments.artifactReady
  if (sessions.length > 0)
    return labels.moments.inProgress

  switch (lifecycle) {
    case 'alumni':
      return labels.moments.offboardingNeeded
    case 'employee':
      return labels.moments.checkinNeeded
    case 'candidate':
      return labels.moments.intakeNeeded
  }
}

export function nextStepFor(
  lifecycle: PersonLifecycle,
  sessions: LocalSession[],
  artifacts: LocalArtifact[],
  reviewState: ReviewDisplayState,
  labels: HrWorkbenchCopy,
): string {
  if (sessions.some(session => session.status === 'failed'))
    return labels.nextSteps.resolveRisk
  if (reviewState === 'fail')
    return labels.nextSteps.resolveRisk
  if (artifacts.length > 0 && !isReviewed(reviewState))
    return labels.nextSteps.requestReview
  if (isReviewed(reviewState))
    return labels.nextSteps.captureMemory
  if (sessions.length > 0)
    return labels.nextSteps.completeArtifact

  switch (lifecycle) {
    case 'alumni':
      return labels.nextSteps.offboarding
    case 'employee':
      return labels.nextSteps.checkin
    case 'candidate':
      return labels.nextSteps.profileSnapshot
  }
}

export function buildLifecycleOptions(profiles: PersonProfile[], labels: HrWorkbenchCopy): Array<{ count: number, id: LifecycleFilter, label: string }> {
  return [
    { count: profiles.length, id: 'all', label: labels.lifecycleFilters.all },
    { count: profiles.filter(profile => profile.lifecycle === 'candidate').length, id: 'candidate', label: labels.lifecycleFilters.candidate },
    { count: profiles.filter(profile => profile.lifecycle === 'employee').length, id: 'employee', label: labels.lifecycleFilters.employee },
    { count: profiles.filter(profile => profile.lifecycle === 'alumni').length, id: 'alumni', label: labels.lifecycleFilters.alumni },
    { count: profiles.filter(needsAttention).length, id: 'attention', label: labels.lifecycleFilters.attention },
  ]
}

export function buildProfileListSections(profiles: PersonProfile[], labels: HrWorkbenchCopy): ProfileListSection[] {
  return [
    {
      id: 'candidate',
      label: labels.lifecycleFilters.candidate,
      profiles: profiles.filter(profile => profile.lifecycle === 'candidate'),
    },
    {
      id: 'employee',
      label: labels.lifecycleFilters.employee,
      profiles: profiles.filter(profile => profile.lifecycle === 'employee'),
    },
    {
      id: 'alumni',
      label: labels.lifecycleFilters.alumni,
      profiles: profiles.filter(profile => profile.lifecycle === 'alumni'),
    },
  ]
}

export function filterPersonProfile(profile: PersonProfile, filter: LifecycleFilter): boolean {
  if (filter === 'all')
    return true
  if (filter === 'attention')
    return needsAttention(profile)
  return profile.lifecycle === filter
}

export function needsAttention(profile: PersonProfile): boolean {
  return profile.sessions.length === 0 || profile.artifacts.length === 0 || profile.latestSession?.status === 'failed' || profile.reviewTone !== 'good'
}

export function latestReviewState(reviews: LocalReview[]): ReviewDisplayState {
  return reviews.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.verdict ?? 'none'
}

export function isReviewed(state: ReviewDisplayState): boolean {
  return state === 'pass' || state === 'warn'
}

export function reviewToneFor(state: ReviewDisplayState): StatusTone {
  if (state === 'pass')
    return 'good'
  if (state === 'fail')
    return 'risk'
  return 'warn'
}

export function orderActionsForProfile(actions: readonly SoulWorkbenchAction[], profile: PersonProfile | null): readonly SoulWorkbenchAction[] {
  const preferred = profile?.lifecycle === 'employee'
    ? ['prepare-next-step', 'draft-onboarding-plan', 'summarize-profile', 'check-risky-wording']
    : profile?.lifecycle === 'alumni'
      ? ['prepare-offboarding-summary', 'summarize-profile', 'prepare-next-step', 'check-risky-wording']
      : ['summarize-profile', 'extract-evidence', 'draft-interview-kit', 'build-evidence-matrix']
  const rank = new Map(preferred.map((id, index) => [id, index]))
  return actions.slice().sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99)).slice(0, 5)
}

export function buildProfileTimeline(profile: PersonProfile, labels: HrWorkbenchCopy, locale: HrLocale): ProfileTimelineItem[] {
  const rows: ProfileTimelineItem[] = [{
    detail: labels.timelineUpdated(formatRelativeTime(profile.workspace.updatedAt, locale)),
    label: labels.timelineLabels.profile,
    tone: 'muted',
  }]

  if (profile.latestSession) {
    rows.push({
      detail: `${profile.latestSession.title} · ${formatStatus(profile.latestSession.status, locale)}`,
      label: labels.timelineLabels.session,
      tone: profile.latestSession.status === 'failed' ? 'risk' : 'good',
    })
  }

  const latestArtifact = profile.artifacts.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (latestArtifact) {
    rows.push({
      detail: latestArtifact.title,
      label: labels.timelineLabels.artifact,
      tone: 'good',
    })
  }

  if (profile.reviews.length > 0) {
    rows.push({
      detail: labels.timelineReviewCount(profile.reviews.length),
      label: labels.timelineLabels.review,
      tone: 'good',
    })
  }

  if (profile.lessons.length > 0) {
    rows.push({
      detail: labels.timelineLessonCount(profile.lessons.length),
      label: labels.timelineLabels.memory,
      tone: 'warn',
    })
  }

  return rows.slice(0, 5)
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase() || 'HR'
}

export function formatSessionDetail(session: LocalSession): string {
  return session.capabilityTemplateId.replace(/-/g, ' ')
}

export function displayActionLabel(action: SoulWorkbenchAction, labels: HrWorkbenchCopy): string {
  return labels.actionLabels[action.id] ?? action.label
}
