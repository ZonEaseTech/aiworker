import { Card, CardContent, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'

export interface WorkerDistributionSummaryProps {
  assignment: {
    soulVersion: string
    connectors: number
    permissions: number
  }
  worker: {
    id: string
    ready: boolean
    workbenchUrl: string
  }
}

export function WorkerDistributionSummary({ assignment, worker }: WorkerDistributionSummaryProps) {
  return (
    <Card data-slot="host-worker-distribution" className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>Soul distribution</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Soul version</p>
          <p className="font-medium">{assignment.soulVersion}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Worker</p>
          <p className="font-medium">{worker.id}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Authorization</p>
          <p className="font-medium">
            {assignment.connectors} connectors, {assignment.permissions} permissions
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Readiness</p>
          <p className="font-medium">{worker.ready ? 'Ready' : 'Not ready'}</p>
        </div>
        <div className="sm:col-span-2">
          <a
            data-slot="employee-workbench-link"
            className="text-primary font-medium underline-offset-4 hover:underline"
            href={worker.workbenchUrl}
          >
            Open Worker
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

export interface HostControlPlaneProps {
  workbenchUrl?: string
}

export function HostControlPlane({ workbenchUrl = '/' }: HostControlPlaneProps = {}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">AIWorker Host</h1>
        <p className="text-muted-foreground text-sm">
          Publish a Soul, assign it to employees, and track ready Worker terminals.
        </p>
      </header>
      <WorkerDistributionSummary
        assignment={{ soulVersion: 'aiworker-freeform@local', connectors: 0, permissions: 0 }}
        worker={{ id: 'employee-worker', ready: true, workbenchUrl }}
      />
    </main>
  )
}
