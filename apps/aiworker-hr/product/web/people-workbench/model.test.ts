import type { HrWorkbenchAction, LocalArtifact, LocalSession, LocalWorkspace } from './types'
import { describe, expect, it } from 'bun:test'

import { getHrPeopleWorkbenchCopy } from './copy'
import {
  buildLifecycleOptions,
  buildPersonProfiles,
  buildProfileListSections,
  filterPersonProfile,
  orderActionsForProfile,
  profileProgressState,
  resolvePersonLifecycle,
} from './model'
import {
  getHrProfileSection,
  HR_PROFILE_SECTION_ORDER,
  parseHrProfileReadme,
} from './profile-readme'
import { buildProfileRevisionReview } from './revision-review'

const labels = getHrPeopleWorkbenchCopy('en')
const now = '2026-05-12T08:00:00.000Z'
const hrWorkbenchActions: HrWorkbenchAction[] = [
  action('summarize-profile', 'person', 'person-profile'),
  action('extract-evidence', 'person', 'evidence-matrix'),
  action('draft-interview-kit', 'interview', 'interview-brief'),
  action('build-evidence-matrix', 'role', 'evidence-matrix'),
  action('prepare-next-step', 'employee', 'profile-update-draft'),
  action('draft-onboarding-plan', 'employee', 'profile-update-draft'),
  action('prepare-offboarding-summary', 'alumni', 'profile-update-draft'),
  action('check-risky-wording', 'artifact', 'hiring-risk'),
]

function action(id: string, scope: HrWorkbenchAction['scope'], outputKind: string): HrWorkbenchAction {
  return {
    description: `${id} description`,
    id,
    label: id,
    outputKind,
    prompt: `${id} prompt`,
    scope,
    templateId: id,
  }
}

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

