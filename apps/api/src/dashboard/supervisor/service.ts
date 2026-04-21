import type { WorkerApiToken } from '@aiworker/shared'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

import consola from 'consola'

import { commonConfig } from '../../config/common'
import { dashboardConfig } from '../../config/dashboard'
import { DockerClient } from './docker-client'
import { LaunchFailedError, LaunchTimeoutError } from './errors'

export { LaunchFailedError, LaunchTimeoutError }

/**
 * Matches the single line the worker prints at first boot — see
 * `worker/bootstrap/print.ts`. We scrape it out of `docker logs` because the
 * worker is offline-first: its bootstrap token is generated *inside* the new
 * container and never transits the network. The manager's only way to
 * register an id is to read that logged line once at launch.
 */
const BOOTSTRAP_TOKEN_REGEX = /\[worker\] AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]{32,})/

/** Default poll budget for the bootstrap token: 30s with 500ms steps. */
const LAUNCH_POLL_TIMEOUT_MS = 30_000
const LAUNCH_POLL_INTERVAL_MS = 500

export interface LaunchLocalInput {
  displayName: string
  forceId?: string
}

export interface LaunchLocalResult {
  workerId: string
  baseUrl: string
  apiToken: WorkerApiToken
  containerId: string
  containerName: string
}

/**
 * Minimal surface used by the supervisor — lets tests inject a stub docker
 * implementation without needing a real daemon.
 */
export interface SupervisorDockerApi {
  ping: () => Promise<unknown>
  ensureNetwork: (name: string) => Promise<void>
  createContainer: (name: string, spec: Record<string, unknown>) => Promise<{ Id: string }>
  startContainer: (id: string) => Promise<void>
  stopContainer: (id: string) => Promise<void>
  removeContainer: (id: string, opts?: { force?: boolean, removeVolumes?: boolean }) => Promise<void>
  logs: (id: string, opts?: { tail?: number }) => Promise<string>
}

export interface FleetSupervisorOptions {
  docker?: SupervisorDockerApi
  /** Test hook — override port allocation + token polling cadence. */
  allocatePort?: () => Promise<number>
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /** Override the clock; used by tests to short-circuit the poller. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * FleetSupervisor — docker-engine wrapper gated behind `MANAGER_CAN_LAUNCH`.
 *
 * The only operation wired up for PLAN-004 is {@link launchLocal}: spin up a
 * fresh worker container, scrape its bootstrap token out of stdout, and hand
 * the `(workerId, baseUrl, apiToken)` triple back to the registry layer so it
 * can persist the encrypted pointer. The supervisor does NOT own worker
 * lifecycle past launch — restart/remove goes through the docker CLI directly
 * or the worker's own `/api/worker/*` surface.
 */
export class FleetSupervisor {
  private readonly docker: SupervisorDockerApi
  private readonly allocatePort: () => Promise<number>
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: FleetSupervisorOptions = {}) {
    this.docker = options.docker ?? new DockerClient(dashboardConfig.DOCKER_HOST)
    this.allocatePort = options.allocatePort ?? allocateFreePort
    this.pollIntervalMs = options.pollIntervalMs ?? LAUNCH_POLL_INTERVAL_MS
    this.pollTimeoutMs = options.pollTimeoutMs ?? LAUNCH_POLL_TIMEOUT_MS
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  }

  async ensureInfrastructure(): Promise<void> {
    await this.docker.ping()
    await this.docker.ensureNetwork(dashboardConfig.AIWORKER_NETWORK)
  }

