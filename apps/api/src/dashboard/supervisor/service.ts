import type { Worker, WorkerConfig, WorkerContainerState } from '@aiworker/shared'

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import consola from 'consola'

import { commonConfig } from '../../config/common'
import { dashboardConfig } from '../../config/dashboard'
import { AppError } from '../../shared'
import { DockerClient } from './docker-client'

// PLAN-004 3.4: launch-local rewrite. The legacy `dashboard/fleet/service.ts`
// owned worker configs + container ids in fleet.db; 1.3 dropped those tables
// and 3.2 deleted the file. This supervisor is NOT wired into any route until
// the MANAGER_CAN_LAUNCH flag lands in 3.4 — the shims below keep the file
// type-clean while every `spawn/stop/restart/logs` entry point is unreachable.
async function getResolvedConfig(_workerId: string): Promise<WorkerConfig | null> {
  return null
}
function setContainerId(_workerId: string, _containerId: string | null): void {}

export class FleetSupervisor {
  private readonly docker: DockerClient

  constructor(dockerSocket: string = dashboardConfig.DOCKER_HOST) {
    this.docker = new DockerClient(dockerSocket)
  }

  async ensureInfrastructure() {
    await this.docker.ping()
    await this.docker.ensureNetwork(dashboardConfig.AIWORKER_NETWORK)
  }

  async spawn(worker: Worker): Promise<string> {
    const config = await getResolvedConfig(worker.id)
    if (!config)
      throw AppError.badRequest(`Worker ${worker.id} has no config`)

    const existing = await this.findContainerByLabel(worker.id)
    if (existing) {
      const state = (existing.State as string | undefined)?.toLowerCase()
      if (state === 'running')
        return existing.Id as string
      await this.docker.removeContainer(existing.Id as string, { force: true })
    }

    const env = this.buildEnv(worker, config)
    const volumeName = `aiworker_data_${worker.id}`

    const spec: Record<string, unknown> = {
      Image: worker.containerImage,
      Env: env,
      Labels: {
        'aiworker.role': 'worker',
        'aiworker.workerId': worker.id,
        'aiworker.slug': worker.slug,
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: dashboardConfig.AIWORKER_NETWORK,
        Memory: parseMemoryLimit(dashboardConfig.WORKER_MEMORY_LIMIT),
        NanoCpus: Math.round(dashboardConfig.WORKER_CPU_LIMIT * 1e9),
        Binds: [`${volumeName}:/var/lib/aiworker`],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [dashboardConfig.AIWORKER_NETWORK]: {
            Aliases: [`aiworker-${worker.id}`],
          },
        },
      },
    }

    const name = `aiworker-${worker.id}`
    const created = await this.docker.createContainer(name, spec)
    await this.docker.startContainer(created.Id)
    setContainerId(worker.id, created.Id)
    consola.success(`[supervisor] spawned ${name} (container ${created.Id.slice(0, 12)})`)
    return created.Id
  }

  async stop(worker: Worker): Promise<void> {
    const container = await this.findContainerByLabel(worker.id)
    if (!container)
      return
    await this.docker.stopContainer(container.Id as string)
    consola.info(`[supervisor] stopped ${worker.id}`)
  }

  async restart(worker: Worker): Promise<string> {
    await this.stop(worker)
    return this.spawn(worker)
  }

  async remove(worker: Worker, removeData = false): Promise<void> {
    const container = await this.findContainerByLabel(worker.id)
    if (container)
      await this.docker.removeContainer(container.Id as string, { force: true, removeVolumes: removeData })
    setContainerId(worker.id, null)
    consola.info(`[supervisor] removed ${worker.id}${removeData ? ' (with data)' : ''}`)
  }

  async inspect(worker: Worker): Promise<{ state: WorkerContainerState, raw?: Record<string, unknown> }> {
    const container = await this.findContainerByLabel(worker.id)
    if (!container)
      return { state: 'unknown' }
    const raw = await this.docker.inspectContainer(container.Id as string)
    const state = (raw.State as Record<string, unknown> | undefined)?.Status as string | undefined
    return { state: normalizeState(state), raw }
  }

  async logs(worker: Worker, opts?: { tail?: number }): Promise<string> {
    const container = await this.findContainerByLabel(worker.id)
    if (!container)
      return ''
    return this.docker.logs(container.Id as string, opts)
  }

  // PLAN-004 3.4 will wire MANAGER_CAN_LAUNCH + per-worker master-key persistence.
  // For now the supervisor is guarded by PLAN-004 3.1's 503 stubs (service.ts) and
  // never actually spawns, so the key generated here is inert. The shape matches
  // the post-PLAN-004 worker env so the file continues to typecheck.
  private buildEnv(worker: Worker, _config: WorkerConfig): string[] {
    return [
      `AIWORKER_MODE=worker`,
      `NODE_ENV=${commonConfig.NODE_ENV}`,
      `INTERNAL_SHARED_SECRET=${commonConfig.INTERNAL_SHARED_SECRET}`,
      `PORT=3001`,
      `WORKER_DB_PATH=${join('/var/lib/aiworker', 'worker.db')}`,
      `WORKER_MIGRATIONS_FOLDER=./drizzle/worker`,
      `AIWORKER_MASTER_KEY=${randomBytes(32).toString('hex')}`,
      `AIWORKER_FORCE_ID=${worker.id}`,
    ]
  }

  private async findContainerByLabel(workerId: string) {
    const list = await this.docker.listContainers({ label: [`aiworker.workerId=${workerId}`] })
    return list[0]
  }
}

function parseMemoryLimit(s: string): number {
  const m = /^(\d+)([bkmg])?$/i.exec(s.trim())
  if (!m)
    throw new Error(`Invalid memory limit: ${s}`)
  const n = Number(m[1])
  const unit = (m[2] ?? 'b').toLowerCase()
  const mult: Record<string, number> = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }
  return n * (mult[unit] ?? 1)
}

function normalizeState(s: string | undefined): WorkerContainerState {
  switch (s) {
    case 'running': return 'running'
    case 'created': return 'created'
    case 'restarting': return 'restarting'
    case 'exited': return 'exited'
    case 'paused':
    case 'dead':
    case 'removing':
    default:
      return s ? 'unknown' : 'stopped'
  }
}

let instance: FleetSupervisor | null = null

export function getFleetSupervisor(): FleetSupervisor {
  if (!instance)
    instance = new FleetSupervisor()
  return instance
}
