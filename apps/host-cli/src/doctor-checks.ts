import type { Check, ProbeDeps } from '@zonease/aiworker-cli-doctor'

import {
  bunRuntimeChecks,
  envPresence,
  httpProbe,
  inspectCommand,
  makeResult,
} from '@zonease/aiworker-cli-doctor'

import { logtoSessionRequiredEnvKeys } from './aiworker-host'

const DEFAULT_OPTIONS_URL = 'http://127.0.0.1:9117/api/host/options'

export interface AisshConnectivity {
  ok: boolean
  detail?: string
}

export interface DockerConnectivity {
  ok: boolean
  detail?: string
}

export interface BuildHostChecksDeps {
  /** Absolute path to the per-user bun the shim falls back to, e.g. `$HOME/.bun/bin/bun`. */
  homeBunPath: string
  /** Reports whether the Host daemon lifecycle is currently running. */
  daemonRunning: () => boolean | Promise<boolean>
  /** Number of Soul releases visible to the Host (descriptors next to it). */
  soulReleaseCount: () => number | Promise<number>
  /** Environment map the Logto presence check reads (defaults to process.env). */
  env?: Record<string, string | undefined>
  /** Existence probe used by the bun-runtime checks (defaults to fs.existsSync). */
  exists?: (path: string) => boolean
  /** Injected command/version lookup deps (spawn/env) for inspectCommand. */
  probe?: ProbeDeps
  /** Connectivity probe for `aissh server list` (only run when ctx.probe). */
  aisshConnectivity?: () => AisshConnectivity | Promise<AisshConnectivity>
  /** Connectivity probe for `docker ps` (only run when ctx.probe). */
  dockerConnectivity?: () => DockerConnectivity | Promise<DockerConnectivity>
  /** Host API URL hit by the service connectivity probe. */
  optionsUrl?: string
  /** fetch implementation for the Host API connectivity probe. */
  fetch?: typeof fetch
}

