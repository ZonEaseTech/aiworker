import { Card, CardContent, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'

export interface MountWorkerConfigProps {
  // configMicroAppEntry as reported by the worker control-protocol `worker.describe` verb.
  entry: string
  label?: string
  name?: string
}

// Management mount: the Host control plane mounts a worker's configuration
// micro-app via `router-mode="search"` — the only production mounted-workbench
// transport (AGENTS.md Protocol Boundary). Host resolves one entry and passes
// locator context; the Soul owns its internal routes, domain UI and API.
export function MountWorkerConfig({ entry, label = 'Worker configuration', name = 'worker-config' }: MountWorkerConfigProps) {
  return (
    <Card data-slot="host-management-mount" className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <micro-app
          data-slot="worker-config-micro-app"
          destroy
          name={name}
          router-mode="search"
          url={entry}
          className="min-h-0 w-full flex-1"
        />
      </CardContent>
    </Card>
  )
}

export interface HostControlPlaneProps {
  // The Worker's config micro-app entry as reported by the control-protocol
  // `worker.describe` verb (configMicroAppEntry). Defaults to the canonical v1
  // broker endpoint `/api/mount/workbench` (architecture.md: management and
  // employee mounts share the single endpoint; the distinction is topological).
  // The host daemon supplies the resolved per-worker entry in later plans.
  configMicroAppEntry?: string
}

// Control-plane web shell: frames the Worker configuration micro-app in the Host's
// managed context (architecture.md Management mount). Worker registry/assignment
// surfaces are wired in later plans.
export function HostControlPlane({ configMicroAppEntry = '/api/mount/workbench' }: HostControlPlaneProps = {}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">AIWorker Host</h1>
        <p className="text-muted-foreground text-sm">
          Distribute, manage, authorize connectors, and mount worker configuration micro-apps.
        </p>
      </header>
      <MountWorkerConfig entry={configMicroAppEntry} />
    </main>
  )
}
