import { ReviewPanelShell, StudioPill } from '@zonease/aiworker-component'
import '@zonease/aiworker-component/styles.css'

export function HrProfilePanelProof() {
  return (
    <ReviewPanelShell
      title="Profile Review"
      description="Shared review shell proof for a Soul-owned panel."
      actions={<StudioPill tone="success">Soul-owned meaning</StudioPill>}
    >
      <p>The HR Soul App decides what the review means. The shared package provides only the panel shell.</p>
    </ReviewPanelShell>
  )
}