// The Host control-plane doctor checks. The neutral framework lives in
// @zonease/aiworker-cli-doctor; this module only wires Host-specific inputs.
export function buildHostChecks(deps: BuildHostChecksDeps): Check[] {
  const probeDeps = deps.probe ?? {}
  const optionsUrl = deps.optionsUrl ?? DEFAULT_OPTIONS_URL

  return [
    ...bunRuntimeChecks({
      ...(deps.exists ? { exists: deps.exists } : {}),
      homeBunPath: deps.homeBunPath,
      prefix: 'host',
      probe: probeDeps,
    }),
    {
      category: 'auth',
      id: 'host.auth.logto',
      label: 'Logto auth',
      run: () => {
        const { missing, present } = envPresence([...logtoSessionRequiredEnvKeys], deps.env)
        if (missing.length === 0) {
          return makeResult({
            category: 'auth',
            detail: `Logto configured (${present.length}/${present.length} keys)`,
            id: 'host.auth.logto',
            label: 'Logto auth',
            severity: 'ok',
          })
        }
        if (present.length > 0) {
          return makeResult({
            category: 'auth',
            detail: `Logto half-configured — ${present.length} set, missing: ${missing.join(', ')} (partial config breaks Host startup)`,
            fix: {
              docs: '/etc/aiworker-host/host.env',
              message: 'set every Logto key in /etc/aiworker-host/host.env (systemd EnvironmentFile)',
            },
            id: 'host.auth.logto',
            label: 'Logto auth',
            severity: 'error',
          })
        }
        return makeResult({
          category: 'auth',
          detail: 'no Logto keys set — dev-static only; production needs Logto',
          fix: {
            docs: '/etc/aiworker-host/host.env',
            message: `set Logto keys in /etc/aiworker-host/host.env (systemd EnvironmentFile): ${missing.join(', ')}`,
          },
          id: 'host.auth.logto',
          label: 'Logto auth',
          severity: 'warn',
        })
      },
    },
    {
      category: 'provisioning',
      id: 'host.provisioning.aissh',
      label: 'aissh provisioning',
      run: async (ctx) => {
        const found = inspectCommand('aissh', probeDeps)
        if (!found.found) {
          return makeResult({
            category: 'provisioning',
            detail: 'aissh not found — remote aissh provisioning unavailable',
            fix: { message: 'install aissh or fix PATH' },
            id: 'host.provisioning.aissh',
            label: 'aissh provisioning',
            severity: 'warn',
          })
        }
        if (ctx.probe && deps.aisshConnectivity) {
          const connectivity = await deps.aisshConnectivity()
          if (!connectivity.ok) {
            return makeResult({
              category: 'provisioning',
              detail: `aissh found (${found.path}) but \`aissh server list\` failed${connectivity.detail ? `: ${connectivity.detail}` : ''}`,
              fix: { message: 'check aissh credentials / connectivity' },
              id: 'host.provisioning.aissh',
              label: 'aissh provisioning',
              probed: true,
              severity: 'warn',
            })
          }
          return makeResult({
            category: 'provisioning',
            detail: `aissh reachable (${found.path})`,
            id: 'host.provisioning.aissh',
            label: 'aissh provisioning',
            probed: true,
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'provisioning',
          detail: found.version ? `aissh ${found.version} (${found.path})` : `aissh found (${found.path})`,
          id: 'host.provisioning.aissh',
          label: 'aissh provisioning',
          severity: 'ok',
        })
      },
    },
    {
      category: 'provisioning',
      id: 'host.provisioning.docker',
      label: 'docker provisioning',
      run: async (ctx) => {
        const found = inspectCommand('docker', probeDeps)
        if (!found.found) {
          return makeResult({
            category: 'provisioning',
            detail: 'docker not found — docker provisioning unavailable',
            fix: { message: 'install and start docker' },
            id: 'host.provisioning.docker',
            label: 'docker provisioning',
            severity: 'warn',
          })
        }
        if (ctx.probe && deps.dockerConnectivity) {
          const connectivity = await deps.dockerConnectivity()
          if (!connectivity.ok) {
            return makeResult({
              category: 'provisioning',
              detail: `docker found (${found.path}) but \`docker ps\` failed${connectivity.detail ? `: ${connectivity.detail}` : ''}`,
              fix: { message: 'start the docker daemon' },
              id: 'host.provisioning.docker',
              label: 'docker provisioning',
              probed: true,
              severity: 'warn',
            })
          }
          return makeResult({
            category: 'provisioning',
            detail: `docker reachable (${found.path})`,
            id: 'host.provisioning.docker',
            label: 'docker provisioning',
            probed: true,
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'provisioning',
          detail: found.version ? `docker ${found.version} (${found.path})` : `docker found (${found.path})`,
          id: 'host.provisioning.docker',
          label: 'docker provisioning',
          severity: 'ok',
        })
      },
    },
    {
      category: 'provisioning',
      id: 'host.provisioning.any',
      label: 'remote provisioning',
      run: () => {
        const aissh = inspectCommand('aissh', probeDeps)
        const docker = inspectCommand('docker', probeDeps)
        if (aissh.found || docker.found) {
          const available = [aissh.found ? 'aissh' : null, docker.found ? 'docker' : null]
            .filter(Boolean)
            .join(', ')
          return makeResult({
            category: 'provisioning',
            detail: `remote provisioning available via ${available}`,
            id: 'host.provisioning.any',
            label: 'remote provisioning',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'provisioning',
          detail: 'aissh missing, docker missing — remote provisioning unavailable — local only',
          fix: { message: 'install aissh or docker for remote provisioning targets' },
          id: 'host.provisioning.any',
          label: 'remote provisioning',
          severity: 'warn',
        })
      },
    },
    {
      category: 'service',
      id: 'host.service.api',
      label: 'Host API',
      run: async (ctx) => {
        const running = await deps.daemonRunning()
        if (ctx.probe) {
          const result = await httpProbe(optionsUrl, deps.fetch ? { fetch: deps.fetch } : {})
          const reachable = result.status !== null
          if (reachable) {
            return makeResult({
              category: 'service',
              detail: `Host API reachable (HTTP ${result.status}) at ${optionsUrl}`,
              id: 'host.service.api',
              label: 'Host API',
              probed: true,
              severity: 'ok',
            })
          }
          return makeResult({
            category: 'service',
            detail: `Host API not reachable at ${optionsUrl}${result.error ? `: ${result.error}` : ''}`,
            fix: { command: 'aiworker-host daemon start', message: 'start the Host daemon' },
            id: 'host.service.api',
            label: 'Host API',
            probed: true,
            severity: 'warn',
          })
        }
        if (running) {
          return makeResult({
            category: 'service',
            detail: 'Host daemon running',
            id: 'host.service.api',
            label: 'Host API',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'service',
          detail: 'Host daemon not running',
          fix: { command: 'aiworker-host daemon start', message: 'start the Host daemon' },
          id: 'host.service.api',
          label: 'Host API',
          severity: 'warn',
        })
      },
    },
    {
      category: 'service',
      id: 'host.service.souls',
      label: 'Soul releases',
      run: async () => {
        const count = await deps.soulReleaseCount()
        if (count > 0) {
          return makeResult({
            category: 'service',
            detail: `${count} Soul release${count === 1 ? '' : 's'} visible to Host`,
            id: 'host.service.souls',
            label: 'Soul releases',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'service',
          detail: '0 soul releases visible to Host — assignments blind-pass soulRef',
          fix: { message: 'build souls / ship descriptors next to the Host' },
          id: 'host.service.souls',
          label: 'Soul releases',
          severity: 'warn',
        })
      },
    },
  ]
}