describe('HR app people workbench model', () => {
  it('projects workspace records into lifecycle-aware people profiles inside the HR app', () => {
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
      {
        alumni: '# Alumni handoff\n\nAccepted alumni profile notes.',
        candidate: '# Candidate Profile\n\nNo accepted profile update yet.',
        employee: '# Employee onboarding\n\nAccepted employee profile notes.',
      },
      labels,
      'en',
    )

    expect(profiles.map(profile => [profile.id, profile.lifecycle])).toEqual([
      ['candidate', 'candidate'],
      ['employee', 'employee'],
      ['alumni', 'alumni'],
    ])
    expect(profiles[0]?.moment).toBe('Artifact ready for profile update')
    expect(profiles[0]?.nextStep).toBe('Review README patch')
    expect(profiles[0]?.reviewStatus).toBe('README patch ready')
  })

  it('keeps artifact-ready profiles in the attention filter until README is updated', () => {
    const profile = buildPersonProfiles(
      [workspace({})],
      [session({})],
      [artifact({})],
      { 'workspace-1': '# Hiring Workspace\n\nNo accepted profile update yet.' },
      labels,
      'en',
    )[0]

    expect(profile?.reviewTone).toBe('warn')
    expect(profile?.nextStep).toBe('Review README patch')
    expect(profile && filterPersonProfile(profile, 'attention')).toBe(true)
    expect(profileProgressState('# Hiring Workspace\n\nAccepted profile summary.', [session({})], [artifact({})])).toBe('accepted')
  })

  it('orders recommended actions by person lifecycle without changing descriptor metadata', () => {
    const actions = hrWorkbenchActions
    const employeeProfile = buildPersonProfiles(
      [workspace({ id: 'employee', name: 'Active employee check-in' })],
      [session({ workspaceId: 'employee', title: 'Employee growth check-in', capabilityTemplateId: 'onboarding-plan' })],
      [],
      {},
      labels,
      'en',
    )[0] ?? null
    const alumniProfile = buildPersonProfiles(
      [workspace({ id: 'alumni', name: 'Departing employee handoff' })],
      [],
      [],
      {},
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
      {},
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
    expect(buildProfileListSections(profiles, labels).map(section => section.label)).toEqual(['Candidates', 'Employees', 'Alumni'])
    expect(labels.profileBoardTitle).toBe('People Profiles')
    expect(labels.profileDetailsTitle).toBe('Current Profile Summary')
  })

  it('keeps all zh-CN lifecycle profile list sections visible even when empty', () => {
    const zhLabels = getHrPeopleWorkbenchCopy('zh-CN')

    expect(buildProfileListSections([], zhLabels).map(section => [section.id, section.label, section.profiles.length])).toEqual([
      ['candidate', '候选人', 0],
      ['employee', '在职员工', 0],
      ['alumni', '离职归档', 0],
    ])
  })

  it('parses HR profile README sections without losing unknown notes', () => {
    const parsed = parseHrProfileReadme([
      '# Ada Chen',
      '',
      'Intro before sections.',
      '',
      '## Current Profile Summary',
      '',
      'Accepted profile summary.',
      '',
      '## Identity And Basics',
      '',
      '- Lifecycle: Candidate',
      '- Target role: Senior Product Manager',
      '',
      '## Capabilities And Stack',
      '',
      '- SQL analytics',
      '',
      '## Custom Notes',
      '',
      'Keep this unknown section.',
      '',
    ].join('\n'))

    expect(parsed.title).toBe('Ada Chen')
    expect(parsed.intro).toContain('Intro before sections.')
    expect(getHrProfileSection(parsed, 'currentProfileSummary')?.body).toContain('Accepted profile summary.')
    expect(getHrProfileSection(parsed, 'identityAndBasics')?.body).toContain('Lifecycle: Candidate')
    expect(getHrProfileSection(parsed, 'capabilitiesAndStack')?.body).toContain('SQL analytics')
    expect(parsed.unknownSections).toEqual([
      { body: 'Keep this unknown section.', heading: 'Custom Notes' },
    ])
  })

  it('keeps a legacy README renderable when base sections are missing', () => {
    const parsed = parseHrProfileReadme('# Legacy Profile\n\nAccepted profile summary.\n')

    expect(parsed.title).toBe('Legacy Profile')
    expect(parsed.intro).toContain('Accepted profile summary.')
    expect(HR_PROFILE_SECTION_ORDER.map(section => section.id)).toContain('currentProfileSummary')
    expect(getHrProfileSection(parsed, 'currentProfileSummary')).toBeNull()
  })

  it('builds a ready profile revision review from a fenced accepted README draft', () => {
    const revisionReview = buildProfileRevisionReview({
      artifactContent: [
        '# Profile Update Proposal',
        '',
        'Proposal notes stay outside the accepted profile.',
        '',
        '```aiworker-profile-readme',
        '# Ada Profile',
        '',
        '## Current Profile Summary',
        '',
        'Proposed accepted summary.',
        '```',
      ].join('\n'),
      artifactLoading: false,
      currentProfileContent: '# Ada Profile\n\n## Current Profile Summary\n\nCurrent accepted summary.\n',
      currentProfileLoading: false,
      hasArtifact: true,
    })

    expect(revisionReview.status).toBe('ready')
    expect(revisionReview.proposedMarkdown).toContain('Proposed accepted summary.')
    expect(revisionReview.proposedMarkdown).not.toContain('Proposal notes')
    expect(revisionReview.currentSummary).toContain('Current accepted summary.')
    expect(revisionReview.proposedSummary).toContain('Proposed accepted summary.')
    expect(revisionReview.changedSectionCount).toBe(1)
    expect(revisionReview.blockerCount).toBe(0)
    expect(revisionReview.changedSections).toEqual([
      {
        currentMarkdown: 'Current accepted summary.',
        id: 'currentProfileSummary',
        proposedMarkdown: 'Proposed accepted summary.',
        status: 'changed',
        title: 'Current Profile Summary',
      },
    ])
  })

  it('synthesizes a promotable README review from an unfenced person-profile artifact', () => {
    const revisionReview = buildProfileRevisionReview({
      artifactContent: [
        '# Person Profile Snapshot Proposal: Ben',
        '',
        'Generated: 2026-05-17 19:35 CST',
        'Soul worker: AIWorker HR',
        'Proposal status: Human review required before any accepted profile promotion',
        '',
        '## Current Profile Snapshot',
        '',
        'This is a profile-bound snapshot proposal for the person target labeled `Ben`.',
        'The accepted profile surface states that no approved profile revision exists.',
        '',
        '## Confirmed Facts',
        '',
        '| Claim | Evidence | Confidence |',
        '| --- | --- | --- |',
        '| The selected workbench action is `Summarize profile`. | active-context.md:11-18 | High |',
        '',
        '## Missing Or Conflicting Evidence',
        '',
        '- No approved profile revision exists.',
        '- No verified lifecycle status is available.',
        '',
        '## Human Reviewer Next Actions',
        '',
        '1. Confirm whether `Ben` is the correct target profile for this workspace.',
      ].join('\n'),
      artifactLoading: false,
      currentProfileContent: '# Ben\n\nNo accepted HR profile yet.\n',
      currentProfileLoading: false,
      hasArtifact: true,
    })

    expect(revisionReview.status).toBe('ready')
    expect(revisionReview.proposedMarkdown).toContain('# Ben People Profile')
    expect(revisionReview.proposedMarkdown).toContain('## Current Profile Summary')
    expect(revisionReview.proposedMarkdown).toContain('## Confirmed Facts')
    expect(revisionReview.proposedMarkdown).toContain('The selected workbench action')
    expect(revisionReview.proposedMarkdown).not.toMatch(/Proposal status|snapshot proposal|no approved profile revision/i)
    expect(revisionReview.changedSectionCount).toBeGreaterThan(0)
  })

  it('blocks profile revision review when the artifact is not promotable', () => {
    const missingFence = buildProfileRevisionReview({
      artifactContent: '# Profile Update Proposal\n\nNo accepted draft yet.',
      artifactLoading: false,
      currentProfileContent: '# Ada Profile\n\nCurrent accepted summary.\n',
      currentProfileLoading: false,
      hasArtifact: true,
    })
    const pending = buildProfileRevisionReview({
      artifactContent: [
        '```aiworker-profile-readme',
        '# Ada Profile',
        '',
        '> Accepted People Profile for this HR workspace. Agent outputs remain proposals until review.',
        '',
        '## Profile Update State',
        '',
        'Accepted profile revision ready for HR review.',
        '```',
      ].join('\n'),
      artifactLoading: false,
      currentProfileContent: '# Ada Profile\n\nCurrent accepted summary.\n',
      currentProfileLoading: false,
      hasArtifact: true,
    })

    expect(missingFence.status).toBe('blocked')
    expect(missingFence.changedSectionCount).toBe(0)
    expect(missingFence.blockerCount).toBe(1)
    expect(missingFence.issues[0]).toContain('aiworker-profile-readme')
    expect(pending.status).toBe('blocked')
    expect(pending.changedSections).toEqual([])
    expect(pending.issues.join(' ')).toContain('ready for HR review')
  })
})
