import { createFileRoute } from '@tanstack/react-router'
import { EnrollList } from '@/fleet/features/enroll/components/enroll-list'

function EnrollPage() {
  return <EnrollList />
}

export const Route = createFileRoute('/enroll')({
  component: EnrollPage,
})
