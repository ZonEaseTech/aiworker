import type { WorkerApiToken } from '@zonease/aiworker-shared'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import process from 'node:process'

import consola from 'consola'

import { DockerClient } from './docker-client'
import { LaunchFailedError, LaunchTimeoutError } from './errors'

export { LaunchFailedError, LaunchTimeoutError }

/**
 * 匹配 worker 首次启动时 stdout 打印的 bootstrap 行（源：`worker/bootstrap/print.ts`）。
 * 我们从 `docker logs` 抓它：worker 的 bootstrap token 只在容器内生成、
 * 永不走网络,gateway 注册时唯一能拿到 token 的路径就是这一行日志。
 */
const BOOTSTRAP_TOKEN_REGEX = /\[worker\] AIWORKER_BOOTSTRAP_TOKEN=(wtk_[\w-]{32,})/

/** bootstrap token 轮询默认预算：30s / 500ms 步长。 */
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
 * 供 supervisor 用的 docker 接口子集,测试可用 stub 注入而不需要真 daemon。
 */
export interface SupervisorDockerApi {
  ping: () => Promise<unknown>
  ensureNetwork: (name: string) => Promise<void>
  createContainer: (name: string, spec: Record<string, unknown>) => Promise<{ Id: string }>
  startContainer: (id: string) => Promise<void>
  stopContainer: (id: string) => Promise<void>
  removeContainer: (id: string, opts?: { force?: boolean, removeVolumes?: boolean }) => Promise<void>
  logs: (id: string, opts?: { tail?: number }) => Promise<string>
  inspectContainer: (id: string) => Promise<Record<string, unknown>>
}

/**
 * supervisor 运行时需要的全部静态配置。gateway 启动时从 GatewayConfig 拆出来
 * 显式喂进来——避免对 process.env 产生额外依赖，也方便测试。
 */
export interface SupervisorRuntimeConfig {
  dockerHost: string
  image: string
  network: string
  workerDataRoot: string
  workerMemoryLimit: string
  workerCpuLimit: number
  launchBaseUrlTemplate: string
  internalSharedSecret: string
  nodeEnv: string
}

export interface FleetSupervisorOptions {
  config: SupervisorRuntimeConfig
  docker?: SupervisorDockerApi
  /** 测试钩子——覆盖端口分配 + token 轮询频率。 */
  allocatePort?: () => Promise<number>
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /** 测试钩子：覆盖时钟,让 bootstrap 轮询快速结束。 */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /**
   * gateway 容器自身 id (网络自检用)。默认取 `HOSTNAME` (docker 对非 --hostname
   * 容器写入短 id)。`null` / 缺失 → soft-fail warning。
   */
  selfHostname?: string | null
}

/**
 * FleetSupervisor —— docker-engine 封装,`AIWORKER_GATEWAY_CAN_LAUNCH=true` 打开。
 *
 * 唯一对外暴露的操作是 {@link launchLocal}: 起一个 worker 容器,从 stdout 抓
 * bootstrap token,把 `(workerId, baseUrl, apiToken)` 三元组交给 registry 层
 * 做加密落库。supervisor 本身不管后续 worker 生命周期——重启/移除走 docker CLI
 * 或 worker 自身 `/api/worker/*` 管道。
 */
export class FleetSupervisor {
  private readonly config: SupervisorRuntimeConfig
  private readonly docker: SupervisorDockerApi
  private readonly allocatePort: () => Promise<number>
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly selfHostname: string | null

  constructor(options: FleetSupervisorOptions) {
    this.config = options.config
    this.docker = options.docker ?? new DockerClient(options.config.dockerHost)
    this.allocatePort = options.allocatePort ?? allocateFreePort
    this.pollIntervalMs = options.pollIntervalMs ?? LAUNCH_POLL_INTERVAL_MS
    this.pollTimeoutMs = options.pollTimeoutMs ?? LAUNCH_POLL_TIMEOUT_MS
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
    this.selfHostname = options.selfHostname === undefined
      ? (process.env.HOSTNAME ?? null)
      : options.selfHostname
  }

  async ensureInfrastructure(): Promise<void> {
    await this.docker.ping()
    await this.docker.ensureNetwork(this.config.network)
    await this.ensureSelfJoinedNetwork(this.config.network)
  }

  /**
   * gateway 自检:必须是 `AIWORKER_NETWORK` 的成员,否则新拉的 worker 容器在
   * `http://{containerName}:9217` 只对**同网络**的容器可达,gateway 对其 `/info`
   * 探测会静默 502,fleet 行永远处于 `offline`。
   *
   * soft-fail 语义:
   *   - `selfHostname` 缺失 / 不是 12-hex docker 短 id → warn + skip
   *     (`bun dev`、单元测试、裸机场景);
   *   - `inspectContainer` 404 → warn + skip (hostname 不是本 daemon 上容器);
   *   - inspect 成功但未加入网络 → 抛 `LaunchFailedError`。
   */
  private async ensureSelfJoinedNetwork(networkName: string): Promise<void> {
    const hostname = this.selfHostname
    if (!hostname || !/^[0-9a-f]{12,64}$/i.test(hostname)) {
      consola.warn(`[gateway/supervisor] HOSTNAME=${hostname ?? '(unset)'} is not a docker container id; skipping self-in-network check`)
      return
    }
    let info: Record<string, unknown>
    try {
      info = await this.docker.inspectContainer(hostname)
    }
    catch (err) {
      consola.warn(`[gateway/supervisor] could not inspect self-container ${hostname}: ${(err as Error).message}; skipping self-in-network check`)
      return
    }
    const networks = (info.NetworkSettings as { Networks?: Record<string, unknown> } | undefined)?.Networks
    if (!networks || typeof networks !== 'object') {
      consola.warn(`[gateway/supervisor] inspect of ${hostname} returned no NetworkSettings.Networks; skipping self-in-network check`)
      return
    }
    if (!(networkName in networks)) {
      throw new LaunchFailedError(
        `gateway container ${hostname} is not a member of docker network '${networkName}'. `
        + `Attach it via docker compose (networks: [${networkName}]) or \`docker network connect\` before enabling launch; `
        + `otherwise launched workers will be unreachable at the rendered baseUrl.`,
      )
    }
  }

