import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { ReactNode } from 'react'
import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { HrProfileSectionId } from '../profile-readme'
import type { ProfileRevisionReviewState } from '../revision-review'
import type { PersonProfile } from '../types'

import { HrProfileReadingRoom } from './profile-reading-room'

interface ProfileDetailsProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  patchArtifact: LocalArtifact | null
  profilePreview: SoulProfilePreviewState
  profileRevisionReview: ProfileRevisionReviewState
  headerActions: ReactNode
  onReviewPatch: () => void
  onSectionAction: (sectionId: HrProfileSectionId) => void
}

export function HrProfileDetails({
  focusedProfile,
  labels,
  patchArtifact,
  profilePreview,
  profileRevisionReview,
  headerActions,
  onReviewPatch,
  onSectionAction,
}: ProfileDetailsProps) {
  const title = focusedProfile ? labels.profileHeaderTitle(focusedProfile.name) : labels.profileDetailsTitle
  return (
    <section className="hr-profile-details" aria-label={title}>
      <div className="hr-selected-profile-header">
        <div className="hr-selected-profile-copy">
          <h2>{title}</h2>
          <p>{focusedProfile ? labels.profileHeaderDetail(focusedProfile.moment, focusedProfile.nextStep) : labels.profileDetailsEmpty}</p>
          {focusedProfile
            ? (
                <div className="hr-profile-source-tags" aria-label={labels.sourcesTitle}>
                  {labels.sourceCards(
                    focusedProfile.artifacts.length,
                    focusedProfile.sessions.length,
                    focusedProfile.reviews.length,
                  ).map(source => (
                    <span key={source.label} className="hr-profile-source-tag">
                      <span>{source.label}</span>
                      <strong>{source.count}</strong>
                    </span>
                  ))}
                </div>
              )
            : null}
        </div>
        <div className="hr-selected-profile-actions" aria-label={labels.workbenchPanelControlsLabel}>
          {headerActions}
        </div>
      </div>
      <div className="hr-profile-details-scroll">
        <HrProfileReadingRoom
          focusedProfile={focusedProfile}
          labels={labels}
          patchArtifact={patchArtifact}
          profilePreview={profilePreview}
          profileRevisionReview={profileRevisionReview}
          onReviewPatch={onReviewPatch}
          onSectionAction={onSectionAction}
        />
      </div>
    </section>
  )
}
