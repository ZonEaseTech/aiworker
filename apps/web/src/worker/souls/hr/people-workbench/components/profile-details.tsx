import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { HrProfileSectionId } from '../profile-readme'
import type { ProfileRevisionReviewState } from '../revision-review'
import type { PersonProfile } from '../types'

import { NotebookText } from 'lucide-react'
import { WorkbenchSectionTitle } from '../../../common'
import { HrProfileReadingRoom } from './profile-reading-room'

interface ProfileDetailsProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  patchArtifact: LocalArtifact | null
  profilePreview: SoulProfilePreviewState
  profileRevisionReview: ProfileRevisionReviewState
  onReviewPatch: () => void
  onSectionAction: (sectionId: HrProfileSectionId) => void
}

export function HrProfileDetails({
  focusedProfile,
  labels,
  patchArtifact,
  profilePreview,
  profileRevisionReview,
  onReviewPatch,
  onSectionAction,
}: ProfileDetailsProps) {
  return (
    <section className="hr-profile-details" aria-label={labels.profileDetailsTitle}>
      <WorkbenchSectionTitle
        icon={<NotebookText size={15} />}
        title={labels.profileDetailsTitle}
        detail={focusedProfile ? labels.profileDetailsDetail(focusedProfile.name) : labels.profileDetailsEmpty}
      />
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
