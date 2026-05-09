import process from 'node:process'

import consola from 'consola'

import { loadWorkerContext } from '../../context'

export interface RunsListOptions {
  limit?: number
}

export interface ArtifactListOptions {
  conversationId?: string
  limit?: number
  runId?: string
  status?: string
}

interface WorkbenchCommandDeps {
  fetch?: FetchLike
  loadWorkerContext?: () => Promise<WorkbenchContext>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface WorkbenchContext {
  token: string
  workerId: string
}

export async function runRunsList(options: RunsListOptions = {}, deps: WorkbenchCommandDeps = {}): Promise<number> {
  try {
    const { ctx, body } = await daemonJson<{ runs: unknown[] }>(`/api/worker/runs${queryString({ limit: options.limit })}`, {}, deps)
    console.log(JSON.stringify({ workerId: ctx.workerId, runs: body.runs }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker runs list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runRunsShow(runId: string, deps: WorkbenchCommandDeps = {}): Promise<number> {
  if (runId === undefined || runId.trim().length === 0) {
    consola.error('[aiworker runs show] run id is required')
    return 2
  }
  try {
    const { ctx, body } = await daemonJson<{ run: unknown }>(`/api/worker/runs/${encodeURIComponent(runId)}`, {}, deps)
    console.log(JSON.stringify({ workerId: ctx.workerId, run: body.run }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker runs show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runRunsCancel(runId: string, deps: WorkbenchCommandDeps = {}): Promise<number> {
  if (runId === undefined || runId.trim().length === 0) {
    consola.error('[aiworker runs cancel] run id is required')
    return 2
  }
  try {
    const { ctx, body } = await daemonJson<{ run: unknown }>(`/api/worker/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    }, deps)
    console.log(JSON.stringify({ workerId: ctx.workerId, run: body.run }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker runs cancel] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runArtifactsList(options: ArtifactListOptions = {}, deps: WorkbenchCommandDeps = {}): Promise<number> {
  const status = normalizeArtifactStatus(options.status)
  if (status === null) {
    consola.error(`[aiworker artifacts list] --status must be one of available | missing | archived, got "${options.status}"`)
    return 2
  }
  try {
    const { ctx, body } = await daemonJson<{ artifacts: unknown[] }>(`/api/worker/artifacts${queryString({
      conversationId: options.conversationId,
      limit: options.limit,
      runId: options.runId,
      status,
    })}`, {}, deps)
    console.log(JSON.stringify({ workerId: ctx.workerId, artifacts: body.artifacts }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker artifacts list] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export async function runArtifactsShow(artifactId: string, deps: WorkbenchCommandDeps = {}): Promise<number> {
  if (artifactId === undefined || artifactId.trim().length === 0) {
    consola.error('[aiworker artifacts show] artifact id is required')
    return 2
  }
  try {
    const { ctx, body } = await daemonJson<{ artifact: unknown }>(`/api/worker/artifacts/${encodeURIComponent(artifactId)}`, {}, deps)
    console.log(JSON.stringify({ workerId: ctx.workerId, artifact: body.artifact }, null, 2))
    return 0
  }
  catch (err) {
    consola.error(`[aiworker artifacts show] failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

async function daemonJson<T>(path: string, init: RequestInit, deps: WorkbenchCommandDeps): Promise<{ ctx: WorkbenchContext, body: T }> {
  const ctx = await (deps.loadWorkerContext ?? (() => loadWorkerContext({ silent: true }) as Promise<WorkbenchContext>))()
  const fetchImpl = deps.fetch ?? fetch
  const url = `${localWorkerBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: authHeaders(ctx.token, init.headers),
    })
  }
  catch (err) {
    throw new Error(`daemon unreachable at ${localWorkerBaseUrl()}: ${err instanceof Error ? err.message : String(err)}; start it with aiworker daemon start`)
  }

  const body = await readJsonBody(res)
  if (!res.ok)
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`)
  if (!body || typeof body !== 'object')
    throw new Error(`invalid JSON response from daemon: ${JSON.stringify(body)}`)
  return { ctx, body: body as T }
}

function queryString(values: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined)
      qs.set(key, String(value))
  }
  return qs.size === 0 ? '' : `?${qs.toString()}`
}

function normalizeArtifactStatus(status: string | undefined): 'available' | 'missing' | 'archived' | undefined | null {
  if (status === undefined)
    return undefined
  if (status === 'available' || status === 'missing' || status === 'archived')
    return status
  return null
}

function localWorkerBaseUrl(): string {
  const host = process.env.AIW_LOCAL_WORKER_HOST ?? 'localhost'
  const port = process.env.PORT ?? '9217'
  return `http://${host}:${port}`
}

function authHeaders(token: string, existing?: HeadersInit): Headers {
  const headers = new Headers(existing)
  headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function readJsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  }
  catch {
    return null
  }
}
