import { createFileRoute } from '@tanstack/react-router'
import { WorkersList } from '@/features/workers/components/workers-list'

function WorkersListPage() {
  return <WorkersList />
}

export const Route = createFileRoute('/workers/')({
  component: WorkersListPage,
})
