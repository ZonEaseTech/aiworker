import type { LocalArtifact, LocalLesson, LocalReview, LocalSession, LocalWorkspace } from '@zonease/aiworker-shared'
import type { WorkbenchStatusTone } from '../../common'
import type { WorkerLocale } from '../../types'

export type HrLocale = WorkerLocale
export type PersonLifecycle = 'alumni' | 'candidate' | 'employee'
export type LifecycleFilter = 'all' | PersonLifecycle | 'attention'
export type ProfileListSectionId = PersonLifecycle
export type ReviewDisplayState = 'none' | LocalReview['verdict']
export type StatusTone = WorkbenchStatusTone

export interface PersonProfile {
  artifacts: LocalArtifact[]
  detail: string
  evidenceTone: StatusTone
  id: string
  initials: string
  latestSession: LocalSession | null
  lessons: LocalLesson[]
  lifecycle: PersonLifecycle
  moment: string
  name: string
  nextStep: string
  reviews: LocalReview[]
  reviewState: ReviewDisplayState
  reviewStatus: string
  reviewTone: StatusTone
  sessions: LocalSession[]
  status: string
  statusTone: StatusTone
  workspace: LocalWorkspace
}

export interface ProfileTimelineItem {
  detail: string
  label: string
  tone: StatusTone
}

export interface ProfileListSection {
  id: ProfileListSectionId
  label: string
  profiles: PersonProfile[]
}
