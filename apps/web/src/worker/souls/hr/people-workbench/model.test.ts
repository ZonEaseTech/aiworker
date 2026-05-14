import type { LocalArtifact, LocalLesson, LocalReview, LocalSession, LocalWorkspace } from '@zonease/aiworker-shared'

import { hrPeopleWorkbench } from '@zonease/aiworker-shared/soul-workbench-catalog'
import { describe, expect, it } from 'vitest'
import { getHrPeopleWorkbenchCopy } from './copy'
import {
  buildLifecycleOptions,
  buildPersonProfiles,
  buildProfileListSections,
  filterPersonProfile,
  latestReviewState,
  orderActionsForProfile,
  resolvePersonLifecycle,
} from './model'

const labels = getHrPeopleWorkbenchCopy('en')
const now = '2026-05-12T08:00:00.000Z'

function workspace(overrides: Partial<LocalWorkspace>): LocalWorkspace {
  return {
    createdAt: now,
    id: 'workspace-1',
    metadataJson: {},
    name: 'Hiring Workspace',
    rootPath: '/tmp/workspace-1',
    sourcePointersJson: [],
    status: 'active',
    type: 'people-profile',
    updatedAt: now,
    workerId: 'hr-worker',
    ...overrides,
  }
}

function session(overrides: Partial<LocalSession>): LocalSession {
  return {
    capabilityTemplateId: 'person-profile',
    context: 'Profile context',
    createdAt: now,
    endedAt: null,
    id: 'session-1',
    metadataJson: {},
    startedAt: now,
    status: 'completed',
    title: 'Person profile',
    updatedAt: now,
    workerId: 'hr-worker',
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

function artifact(overrides: Partial<LocalArtifact>): LocalArtifact {
  return {
    createdAt: now,
    id: 'artifact-1',
    invocationId: null,
    kind: 'person-profile',
    metadataJson: {},
    path: 'artifact.md',
    sessionId: 'session-1',
    status: 'available',
    title: 'Person profile',
    turnId: null,
    updatedAt: now,
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

function review(overrides: Partial<LocalReview>): LocalReview {
  return {
    artifactId: 'artifact-1',
    createdAt: now,
    findingsJson: [],
    id: 'review-1',
    risksJson: [],
    sessionId: 'session-1',
    turnId: null,
    verdict: 'needs_review',
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

function lesson(overrides: Partial<LocalLesson>): LocalLesson {
  return {
    createdAt: now,
    evidenceJson: [],
    id: 'lesson-1',
    sourceReviewId: 'review-1',
    statement: 'Reviewed HR practice',
    status: 'proposed',
    updatedAt: now,
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

describe('hr people workbench model', () => {
  it('projects workspace records into lifecycle-aware people profiles', () => {
    const candidate = workspace({ id: 'candidate', name: 'Candidate Profile', updatedAt: '2026-05-12T08:00:00.000Z' })
    const employee = workspace({ id: 'employee', name: 'Employee onboarding', updatedAt: '2026-05-12T07:00:00.000Z' })
    const alumni = workspace({ id: 'alumni', name: 'Alumni handoff', updatedAt: '2026-05-12T06:00:00.000Z' })

    const profiles = buildPersonProfiles(
      [candidate, employee, alumni],
      [
        session({ id: 'candidate-session', workspaceId: 'candidate', title: 'Candidate screen', capabilityTemplateId: 'candidate-screen' }),
        session({ id: 'employee-session', workspaceId: 'employee', title: 'Employee check-in', capabilityTemplateId: 'onboarding-plan' }),
        session({ id: 'alumni-session', workspaceId: 'alumni', title: 'Offboarding summary', capabilityTemplateId: 'offboarding-summary' }),
      ],
      [artifact({ id: 'candidate-artifact', workspaceId: 'candidate', sessionId: 'candidate-session', kind: 'candidate-screen' })],
      [review({ workspaceId: 'candidate', sessionId: 'candidate-session', artifactId: 'candidate-artifact', verdict: 'needs_review' })],
      [lesson({ workspaceId: 'candidate' })],
      labels,
      'en',
    )

    expect(profiles.map(profile => [profile.id, profile.lifecycle])).toEqual([
      ['candidate', 'candidate'],
      ['employee', 'employee'],
      ['alumni', 'alumni'],
    ])
    expect(profiles[0]?.moment).toBe('Artifact ready for review')
    expect(profiles[0]?.nextStep).toBe('Request review')
    expect(profiles[0]?.reviewStatus).toBe('needs review')
    expect(profiles[0]?.lessons).toHaveLength(1)
  })

  it('keeps needs-review artifacts in the attention filter instead of treating them as reviewed', () => {
    const profile = buildPersonProfiles(
      [workspace({})],
      [session({})],
      [artifact({})],
      [review({ verdict: 'needs_review' })],
      [],
      labels,
      'en',
    )[0]

    expect(profile?.reviewTone).toBe('warn')
    expect(profile?.nextStep).toBe('Request review')
    expect(profile && filterPersonProfile(profile, 'attention')).toBe(true)
    expect(latestReviewState([review({ id: 'old', createdAt: '2026-05-12T07:00:00.000Z', verdict: 'pass' }), review({ id: 'new', verdict: 'needs_review' })])).toBe('needs_review')
  })

  it('orders recommended actions by person lifecycle without changing descriptor metadata', () => {
    const actions = hrPeopleWorkbench.actions
    const employeeProfile = buildPersonProfiles(
      [workspace({ id: 'employee', name: 'Active employee check-in' })],
      [session({ workspaceId: 'employee', title: 'Employee growth check-in', capabilityTemplateId: 'onboarding-plan' })],
      [],
      [],
      [],
      labels,
      'en',
    )[0] ?? null
    const alumniProfile = buildPersonProfiles(
      [workspace({ id: 'alumni', name: 'Departing employee handoff' })],
      [],
      [],
      [],
      [],
      labels,
      'en',
    )[0] ?? null

    expect(orderActionsForProfile(actions, employeeProfile).map(action => action.id).slice(0, 2)).toEqual(['prepare-next-step', 'draft-onboarding-plan'])
    expect(orderActionsForProfile(actions, alumniProfile).map(action => action.id).slice(0, 2)).toEqual(['prepare-offboarding-summary', 'summarize-profile'])
    expect(actions.map(action => action.id)).toContain('check-risky-wording')
  })

  it('builds lifecycle filter counts from projected profiles', () => {
    const profiles = buildPersonProfiles(
      [
        workspace({ id: 'candidate', name: 'Candidate intake' }),
        workspace({ id: 'employee', name: 'Employee onboarding' }),
        workspace({ id: 'alumni', name: 'Alumni offboarding' }),
      ],
      [],
      [],
      [],
      [],
      labels,
      'en',
    )

    expect(resolvePersonLifecycle(workspace({ name: '离职交接记录' }), [], [])).toBe('alumni')
    expect(buildLifecycleOptions(profiles, labels).map(option => [option.id, option.count])).toEqual([
      ['all', 3],
      ['candidate', 1],
      ['employee', 1],
      ['alumni', 1],
      ['attention', 3],
    ])
    expect(buildProfileListSections(profiles, labels).map(section => [section.id, section.profiles.length])).toEqual([
      ['candidate', 1],
      ['employee', 1],
      ['alumni', 1],
    ])
  })
})
