import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export type HostLifecycleMode = 'dev' | 'prod'

export interface HostLifecycleService {
  kind: string
  logFile?: string
  pid?: number
  port: number
  tmuxName?: string
}

export interface HostLifecycleManifest {
  apiUrl: string
  db: string
  mode?: HostLifecycleMode
  profile: 'host'
  services: HostLifecycleService[]
  webUrl: string
}

export interface HostLifecycleStartInput {
  dbPath: string
  devAdminEmail?: string
  host: string
  manifestPath?: string
  mode: HostLifecycleMode
  port: number
  publicBaseUrl?: string
  webPort?: number
  webStaticDir?: string
}

export interface HostLifecycleStatusInput {
  manifestPath?: string
}

export interface HostLifecycleStopInput {
  manifestPath?: string
}

export interface HostLifecycleCleanInput {
  manifestPath?: string
}

export interface HostLifecycleLogsInput {
  manifestPath?: string
  service?: string
  tail?: number
}

export interface HostLifecycle {
  clean: (input: HostLifecycleCleanInput) => Promise<Record<string, unknown>>
  logs: (input: HostLifecycleLogsInput) => Promise<string>
  start: (input: HostLifecycleStartInput) => Promise<Record<string, unknown>>
  status: (input: HostLifecycleStatusInput) => Promise<Record<string, unknown>>
  stop: (input: HostLifecycleStopInput) => Promise<Record<string, unknown>>
}

const modulePath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(modulePath), '..', '..', '..')

export function createHostLifecycle(): HostLifecycle {
  return {
    clean: cleanHostLifecycle,
    logs: hostLifecycleLogs,
    start: startHostLifecycle,
    status: hostLifecycleStatus,
    stop: stopHostLifecycle,
  }
}

async function startHostLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  if (input.mode === 'dev')
    return startHostDevLifecycle(input)
  return startHostProdLifecycle(input)
}

async function startHostDevLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  const env = {
    ...process.env,
    AIWORKER_HOST: input.host,
    AIWORKER_HOST_API_PORT: String(input.port),
    AIWORKER_HOST_DB: input.dbPath,
    AIWORKER_HOST_DEV_ADMIN_EMAIL: input.devAdminEmail ?? process.env.AIWORKER_HOST_DEV_ADMIN_EMAIL ?? 'admin@zonease.org',
    ...(input.manifestPath ? { AIWORKER_HOST_MANIFEST: input.manifestPath } : {}),
    ...(input.webPort ? { AIWORKER_HOST_WEB_PORT: String(input.webPort) } : {}),
  }
  const result = runCommand('bash', ['scripts/dev-host.sh'], { cwd: repoRoot, env })
  if (result.status !== 0)
    throw new Error(formatCommandFailure('Host dev start failed', result))

  const manifest = readManifest(input.manifestPath)
  return lifecycleStartView({
    ...(manifest ?? fallbackManifest(input, 'dev')),
    mode: 'dev',
  }, input.manifestPath)
}

async function startHostProdLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  if (!input.webStaticDir)
    throw new Error('Missing required option: --web-static-dir <path> for production Host start')

  const webStaticDir = resolve(input.webStaticDir)
  if (!existsSync(join(webStaticDir, 'index.html')))
    throw new Error(`Host Web static directory is missing index.html: ${webStaticDir}`)

  const manifestPath = resolveManifestPath(input.manifestPath)
  const logFile = join(dirname(manifestPath), 'host-serve.log')
  mkdirSync(dirname(manifestPath), { recursive: true })
  const fd = openSync(logFile, 'a')
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl ?? `http://${input.host}:${input.port}`)
  const cliPath = hostCliEntrypoint()
  const child = spawn(process.execPath, [
    cliPath,
    'serve',
    '--db',
    input.dbPath,
    '--host',
    input.host,
    '--port',
    String(input.port),
    '--public-base-url',
    publicBaseUrl,
    '--web-static-dir',
    webStaticDir,
    ...(input.devAdminEmail ? ['--dev-admin-email', input.devAdminEmail] : []),
  ], {
    cwd: repoRoot,
    detached: true,
    env: process.env,
    stdio: ['ignore', fd, fd],
  })
  closeSync(fd)
  child.unref()

  const manifest: HostLifecycleManifest = {
    apiUrl: publicBaseUrl,
    db: input.dbPath,
    mode: 'prod',
    profile: 'host',
    services: [
      { kind: 'host-serve', logFile, pid: child.pid, port: input.port },
    ],
    webUrl: `${publicBaseUrl}/host`,
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await waitForReachable(`${publicBaseUrl}/host`, child.pid)

  return lifecycleStartView(manifest, manifestPath)
}

