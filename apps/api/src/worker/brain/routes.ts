import { OpenAPIHono } from '@hono/zod-openapi'
import {
  BrainAdmissionService,
  BrainArtifactRegistry,
  buildBrainSummary,
} from '@zonease/aiworker-core'
import { resolveBrainHome } from '@zonease/aiworker-fs-layout'
import { z } from 'zod'

/**
 * Worker REST surface for FEAT-054 / PLAN-103.
 *
 * Mounted at `/api/worker/brain` under bearer-auth. Read endpoints default
 * to redacted output (confidential / secret artifact ref + admission
 * payload secret-like values replaced with `<redacted>`); operators must
 * pass `?showSensitive=true` to opt into raw values, mirroring CLI
 * `--show-sensitive`. Write endpoints are explicit POSTs against the core
 * admission service state machine; `apply` defaults to dry-run unless the
 * body sets `commit: true`.
 *
 * Worker REST never exposes orchestrator / executor secrets; those stay in
 * vault. Fleet UI does NOT replicate any of these payloads — it consumes
 * `/api/worker/info` (PLAN-103 brainSummary) for aggregates and links
 * out to this surface for drill-down.
 */

export interface BrainRoutesDeps {
  getWorkerId: () => string
}

const limitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  showSensitive: z.coerce.boolean().optional(),
})

const admissionListQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'applied', 'failed']).optional(),
  kind: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  soulId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  showSensitive: z.coerce.boolean().optional(),
})

const artifactListQuery = z.object({
  scopeId: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  status: z.enum(['active', 'archived', 'removed']).optional(),
  minSensitivity: z.enum(['public', 'internal', 'confidential', 'secret']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  showSensitive: z.coerce.boolean().optional(),
})

const decisionBody = z.object({
  decidedBy: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000).optional(),
})

const applyBody = z.object({
  decidedBy: z.string().min(1).max(200),
  /** Default false (dry-run). Caller must opt in to filesystem write. */
  commit: z.boolean().optional(),
})

function admissionService() {
  return new BrainAdmissionService()
}
function artifactRegistry() {
  return new BrainArtifactRegistry()
}

export function buildBrainRoutes(deps: BrainRoutesDeps) {
  const routes = new OpenAPIHono()

  routes.get('/summary', (c) => {
    const summary = buildBrainSummary()
    return c.json({
      workerId: deps.getWorkerId(),
      brainSummary: summary,
      checkedAt: new Date().toISOString(),
    })
  })

  routes.get('/admission', (c) => {
    const parsed = admissionListQuery.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-query', message: parsed.error.message },
      }, 400)
    }
    const q = parsed.data
    const redact = q.showSensitive !== true
    const filterOptions: Parameters<BrainAdmissionService['list']>[0] = {}
    if (q.status !== undefined)
      filterOptions.status = q.status
    if (q.kind !== undefined)
      filterOptions.kind = q.kind
    if (q.scopeId !== undefined)
      filterOptions.scopeId = q.scopeId
    if (q.soulId !== undefined)
      filterOptions.soulId = q.soulId
    if (q.limit !== undefined)
      filterOptions.limit = q.limit
    const proposals = admissionService().list(filterOptions, { redactSensitive: redact })
    return c.json({ count: proposals.length, redacted: redact, proposals })
  })

  routes.get('/admission/:id', (c) => {
    const showSensitive = c.req.query('showSensitive') === 'true'
    const id = c.req.param('id')
    const service = admissionService()
    const proposal = service.get(id, { redactSensitive: !showSensitive })
    if (proposal === null) {
      return c.json({
        error: { code: 'not-found', message: `admission proposal "${id}" not found` },
      }, 404)
    }
    const decisions = service.listDecisions(id)
    return c.json({ redacted: !showSensitive, proposal, decisions })
  })

  routes.post('/admission/:id/approve', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json().catch(() => null)
    const parsed = decisionBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: parsed.error.message },
      }, 400)
    }
    try {
      const proposal = admissionService().approve(id, {
        decidedBy: parsed.data.decidedBy,
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
      })
      return c.json({ decision: 'approved', proposal })
    }
    catch (err) {
      return mapAdmissionError(c, err)
    }
  })

  routes.post('/admission/:id/reject', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json().catch(() => null)
    const parsed = decisionBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: parsed.error.message },
      }, 400)
    }
    try {
      const proposal = admissionService().reject(id, {
        decidedBy: parsed.data.decidedBy,
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
      })
      return c.json({ decision: 'rejected', proposal })
    }
    catch (err) {
      return mapAdmissionError(c, err)
    }
  })

  routes.post('/admission/:id/apply', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json().catch(() => null)
    const parsed = applyBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: parsed.error.message },
      }, 400)
    }
    try {
      const brainHome = resolveBrainHome(deps.getWorkerId())
      const outcome = await admissionService().apply(id, {
        brainHome,
        commit: parsed.data.commit === true,
        decidedBy: parsed.data.decidedBy,
      })
      const status = outcome.kind === 'failed' ? 500 : 200
      return c.json({ outcome }, status)
    }
    catch (err) {
      return mapAdmissionError(c, err)
    }
  })

  routes.get('/artifacts', (c) => {
    const parsed = artifactListQuery.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-query', message: parsed.error.message },
      }, 400)
    }
    const q = parsed.data
    const redact = q.showSensitive !== true
    const filterOptions: Parameters<BrainArtifactRegistry['list']>[0] = {}
    if (q.scopeId !== undefined)
      filterOptions.scopeId = q.scopeId
    if (q.type !== undefined)
      filterOptions.type = q.type
    if (q.status !== undefined)
      filterOptions.status = q.status
    if (q.minSensitivity !== undefined)
      filterOptions.minSensitivity = q.minSensitivity
    if (q.limit !== undefined)
      filterOptions.limit = q.limit
    const artifacts = artifactRegistry().list(filterOptions, { redactSensitive: redact })
    return c.json({ count: artifacts.length, redacted: redact, artifacts })
  })

  routes.get('/artifacts/:id', (c) => {
    const showSensitive = c.req.query('showSensitive') === 'true'
    const id = c.req.param('id')
    const artifact = artifactRegistry().get(id, { redactSensitive: !showSensitive })
    if (artifact === null) {
      return c.json({
        error: { code: 'not-found', message: `brain artifact "${id}" not found` },
      }, 404)
    }
    return c.json({ redacted: !showSensitive, artifact })
  })

  // limit query echo helper used by clients that probe the surface
  routes.get('/artifacts/:id/echo-limit', (c) => {
    const parsed = limitQuery.safeParse(c.req.query())
    return c.json({ ok: parsed.success })
  })

  return routes
}

function mapAdmissionError(c: import('hono').Context, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string }).code
  if (code === 'not-found')
    return c.json({ error: { code: 'not-found', message } }, 404)
  if (code === 'duplicate-id')
    return c.json({ error: { code: 'conflict', message } }, 409)
  if (code === 'invalid-transition')
    return c.json({ error: { code: 'invalid-transition', message } }, 409)
  return c.json({ error: { code: 'invalid-state', message } }, 400)
}