  /**
   * Env list passed to a launch-local worker container. PLAN-004 simplified
   * the worker env down to the four vars the new offline-first bootstrap
   * actually reads — the old `WORKER_ID` / `WORKER_CONFIG_JSON` / `WORKER_CONFIG_VERSION`
   * trio is gone. `AIWORKER_FORCE_ID` is injected only when the caller wants
   * to pin the container's future workerId for test / replay scenarios.
   */
  buildEnv(options: { masterKeyHex: string, port: number, forceId?: string }): string[] {
    const env = [
      `AIWORKER_MODE=worker`,
      `AIWORKER_MASTER_KEY=${options.masterKeyHex}`,
      `PORT=${options.port}`,
      `WORKER_DB_PATH=${join('/var/lib/aiworker', 'worker.db')}`,
      `NODE_ENV=${commonConfig.NODE_ENV}`,
      `INTERNAL_SHARED_SECRET=${commonConfig.INTERNAL_SHARED_SECRET}`,
      `WORKER_MIGRATIONS_FOLDER=./drizzle/worker`,
    ]
    if (options.forceId)
      env.push(`AIWORKER_FORCE_ID=${options.forceId}`)
    return env
  }

  /**
   * Launch a fresh worker container on the local docker daemon and return
   * the admission triple the registry needs. Steps:
   *
   *   1. Allocate a free port + mint a per-worker master key.
   *   2. `docker run` with the 3.4 env set; bind-mount a host dir under
   *      `WORKER_DATA_ROOT/<containerName>` so successive restarts retain
   *      the worker's identity + config.
   *   3. Poll `docker logs` until the bootstrap token line shows up, or
   *      time out after {@link pollTimeoutMs}.
   *   4. Resolve the baseUrl via the operator's template and return.
   *   5. On any failure past step 2 we best-effort remove the container
   *      so the daemon isn't left with dangling half-provisioned boxes.
   */
  async launchLocal(input: LaunchLocalInput): Promise<LaunchLocalResult> {
    try {
      await this.ensureInfrastructure()
    }
    catch (err) {
      throw new LaunchFailedError(
        `docker infrastructure unavailable: ${(err as Error).message}`,
        err,
      )
    }

    const image = dashboardConfig.AIWORKER_IMAGE
    const dataRoot = dashboardConfig.WORKER_DATA_ROOT
    const memoryLimit = dashboardConfig.WORKER_MEMORY_LIMIT
    const cpuLimit = dashboardConfig.WORKER_CPU_LIMIT
    if (!image || !dataRoot || !memoryLimit || cpuLimit === undefined) {
      throw new LaunchFailedError(
        'MANAGER_CAN_LAUNCH=true requires AIWORKER_IMAGE / WORKER_DATA_ROOT / WORKER_MEMORY_LIMIT / WORKER_CPU_LIMIT',
      )
    }

    const port = await this.allocatePort()
    const masterKeyHex = randomBytes(32).toString('hex')
    const slug = randomBytes(4).toString('hex')
    const containerName = `aiworker-${slug}`
    const hostDataDir = join(dataRoot, containerName)

    try {
      mkdirSync(hostDataDir, { recursive: true })
    }
    catch (err) {
      throw new LaunchFailedError(
        `failed to create data dir ${hostDataDir}: ${(err as Error).message}`,
        err,
      )
    }

    const env = this.buildEnv({ masterKeyHex, port, forceId: input.forceId })

    const spec: Record<string, unknown> = {
      Image: image,
      Env: env,
      Labels: {
        'aiworker.role': 'worker',
        'aiworker.addedBy': 'launch-local',
        'aiworker.displayName': input.displayName,
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: dashboardConfig.AIWORKER_NETWORK,
        Memory: parseMemoryLimit(memoryLimit),
        NanoCpus: Math.round(cpuLimit * 1e9),
        Binds: [`${hostDataDir}:/var/lib/aiworker`],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [dashboardConfig.AIWORKER_NETWORK]: {
            Aliases: [containerName],
          },
        },
      },
    }