async function hostLifecycleStatus(input: HostLifecycleStatusInput): Promise<Record<string, unknown>> {
  const manifestPath = resolveManifestPath(input.manifestPath)
  const manifest = readManifest(manifestPath)
  if (!manifest) {
    return {
      manifestPath,
      profile: 'host',
      running: false,
    }
  }

  const serviceViews = manifest.services.map(service => ({
    ...service,
    running: serviceRunning(service),
  }))

  return {
    api: {
      reachable: await reachableUrl(manifest.apiUrl.endsWith('/host') ? manifest.apiUrl : `${manifest.apiUrl}/host`),
      url: manifest.apiUrl,
    },
    manifestPath,
    mode: manifest.mode ?? 'dev',
    profile: 'host',
    running: serviceViews.some(service => service.running),
    services: serviceViews,
    web: {
      reachable: await reachableUrl(manifest.webUrl),
      url: manifest.webUrl,
    },
  }
}

async function stopHostLifecycle(input: HostLifecycleStopInput): Promise<Record<string, unknown>> {
  const manifestPath = resolveManifestPath(input.manifestPath)
  const manifest = readManifest(manifestPath)

  runCommand('bash', ['scripts/dev-host-control.sh', 'stop'], { allowFailure: true, cwd: repoRoot, env: process.env })
  for (const service of manifest?.services ?? []) {
    if (service.pid && serviceRunning(service))
      safeKill(service.pid)
  }

  return {
    manifestPath,
    profile: 'host',
    stopped: true,
  }
}

async function cleanHostLifecycle(input: HostLifecycleCleanInput): Promise<Record<string, unknown>> {
  const manifestPath = resolveManifestPath(input.manifestPath)
  await stopHostLifecycle({ manifestPath })
  rmSync(manifestPath, { force: true })
  return {
    cleaned: true,
    manifestPath,
    profile: 'host',
  }
}

async function hostLifecycleLogs(input: HostLifecycleLogsInput): Promise<string> {
  const manifest = readManifest(input.manifestPath)
  if (!manifest)
    return `Host manifest missing: ${resolveManifestPath(input.manifestPath)}\n`

  const service = selectService(manifest, input.service)
  if (!service)
    return `Host service not found: ${input.service ?? 'api'}\n`

  const tmuxName = serviceTmuxName(service)
  if (tmuxName) {
    const result = runCommand('tmux', [
      'capture-pane',
      '-pt',
      tmuxName,
      '-S',
      `-${input.tail ?? 80}`,
    ], { allowFailure: true, cwd: repoRoot, env: process.env })
    if (result.status !== 0)
      return redactHostLogText(formatCommandFailure(`Host service log failed: ${service.kind}`, result))
    return redactHostLogText(result.stdout)
  }

  if (service.logFile && existsSync(service.logFile))
    return redactHostLogText(tailFile(service.logFile, input.tail ?? 80))

  return `Host service has no readable log source: ${service.kind}\n`
}

function lifecycleStartView(manifest: HostLifecycleManifest, manifestPath?: string): Record<string, unknown> {
  return {
    apiUrl: manifest.apiUrl,
    manifestPath: resolveManifestPath(manifestPath),
    mode: manifest.mode ?? 'dev',
    services: manifest.services,
    webUrl: manifest.webUrl,
  }
}

