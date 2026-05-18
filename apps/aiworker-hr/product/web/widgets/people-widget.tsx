import { ProfileReaderShell, StudioStatusPill } from '@zonease/aiworker-component'
import '@zonease/aiworker-component/styles.css'

export function HrPeopleWidgetProof() {
  return (
    <ProfileReaderShell
      title="People Profile"
      description="Shared component proof for the HR Soul App Web surface."
      actions={<StudioStatusPill active>Shared UI</StudioStatusPill>}
    >
      <p>HR owns the profile meaning. The shared package owns this shell.</p>
    </ProfileReaderShell>
  )
}
