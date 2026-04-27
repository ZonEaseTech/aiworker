import { createFileRoute } from '@tanstack/react-router'
import { WorkersList } from '@/fleet/features/workers/components/workers-list'

function WorkersListPage() {
  return <WorkersList />
}

export const Route = createFileRoute('/workers/')({
  component: WorkersListPage,
})
