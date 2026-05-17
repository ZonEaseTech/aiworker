import type { HrWorkbenchCopy } from '../copy'

import { IconButton } from '@zonease/aiworker-component'
import { FileCheck2, FileText, ListChecks, MessageSquareText } from 'lucide-react'

interface ProfileToolsRailProps {
  labels: HrWorkbenchCopy
  onExpand: (target: HrProfileToolsRailTarget) => void
}

export type HrProfileToolsRailTarget = 'guardrails' | 'proposal' | 'sessions' | 'sources'

export function HrProfileToolsRail({ labels, onExpand }: ProfileToolsRailProps) {
  const items: Array<{ icon: typeof FileText, label: string, target: HrProfileToolsRailTarget }> = [
    { icon: FileText, label: labels.openProfileSources, target: 'sources' },
    { icon: FileCheck2, label: labels.openProposedChange, target: 'proposal' },
    { icon: ListChecks, label: labels.openReviewGuardrails, target: 'guardrails' },
    { icon: MessageSquareText, label: labels.openSessionTools, target: 'sessions' },
  ]

  return (
    <aside className="hr-profile-tools-rail" aria-label={labels.profileToolsRailLabel}>
      {items.map(({ icon: Icon, label, target }) => (
        <IconButton
          key={label}
          aria-label={label}
          className="hr-tools-rail-button"
          title={label}
          onClick={() => onExpand(target)}
        >
          <Icon aria-hidden="true" size={16} />
        </IconButton>
      ))}
    </aside>
  )
}
