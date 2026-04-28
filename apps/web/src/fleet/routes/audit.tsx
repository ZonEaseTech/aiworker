import { createFileRoute } from '@tanstack/react-router'
import { AuditList } from '@/fleet/features/audit/components/audit-list'

function AuditPage() {
  return <AuditList />
}

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})
