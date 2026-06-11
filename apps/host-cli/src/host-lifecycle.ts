import type { Buffer } from 'node:buffer'
import type { HostCredentialBroker } from './host-credential-broker'
import type { OidcClientConfig, OidcFetch } from './host-oidc-client'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import process from 'node:process'

import { fileURLToPath } from 'node:url'
import { createOrgKeyCredentialBroker, loadOrgKeyBrokerConfigFromEnv } from './host-credential-broker'
import { createHostServer } from './host-server'
import { seedSoulReleasesFromDir } from './host-soul-seed'

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
  hostBrowserBaseUrl?: string
  hostControlBaseUrl?: string
  manifestPath?: string
  mode: HostLifecycleMode
  port: number
  publicBaseUrl?: string
  seedSoulsDir?: string
  sessionAuth?: HostLifecycleSessionAuthOptions
  webPort?: number
  webStaticDir?: string
}

export interface HostLifecycleSessionAuthOptions {
  bootstrapAdminEmails?: string[]
  fetch?: OidcFetch
  now?: () => Date
  oidc: OidcClientConfig
  randomBytes?: (size: number) => Buffer
  sessionSecret: string
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
  foreground: (input: HostLifecycleStartInput) => Promise<Record<string, unknown>>
  logs: (input: HostLifecycleLogsInput) => Promise<string>
  restart: (input: HostLifecycleStartInput) => Promise<Record<string, unknown>>
  start: (input: HostLifecycleStartInput) => Promise<Record<string, unknown>>
  status: (input: HostLifecycleStatusInput) => Promise<Record<string, unknown>>
  stop: (input: HostLifecycleStopInput) => Promise<Record<string, unknown>>
}

const modulePath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(modulePath), '..', '..', '..')
const DEFAULT_HOST_DEV_ADMIN_EMAIL = 'admin@example.com'
let activeForegroundServer: ReturnType<typeof Bun.serve> | null = null

export function createHostLifecycle(): HostLifecycle {
  return {
    clean: cleanHostLifecycle,
    foreground: foregroundHostLifecycle,
    logs: hostLifecycleLogs,
    restart: restartHostLifecycle,
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

async function foregroundHostLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  if (input.mode === 'dev')
    return startHostDevForegroundLifecycle(input)
  return startHostProdForegroundLifecycle(input)
}

async function restartHostLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  const stopped = await stopHostLifecycle({ manifestPath: input.manifestPath })
  const started = await startHostLifecycle(input)
  return {
    restarted: stopped.stopped === true,
    started,
    stopped,
  }
}

async function startHostDevLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  const env = {
    ...process.env,
    AIWORKER_HOST: input.host,
    AIWORKER_HOST_API_URL: normalizePublicBaseUrl(input.publicBaseUrl ?? `http://${input.host}:${input.port}`),
    AIWORKER_HOST_API_PORT: String(input.port),
    AIWORKER_HOST_DB: input.dbPath,
    AIWORKER_HOST_DEV_ADMIN_EMAIL: input.devAdminEmail ?? process.env.AIWORKER_HOST_DEV_ADMIN_EMAIL ?? DEFAULT_HOST_DEV_ADMIN_EMAIL,
    ...(input.manifestPath ? { AIWORKER_HOST_MANIFEST: input.manifestPath } : {}),
    ...(input.hostBrowserBaseUrl ? { AIWORKER_HOST_BROWSER_BASE_URL: input.hostBrowserBaseUrl } : {}),
    ...(input.hostControlBaseUrl ? { AIWORKER_HOST_CONTROL_BASE_URL: input.hostControlBaseUrl } : {}),
    ...(input.webPort ? { AIWORKER_HOST_WEB_PORT: String(input.webPort) } : {}),
    ...(input.seedSoulsDir ? { AIWORKER_HOST_SEED_SOULS_DIR: input.seedSoulsDir } : {}),
    ...hostSessionAuthEnv(input.sessionAuth),
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
  const manifestPath = resolveManifestPath(input.manifestPath)
  const existing = readManifest(manifestPath)
  const existingDaemon = existing?.services.find(service => service.kind === 'host-daemon' || service.kind === 'host-serve')
  if (existing && existingDaemon && serviceRunning(existingDaemon)) {
    return {
      ...lifecycleStartView(existing, manifestPath),
      daemon: {
        pid: existingDaemon.pid ?? null,
        running: true,
        started: false,
      },
    }
  }

  const webStaticDir = resolveHostWebStaticDir(input.webStaticDir)
  const logFile = join(dirname(manifestPath), 'host-daemon.log')
  mkdirSync(dirname(manifestPath), { recursive: true })
  const fd = openSync(logFile, 'a')
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl ?? `http://${input.host}:${input.port}`)
  const cliPath = hostCliEntrypoint()
  const child = spawn(process.execPath, [
    cliPath,
    'daemon',
    'foreground',
    '--db',
    input.dbPath,
    '--host',
    input.host,
    '--port',
    String(input.port),
    '--public-base-url',
    publicBaseUrl,
    '--manifest',
    manifestPath,
    '--web-static-dir',
    webStaticDir,
    ...(input.hostBrowserBaseUrl ? ['--browser-base-url', input.hostBrowserBaseUrl] : []),
    ...(input.hostControlBaseUrl ? ['--control-base-url', input.hostControlBaseUrl] : []),
    ...(!input.sessionAuth && input.devAdminEmail ? ['--dev-admin-email', input.devAdminEmail] : []),
    ...(input.seedSoulsDir ? ['--seed-souls-dir', input.seedSoulsDir] : []),
  ], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      ...hostSessionAuthEnv(input.sessionAuth),
    },
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
      { kind: 'host-daemon', logFile, pid: child.pid, port: input.port },
    ],
    webUrl: `${publicBaseUrl}/host`,
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await waitForReachable(`${publicBaseUrl}/host`, child.pid)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    ...lifecycleStartView(manifest, manifestPath),
    daemon: {
      logFile,
      pid: child.pid ?? null,
      running: true,
      started: true,
    },
  }
}

