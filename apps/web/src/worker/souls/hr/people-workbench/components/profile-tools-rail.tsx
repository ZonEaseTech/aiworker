import type { HrWorkbenchCopy } from '../copy'

import { IconButton } from '@zonease/aiworker-component'
import { FileCheck2, FileText, ListChecks, MessageSquareText } from 'lucide-react'

interface ProfileToolsRailProps {
  labels: HrWorkbenchCopy
  onExpand: () => void
}

export function HrProfileToolsRail({ labels, onExpand }: ProfileToolsRailProps) {
  const items = [
    { icon: FileText, label: labels.openProfileSources },
    { icon: FileCheck2, label: labels.openProposedChange },
    { icon: ListChecks, label: labels.openReviewGuardrails },
    { icon: MessageSquareText, label: labels.openSessionTools },
  ]

  return (
    <aside className="hr-profile-tools-rail" aria-label={labels.profileToolsRailLabel}>
      {items.map(({ icon: Icon, label }) => (
        <IconButton
          key={label}
          aria-label={label}
          className="hr-tools-rail-button"
          title={label}
          onClick={onExpand}
        >
          <Icon aria-hidden="true" size={16} />
        </IconButton>
      ))}
    </aside>
  )
}