    let containerId: string | null = null
    try {
      const created = await this.docker.createContainer(containerName, spec)
      containerId = created.Id
      await this.docker.startContainer(created.Id)
      consola.info(`[supervisor] spawned ${containerName} (container ${created.Id.slice(0, 12)}); polling for bootstrap token`)

      const parsed = await this.awaitBootstrapToken(created.Id)
      const baseUrl = renderBaseUrlTemplate(
        dashboardConfig.AIWORKER_LAUNCH_BASE_URL_TEMPLATE,
        { containerName, port: String(port) },
      )

      consola.success(`[supervisor] ${containerName} bootstrapped as ${parsed.workerId}`)
      return {
        workerId: parsed.workerId,
        apiToken: parsed.token,
        baseUrl,
        containerId: created.Id,
        containerName,
      }
    }
    catch (err) {
      if (containerId) {
        try {
          await this.docker.removeContainer(containerId, { force: true, removeVolumes: false })
        }
        catch (cleanupErr) {
          consola.warn(`[supervisor] failed to cleanup ${containerId}: ${(cleanupErr as Error).message}`)
        }
      }
      if (err instanceof LaunchTimeoutError || err instanceof LaunchFailedError)
        throw err
      throw new LaunchFailedError(`launch-local failed: ${(err as Error).message}`, err)
    }
  }

  /**
   * Poll `docker logs` until the bootstrap token line shows up. We read the
   * first line out of `[worker] id=...` (for the workerId) and
   * `[worker] AIWORKER_BOOTSTRAP_TOKEN=...` (for the token); both are emitted
   * by `printBootstrapIfJustMinted` on the worker side and never reprinted
   * on subsequent reboots.
   */
  private async awaitBootstrapToken(containerId: string): Promise<{ workerId: string, token: WorkerApiToken }> {
    const deadline = this.now() + this.pollTimeoutMs
    while (this.now() < deadline) {
      let logs: string
      try {
        logs = await this.docker.logs(containerId, { tail: 200 })
      }
      catch (err) {
        // Container may not have emitted yet — retry with the same cadence
        consola.debug(`[supervisor] logs read failed, retrying: ${(err as Error).message}`)
        await this.sleep(this.pollIntervalMs)
        continue
      }

      const parsed = parseBootstrapFromLogs(logs)
      if (parsed)
        return parsed
      await this.sleep(this.pollIntervalMs)
    }
    throw new LaunchTimeoutError(
      `bootstrap token not observed in container ${containerId.slice(0, 12)} after ${this.pollTimeoutMs}ms`,
    )
  }

  /**
   * Optional cleanup hook. No-op for this pass — containers started via
   * `launchLocal` persist across manager restarts (see RestartPolicy
   * `unless-stopped`) and are tracked by labels rather than in-memory state.
   */
  async shutdown(): Promise<void> {
    // No poller state to tear down yet.
  }
}

/**
 * Extract `{ workerId, token }` from a blob of container stdout, or null if
 * the bootstrap lines haven't been emitted yet. Exported for the unit test.
 */
export function parseBootstrapFromLogs(logs: string): { workerId: string, token: WorkerApiToken } | null {
  const tokenMatch = BOOTSTRAP_TOKEN_REGEX.exec(logs)
  if (!tokenMatch)
    return null
  const idMatch = /\[worker\] id=(w_[0-9a-hjkmnp-tv-z]{12})/.exec(logs)
  if (!idMatch)
    return null
  return {
    workerId: idMatch[1]!,
    token: tokenMatch[1]! as WorkerApiToken,
  }
}

function renderBaseUrlTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
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

/**
 * Ask the kernel for a free TCP port. The socket is released immediately;
 * by the time docker binds to it nothing else is expected to race us on the
 * single-host deploy this feature targets.
 */
function allocateFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      }
      else {
        srv.close(() => reject(new Error('failed to allocate free port')))
      }
    })
  })
}

let instance: FleetSupervisor | null = null

export function getFleetSupervisor(): FleetSupervisor {
  if (!instance)
    instance = new FleetSupervisor()
  return instance
}

/** Test hook — reset the singleton so each test gets a fresh supervisor. */
export function resetFleetSupervisorForTests(): void {
  instance = null
}