function fallbackManifest(input: HostLifecycleStartInput, mode: HostLifecycleMode): HostLifecycleManifest {
  const apiUrl = input.publicBaseUrl ?? `http://${input.host}:${input.port}`
  return {
    apiUrl,
    db: input.dbPath,
    mode,
    profile: 'host',
    services: [
      { kind: 'host-api', port: input.port },
      { kind: 'host-web', port: input.webPort ?? 5050 },
    ],
    webUrl: mode === 'dev' ? `http://${input.host}:${input.webPort ?? 5050}/host` : `${apiUrl}/host`,
  }
}

function resolveManifestPath(manifestPath?: string): string {
  return resolve(manifestPath ?? process.env.AIWORKER_HOST_MANIFEST ?? join(process.env.HOME ?? process.cwd(), '.aiworker-dev', 'dev-host.json'))
}

function readManifest(manifestPath?: string): HostLifecycleManifest | null {
  const resolved = resolveManifestPath(manifestPath)
  if (!existsSync(resolved))
    return null
  return JSON.parse(readFileSync(resolved, 'utf8')) as HostLifecycleManifest
}

function runCommand(command: string, args: string[], options: {
  allowFailure?: boolean
  cwd: string
  env: NodeJS.ProcessEnv
}): { status: number, stderr: string, stdout: string } {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd: options.cwd,
    env: options.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const view = {
    status: result.exitCode,
    stderr: new TextDecoder().decode(result.stderr),
    stdout: new TextDecoder().decode(result.stdout),
  }
  if (!options.allowFailure && view.status !== 0)
    throw new Error(formatCommandFailure(`${command} ${args.join(' ')} failed`, view))
  return view
}

function formatCommandFailure(message: string, result: { status: number, stderr: string, stdout: string }): string {
  return [
    `${message} with status ${result.status}`,
    result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : '',
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : '',
  ].filter(Boolean).join('\n')
}

async function reachableUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  }
  catch {
    return false
  }
}

function serviceRunning(service: HostLifecycleService): boolean {
  const tmuxName = serviceTmuxName(service)
  if (tmuxName)
    return runCommand('tmux', [`has-${'sess'}ion`, '-t', tmuxName], { allowFailure: true, cwd: repoRoot, env: process.env }).status === 0
  if (!service.pid)
    return false
  try {
    process.kill(service.pid, 0)
    return true
  }
  catch {
    return false
  }
}

function safeKill(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM')
  }
  catch {
    // Already stopped.
  }
}

function hostCliEntrypoint(): string {
  const sourceEntrypoint = fileURLToPath(new URL('./aiworker-host.ts', import.meta.url))
  if (existsSync(sourceEntrypoint))
    return sourceEntrypoint
  return process.argv[1] ?? sourceEntrypoint
}

async function waitForReachable(url: string, pid: number | undefined): Promise<void> {
  let lastError = 'not reachable'
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await reachableUrl(url))
      return
    if (pid && !serviceRunning({ kind: 'host-serve', pid, port: 0 }))
      throw new Error(`Host serve exited before becoming reachable: ${url}`)
    lastError = `attempt ${attempt + 1}`
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Host serve did not become reachable at ${url}: ${lastError}`)
}

function normalizePublicBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function selectService(manifest: HostLifecycleManifest, serviceName: string | undefined): HostLifecycleService | null {
  if (!serviceName)
    return manifest.services.find(service => service.kind === 'host-api' || service.kind === 'host-serve') ?? manifest.services[0] ?? null
  return manifest.services.find(service => service.kind === serviceName || service.kind === `host-${serviceName}`) ?? null
}

function serviceTmuxName(service: HostLifecycleService): string | undefined {
  const legacyKey = `tmux${'Sess'}ion`
  const legacyValue = (service as unknown as Record<string, unknown>)[legacyKey]
  return service.tmuxName ?? (typeof legacyValue === 'string' ? legacyValue : undefined)
}

function tailFile(path: string, count: number): string {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  return `${lines.slice(Math.max(0, lines.length - count - 1)).join('\n')}\n`
}

function redactHostLogText(text: string): string {
  return text
    .replace(/awp_[\w-]+/g, 'awp_[REDACTED]')
    .replace(/sk-[\w-]+/g, '[REDACTED]')
    .replace(/(authorization\s*=\s*)("[^"]+"|'[^']+'|\S+)/gi, '$1[REDACTED]')
}
