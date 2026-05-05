import type { WorkerInfoBrainSummary } from '@zonease/aiworker-shared'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { parseScopeManifestJson } from '@zonease/aiworker-shared'
import { brainAdmissionProposals, brainArtifacts, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { sql } from 'drizzle-orm'

import { getDecisionPipelineSnapshot } from '../orchestrator/decision-pipeline-stats'

/** PLAN-116 decision pipeline config view used by brainSummary builders. */
export interface BrainSummaryDecisionPipelineConfig {
  intentEvaluator?: 'heuristic' | 'llm'
  qualityEvaluator?: 'heuristic' | 'llm'
  qualityMode?: 'observe' | 'warn' | 'retry' | 'block'
  qualityThreshold?: number
  conversationClassifierEnabled?: boolean
}

/**
 * Build the WorkerInfo brain summary (PLAN-103, extended in PLAN-116 with the
 * decision pipeline truthfulness snapshot). Pure aggregation —
 * `byStatus` counters + the most recent admission `updatedAt`. Never
 * surfaces proposal payloads, artifact refs, evidence, or canonical brain
 * file content; fleet.db consumers must drill down via worker REST.
 */
export function buildBrainSummary(
  decisionPipelineConfig: BrainSummaryDecisionPipelineConfig = {},
): WorkerInfoBrainSummary {
  return {
    admissions: buildAdmissionSummary(),
    artifacts: buildArtifactSummary(),
    decisionPipeline: getDecisionPipelineSnapshot(decisionPipelineConfig),
    scopeManifest: buildScopeManifestSummary(),
  }
}

function buildArtifactSummary(): WorkerInfoBrainSummary['artifacts'] {
  const rows = getWorkerDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number), status: brainArtifacts.status })
    .from(brainArtifacts)
    .groupBy(brainArtifacts.status)
    .all()
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = row.count
    total += row.count
  }
  return { byStatus, total }
}

function buildAdmissionSummary(): WorkerInfoBrainSummary['admissions'] {
  const rows = getWorkerDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number), status: brainAdmissionProposals.status })
    .from(brainAdmissionProposals)
    .groupBy(brainAdmissionProposals.status)
    .all()
  const byStatus: Record<string, number> = {}
  for (const row of rows)
    byStatus[row.status] = row.count

  const latest = getWorkerDb()
    .select({ updatedAt: brainAdmissionProposals.updatedAt })
    .from(brainAdmissionProposals)
    .orderBy(sql`updated_at DESC`)
    .limit(1)
    .all()
  const lastUpdatedAt = latest[0]?.updatedAt
  const result: WorkerInfoBrainSummary['admissions'] = { byStatus }
  if (lastUpdatedAt !== undefined)
    result.lastUpdatedAt = lastUpdatedAt
  return result
}

function buildScopeManifestSummary(): WorkerInfoBrainSummary['scopeManifest'] {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot)
    return { status: 'not-applicable' }
  const scopePath = path.join(scope.projectRoot, '.aiworker', 'scope.json')
  if (!existsSync(scopePath))
    return { status: 'missing' }
  let raw: string
  try {
    raw = readFileSync(scopePath, 'utf8')
  }
  catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      status: 'malformed',
    }
  }
  const parsed = parseScopeManifestJson(raw)
  if (parsed.status === 'malformed') {
    return {
      error: parsed.error,
      status: 'malformed',
    }
  }
  const m = parsed.manifest
  const result: WorkerInfoBrainSummary['scopeManifest'] = {
    kind: m.kind,
    primarySoul: m.primarySoul,
    status: 'ok',
  }
  if (m.privacy !== undefined)
    result.privacy = m.privacy
  if (m.approval !== undefined)
    result.approval = m.approval
  return result
}
