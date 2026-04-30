import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, Power, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { RemoveWorkerDialog } from '@/fleet/features/workers/components/remove-worker-dialog'
import { RotateTokenDialog } from '@/fleet/features/workers/components/rotate-token-dialog'
import { StopWorkerDialog } from '@/fleet/features/workers/components/stop-worker-dialog'
import { useRegisteredWorker } from '@/fleet/features/workers/hooks'
import { formatRelativeTime, stateBadgeLabel, stateBadgeVariant, truncateWorkerId } from '@/fleet/features/workers/utils'
import { useWorkerStore } from '@/fleet/stores/worker'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { buttonVariants } from '@/shared/components/ui/button-variants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

/**
 * Fleet 视角的 worker detail：只展示 fleet.db 视野里的元数据 + fleet-hosted
 * worker UI 入口。worker 业务数据仍在 worker.db，gateway 只做受控 bridge。
 */
function WorkerDetailPage() {
  const { workerId } = useParams({ from: '/workers/$workerId' })
  const setCurrentWorkerId = useWorkerStore(s => s.setCurrentWorkerId)
  const query = useRegisteredWorker(workerId)
  const [pendingAction, setPendingAction] = useState<'rotate' | 'remove' | 'stop' | null>(null)

  useEffect(() => {
    setCurrentWorkerId(workerId)
    return () => setCurrentWorkerId(null)
  }, [workerId, setCurrentWorkerId])

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-2">
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

  const worker = query.data
  const adminUrl = workerUiPath(worker.id)
  const isOnline = worker.lastSeenState === 'online'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/workers"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to workers
          </Link>
          <h1 className="text-2xl font-bold">
            {worker.displayName}
          </h1>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {truncateWorkerId(worker.id)}
            </code>
            {' · '}
            <Badge variant={stateBadgeVariant(worker.lastSeenState)}>
              {stateBadgeLabel(worker.lastSeenState)}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'default' })}
          >
            <ExternalLink className="size-4" />
            Open worker UI
          </a>
          <Button
            variant="outline"
            onClick={() => setPendingAction('rotate')}
          >
            <RefreshCw className="size-4" />
            Rotate token
          </Button>
          <Button
            variant="outline"
            disabled={!isOnline}
            title={!isOnline ? 'Stop is only available while the worker is online.' : undefined}
            onClick={() => setPendingAction('stop')}
          >
            <Power className="size-4" />
            Stop runtime
          </Button>
          <Button
            variant="destructive"
            onClick={() => setPendingAction('remove')}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        </div>
      </div>

      <FleetMetadataCard worker={worker} />

      <SelfManageHint worker={worker} />

      {pendingAction === 'rotate' && (
        <RotateTokenDialog
          worker={worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
      {pendingAction === 'remove' && (
        <RemoveWorkerDialog
          worker={worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
      {pendingAction === 'stop' && (
        <StopWorkerDialog
          worker={worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
    </div>
  )
}

function FleetMetadataCard({ worker }: { worker: SafeRegisteredWorker }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet record</CardTitle>
        <CardDescription>
          fleet.db pointer for this worker. Config / secrets / cron / approvals
          live in the worker&apos;s own database; fleet opens a same-origin worker
          UI bridge for those.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">Worker id</dt>
          <dd className="break-all font-mono text-xs">{worker.id}</dd>
          <dt className="text-muted-foreground">Display name</dt>
          <dd>{worker.displayName}</dd>
          <dt className="text-muted-foreground">Base URL</dt>
          <dd className="break-all font-mono text-xs">{worker.baseUrl || '—'}</dd>
          <dt className="text-muted-foreground">Origin</dt>
          <dd className="font-mono text-xs">{worker.addedBy}</dd>
          <dt className="text-muted-foreground">Last seen</dt>
          <dd>{formatRelativeTime(worker.lastSeenAt)}</dd>
          <dt className="text-muted-foreground">Last config version</dt>
          <dd className="font-mono text-xs">{worker.lastConfigVersion ?? '—'}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}

function SelfManageHint({ worker }: { worker: SafeRegisteredWorker }) {
  const adminUrl = workerUiPath(worker.id)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet-hosted worker UI</CardTitle>
        <CardDescription>
          Config / secrets / cron / approvals / chat for this worker live in
          its own database. The fleet path opens the worker bundle through the
          gateway bridge.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={adminUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'outline' })}
        >
          <ExternalLink className="size-4" />
          {adminUrl}
        </a>
      </CardContent>
    </Card>
  )
}

function workerUiPath(workerId: string): string {
  return `/w/${workerId}/`
}

function WorkerNotFound({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <h1 className="text-2xl font-bold">Worker not found</h1>
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
