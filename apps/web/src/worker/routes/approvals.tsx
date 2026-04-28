import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPanel } from '@/worker/features/approvals/approvals-panel'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPanel,
})
