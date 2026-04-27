import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { WorkerShell } from '@/fleet/features/workers/components/worker-shell'
import { useRegisteredWorker } from '@/fleet/features/workers/hooks'
import { useWorkerStore } from '@/fleet/stores/worker'
import { buttonVariants } from '@/shared/components/ui/button-variants'
import { Skeleton } from '@/shared/components/ui/skeleton'

function WorkerDetailPage() {
  const { workerId } = useParams({ from: '/workers/$workerId' })
  const setCurrentWorkerId = useWorkerStore(s => s.setCurrentWorkerId)
  const query = useRegisteredWorker(workerId)

  useEffect(() => {
    setCurrentWorkerId(workerId)
    return () => setCurrentWorkerId(null)
  }, [workerId, setCurrentWorkerId])

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full max-w-3xl" />
      </div>
    )
  }

  if (query.isError && query.error instanceof WorkerApiError && query.error.code === 'not-found')
    return <WorkerNotFound id={workerId} />

  if (!query.data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load worker
        {' '}
        {workerId}
        :
        {' '}
        {(query.error as Error | null)?.message ?? 'unknown error'}
      </div>
    )
  }

  return <WorkerShell worker={query.data} />
}

function WorkerNotFound({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <h1 className="text-2xl font-semibold">Worker not found</h1>
      <p className="text-sm text-muted-foreground">
        No registered worker with id
        {' '}
        <code className="rounded bg-muted px-1 font-mono">{id}</code>
        .
      </p>
      <Link to="/workers" className={buttonVariants({ variant: 'default' })}>
        Back to workers
      </Link>
    </div>
  )
}

export const Route = createFileRoute('/workers/$workerId')({
  component: WorkerDetailPage,
})