  /**
   * 拉起 worker 容器时要注入的 env list。
   * 对齐 worker 侧最新 bootstrap——只关心 master key / port / WORKER_DB_PATH 等几项。
   */
  buildEnv(options: { masterKeyHex: string, port: number, forceId?: string }): string[] {
    const env = [
      `AIWORKER_MODE=worker`,
      `AIWORKER_MASTER_KEY=${options.masterKeyHex}`,
      `PORT=${options.port}`,
      `WORKER_DB_PATH=${join('/var/lib/aiworker', 'worker.db')}`,
      `NODE_ENV=${this.config.nodeEnv}`,
      `INTERNAL_SHARED_SECRET=${this.config.internalSharedSecret}`,
      `WORKER_MIGRATIONS_FOLDER=./drizzle/worker`,
    ]
    if (options.forceId)
      env.push(`AIWORKER_FORCE_ID=${options.forceId}`)
    return env
  }

  /**
   * 在本地 docker daemon 上启动一个 worker 容器并返回 pair 所需三元组:
   *   1. 分配空闲端口 + 新 master key;
   *   2. `docker run` 启动容器,bind-mount `workerDataRoot/<name>` 保留 worker 身份;
   *   3. 轮询 `docker logs` 直到 bootstrap token 行出现,或超时;
   *   4. 用 template 渲染 baseUrl 返回;
   *   5. step 2 之后失败,尽力清掉半成品容器。
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

    const port = await this.allocatePort()
    const masterKeyHex = randomBytes(32).toString('hex')
    const slug = randomBytes(4).toString('hex')
    const containerName = `aiworker-${slug}`
    const hostDataDir = join(this.config.workerDataRoot, containerName)

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
      Image: this.config.image,
      Env: env,
      Labels: {
        'aiworker.role': 'worker',
        'aiworker.addedBy': 'launch-local',
        'aiworker.displayName': input.displayName,
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: this.config.network,
        Memory: parseMemoryLimit(this.config.workerMemoryLimit),
        NanoCpus: Math.round(this.config.workerCpuLimit * 1e9),
        Binds: [`${hostDataDir}:/var/lib/aiworker`],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [this.config.network]: {
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
      consola.info(`[gateway/supervisor] spawned ${containerName} (container ${created.Id.slice(0, 12)}); polling for bootstrap token`)

      const parsed = await this.awaitBootstrapToken(created.Id)
      const baseUrl = renderBaseUrlTemplate(
        this.config.launchBaseUrlTemplate,
        { containerName, port: String(port) },
      )

      consola.success(`[gateway/supervisor] ${containerName} bootstrapped as ${parsed.workerId}`)
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
          consola.warn(`[gateway/supervisor] failed to cleanup ${containerId}: ${(cleanupErr as Error).message}`)
        }
      }
      if (err instanceof LaunchTimeoutError || err instanceof LaunchFailedError)
        throw err
      throw new LaunchFailedError(`launch failed: ${(err as Error).message}`, err)
    }
  }

  /**
   * 轮询 `docker logs` 直到找到 `[worker] id=...` 与 `[worker] AIWORKER_BOOTSTRAP_TOKEN=...`
   * 两行。两者都由 worker `printBootstrapIfJustMinted` 在首启时打印一次。
   */
  private async awaitBootstrapToken(containerId: string): Promise<{ workerId: string, token: WorkerApiToken }> {
    const deadline = this.now() + this.pollTimeoutMs
    while (this.now() < deadline) {
      let logs: string
      try {
        logs = await this.docker.logs(containerId, { tail: 200 })
      }
      catch (err) {
        // 容器可能还未 emit 日志——保持同一步长重试
        consola.debug(`[gateway/supervisor] logs read failed, retrying: ${(err as Error).message}`)
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
   * 可选的清理钩子——本版本是 no-op: 通过 supervisor 启动的容器 RestartPolicy
   * 是 `unless-stopped`,生命周期跟 gateway 解耦。
   */
  async shutdown(): Promise<void> {
    // 目前无状态需要收尾。
  }
}

/** 暴露出去便于单测直接校验正则解析。 */
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
 * 向内核要一个空闲 TCP 端口,立刻释放 socket。
 * docker 绑回来前几乎不会有别的进程抢,针对的是单机 deploy 场景。
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
