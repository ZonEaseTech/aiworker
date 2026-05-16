import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { NotebookText } from 'lucide-react'
import { WorkbenchSectionTitle } from '../../../common'
import { HrProfileReadingRoom } from './profile-reading-room'

interface ProfileDetailsProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  profilePreview: SoulProfilePreviewState
}

export function HrProfileDetails({
  focusedProfile,
  labels,
  profilePreview,
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
          profilePreview={profilePreview}
        />
      </div>
    </section>
  )
}