async function startHostProdForegroundLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  const webStaticDir = resolveHostWebStaticDir(input.webStaticDir)
  const manifestPath = resolveManifestPath(input.manifestPath)
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl ?? `http://${input.host}:${input.port}`)
  mkdirSync(dirname(manifestPath), { recursive: true })
  const credentialBroker = buildOrgKeyBrokerFromEnv()
  const server = await createHostServer({
    authUser: !input.sessionAuth && input.devAdminEmail
      ? {
          email: input.devAdminEmail,
          roles: ['host:admin'],
          subject: 'dev-admin',
        }
      : null,
    ...(credentialBroker ? { credentialBroker } : {}),
    dbPath: input.dbPath,
    ...(input.hostBrowserBaseUrl ? { hostBrowserBaseUrl: input.hostBrowserBaseUrl } : {}),
    ...(input.hostControlBaseUrl ? { hostControlBaseUrl: input.hostControlBaseUrl } : {}),
    publicBaseUrl,
    ...(input.sessionAuth ? { sessionAuth: input.sessionAuth } : {}),
    webStaticDir,
  })
  if (input.seedSoulsDir)
    seedSoulReleasesFromDir(input.seedSoulsDir, message => process.stderr.write(`${message}\n`))
  const bunServer = Bun.serve({
    fetch: (request, bunServer) => server.fetch(request, bunServer),
    hostname: input.host,
    port: input.port,
    websocket: server.websocket,
  })
  const actualPort = bunServer.port
  if (typeof actualPort !== 'number')
    throw new Error('Host daemon server did not expose a bound port')
  activeForegroundServer = bunServer
  const manifest: HostLifecycleManifest = {
    apiUrl: publicBaseUrl,
    db: input.dbPath,
    mode: 'prod',
    profile: 'host',
    services: [
      { kind: 'host-daemon', pid: process.pid, port: actualPort },
    ],
    webUrl: `${publicBaseUrl}/host`,
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const shutdown = () => {
    bunServer.stop()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return {
    ...lifecycleStartView(manifest, manifestPath),
    daemon: {
      pid: process.pid,
      running: true,
      started: false,
    },
    foreground: true,
  }
}

async function startHostDevForegroundLifecycle(input: HostLifecycleStartInput): Promise<Record<string, unknown>> {
  const manifestPath = resolveManifestPath(input.manifestPath)
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl ?? `http://${input.host}:${input.port}`)
  const webUrl = `http://${input.host}:${input.webPort ?? 5050}/host`
  mkdirSync(dirname(manifestPath), { recursive: true })
  const credentialBroker = buildOrgKeyBrokerFromEnv()
  const server = await createHostServer({
    authUser: !input.sessionAuth && input.devAdminEmail
      ? {
          email: input.devAdminEmail,
          roles: ['host:admin'],
          subject: 'dev-admin',
        }
      : null,
    ...(credentialBroker ? { credentialBroker } : {}),
    dbPath: input.dbPath,
    ...(input.hostBrowserBaseUrl ? { hostBrowserBaseUrl: input.hostBrowserBaseUrl } : {}),
    ...(input.hostControlBaseUrl ? { hostControlBaseUrl: input.hostControlBaseUrl } : {}),
    publicBaseUrl,
    ...(input.sessionAuth ? { sessionAuth: input.sessionAuth } : {}),
    webBaseUrl: webUrl,
  })
  if (input.seedSoulsDir)
    seedSoulReleasesFromDir(input.seedSoulsDir, message => process.stderr.write(`${message}\n`))
  const bunServer = Bun.serve({
    fetch: (request, bunServer) => server.fetch(request, bunServer),
    hostname: input.host,
    port: input.port,
    websocket: server.websocket,
  })
  const actualPort = bunServer.port
  if (typeof actualPort !== 'number')
    throw new Error('Host daemon server did not expose a bound port')
  activeForegroundServer = bunServer
  const manifest: HostLifecycleManifest = {
    apiUrl: publicBaseUrl,
    db: input.dbPath,
    mode: 'dev',
    profile: 'host',
    services: [
      { kind: 'host-daemon', pid: process.pid, port: actualPort },
    ],
    webUrl,
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const shutdown = () => {
    bunServer.stop()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return {
    ...lifecycleStartView(manifest, manifestPath),
    daemon: {
      pid: process.pid,
      running: true,
      started: false,
    },
    foreground: true,
  }
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
    const tmuxName = serviceTmuxName(service)
    if (tmuxName) {
      runCommand('tmux', [`kill-${'sess'}ion`, '-t', `=${tmuxName}`], { allowFailure: true, cwd: repoRoot, env: process.env })
      continue
    }
    if (service.pid === process.pid && activeForegroundServer) {
      activeForegroundServer.stop()
      activeForegroundServer = null
      continue
    }
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

// Phase 3: build the org-key credential broker from Host env. Returns undefined
// when no gateway profile env is configured, so the credential frames stay a
// no-op until an operator opts in (mirrors how sessionAuth is env-gated).
function buildOrgKeyBrokerFromEnv(): HostCredentialBroker | undefined {
  const config = loadOrgKeyBrokerConfigFromEnv(process.env)
  if (!config)
    return undefined
  return createOrgKeyCredentialBroker(config)
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
    const response = await fetch(url, { redirect: 'manual' })
    return response.status >= 200 && response.status < 400
  }
  catch {
    return false
  }
}

function hostSessionAuthEnv(sessionAuth: HostLifecycleSessionAuthOptions | undefined): NodeJS.ProcessEnv {
  if (!sessionAuth)
    return {}

  return {
    AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS: sessionAuth.oidc.allowedEmailDomains.join(','),
    ...(sessionAuth.bootstrapAdminEmails?.length ? { AIWORKER_HOST_BOOTSTRAP_ADMINS: sessionAuth.bootstrapAdminEmails.join(',') } : {}),
    AIWORKER_HOST_SESSION_SECRET: sessionAuth.sessionSecret,
    LOGTO_CLIENT_ID: sessionAuth.oidc.clientId,
    LOGTO_CLIENT_SECRET: sessionAuth.oidc.clientSecret,
    LOGTO_ENDPOINT: sessionAuth.oidc.endpoint,
    LOGTO_ISSUER: sessionAuth.oidc.issuer,
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
    if (pid && !serviceRunning({ kind: 'host-daemon', pid, port: 0 }))
      throw new Error(`Host daemon exited before becoming reachable: ${url}`)
    lastError = `attempt ${attempt + 1}`
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Host daemon did not become reachable at ${url}: ${lastError}`)
}

function normalizePublicBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveHostWebStaticDir(webStaticDir?: string): string {
  const candidates = [
    ...(webStaticDir ? [webStaticDir] : []),
    process.env.AIWORKER_HOST_WEB_STATIC_DIR,
    resolve(dirname(modulePath), 'web', 'host'),
    resolve(dirname(modulePath), '..', 'web', 'host'),
    resolve(dirname(modulePath), '..', '..', 'host-web', 'dist'),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)

  for (const candidate of candidates) {
    const resolved = resolve(candidate)
    if (existsSync(join(resolved, 'index.html')))
      return resolved
  }

  throw new Error('Host Web static assets were not found. Run `bun run --filter @zonease/aiworker-host-web build` or pass --web-static-dir <path>.')
}

function selectService(manifest: HostLifecycleManifest, serviceName: string | undefined): HostLifecycleService | null {
  if (!serviceName)
    return manifest.services.find(service => service.kind === 'host-api' || service.kind === 'host-daemon' || service.kind === 'host-serve') ?? manifest.services[0] ?? null
  if (serviceName === 'api')
    return manifest.services.find(service => service.kind === 'host-api' || service.kind === 'host-daemon' || service.kind === 'host-serve') ?? null
  if (serviceName === 'daemon')
    return manifest.services.find(service => service.kind === 'host-daemon') ?? null
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
