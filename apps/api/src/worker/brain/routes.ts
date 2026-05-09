import type { BrainSummaryDecisionPipelineConfig } from '@zonease/aiworker-core'

import process from 'node:process'
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
  /**
   * PLAN-116: caller supplies the current decision-pipeline config so the
   * `/summary` response can report truthful evaluator / mode / threshold.
   * Optional — if omitted, reasonable defaults (heuristic + observe) apply.
   */
  getDecisionPipelineConfig?: () => BrainSummaryDecisionPipelineConfig
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
  /** BUG-055 secret-body policy. Default `'block'`. */
  allowSecretBody: z.enum(['block', 'redact', 'raw']).optional(),
})

/**
 * TODO-009: debug-only inbound `propose` body. The route is gated by the
 * `WORKER_DEV_TOOLS=true` env so production deployments cannot accept these
 * inserts even with a valid bearer.
 */
const proposeBody = z.object({
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.record(z.string(), z.unknown())).optional(),
  id: z.string().min(1).max(200),
  kind: z.string().min(1).max(80).default('memory-add'),
  payload: z.record(z.string(), z.unknown()).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  rollback: z.string().min(1).max(4000),
  scopeId: z.string().min(1).max(200).optional(),
  soulId: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  target: z.string().min(1).max(2000),
})

const DEV_TOOLS_ENABLED = process.env.WORKER_DEV_TOOLS === 'true'

/**
 * BUG-061: read-path redact gate. `?showSensitive=true` alone is not enough —
 * the worker process env must carry `AIWORKER_ADMIN_REVEAL=1`. This keeps
 * existing CLI / admin debug flows usable while making admin UI / fleet
 * relays incapable of accidentally surfacing plaintext through query string.
 */
function resolveAdmissionRedact(showSensitive: boolean): { redact: boolean, denied: boolean } {
  if (!showSensitive)
    return { redact: true, denied: false }
  if (process.env.AIWORKER_ADMIN_REVEAL === '1')
    return { redact: false, denied: false }
  return { redact: true, denied: true }
}

function admissionService() {
  return new BrainAdmissionService()
}
function artifactRegistry() {
  return new BrainArtifactRegistry()
}

export function buildBrainRoutes(deps: BrainRoutesDeps) {
  const routes = new OpenAPIHono()

  routes.get('/summary', (c) => {
    const summary = buildBrainSummary(deps.getDecisionPipelineConfig?.() ?? {})
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
    const gate = resolveAdmissionRedact(q.showSensitive === true)
    const redact = gate.redact
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
    const result = admissionService().list(filterOptions, { redactSensitive: redact })
    return c.json({
      count: result.proposals.length,
      redacted: redact,
      ...(gate.denied ? { showSensitiveDenied: 'missing-env-gate: set AIWORKER_ADMIN_REVEAL=1 in worker env' } : {}),
      proposals: result.proposals,
      skipped: result.skipped,
    })
  })

  routes.get('/admission/:id', (c) => {
    const showSensitive = c.req.query('showSensitive') === 'true'
    const gate = resolveAdmissionRedact(showSensitive)
    const id = c.req.param('id')
    const service = admissionService()
    const proposal = service.get(id, { redactSensitive: gate.redact })
    if (proposal === null) {
      return c.json({
        error: { code: 'not-found', message: `admission proposal "${id}" not found` },
      }, 404)
    }
    const decisions = service.listDecisions(id)
    return c.json({
      redacted: gate.redact,
      ...(gate.denied ? { showSensitiveDenied: 'missing-env-gate: set AIWORKER_ADMIN_REVEAL=1 in worker env' } : {}),
      proposal,
      decisions,
    })
  })

  routes.post('/admission', async (c) => {
    // TODO-009: debug-only injection path. Returns 403 in normal worker
    // deployments — operators must explicitly enable `WORKER_DEV_TOOLS=true`
    // to use it for fixture / demo flows.
    if (!DEV_TOOLS_ENABLED) {
      return c.json({
        error: {
          code: 'dev-tools-disabled',
          message: 'POST /admission is debug-only; set WORKER_DEV_TOOLS=true to enable',
        },
      }, 403)
    }
    const raw = await c.req.json().catch(() => null)
    const parsed = proposeBody.safeParse(raw)
    if (!parsed.success) {
      return c.json({
        error: { code: 'invalid-body', message: parsed.error.message },
      }, 400)
    }
    try {
      const input = parsed.data
      const proposal = admissionService().propose({
        confidence: input.confidence,
        id: input.id,
        kind: input.kind,
        rollback: input.rollback,
        soulId: input.soulId,
        summary: input.summary,
        target: input.target,
        ...(input.risk === undefined ? {} : { risk: input.risk }),
        ...(input.scopeId === undefined ? {} : { scopeId: input.scopeId }),
        ...(input.evidence === undefined ? {} : { evidence: input.evidence as never }),
        ...(input.payload === undefined ? {} : { payload: input.payload }),
      })
      return c.json({
        debugWarning: 'this proposal was injected via debug-only POST /admission; do not enable in production workflows',
        proposal,
      }, 201)
    }
    catch (err) {
      return mapAdmissionError(c, err)
    }
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
        ...(parsed.data.allowSecretBody === undefined ? {} : { allowSecretBody: parsed.data.allowSecretBody }),
      })
      const status = outcome.kind === 'failed'
        ? 500
        : outcome.kind === 'blocked-by-secret-scan'
          ? 409
          : 200
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
