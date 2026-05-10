import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  appendRunEvent,
  artifacts,
  closeWorkerDb,
  createLesson,
  createProject,
  createReview,
  createRun,
  files,
  getWorkerDb,
  initWorkerDb,
  lessons,
  listArtifacts,
  listFiles,
  listLessons,
  listProjects,
  listReviews,
  listRunEvents,
  listRuns,
  projects,
  registerArtifact,
  reviews,
  runEvents,
  runs,
  runWorkerMigrations,
  setSetting,
  settings,
  upsertFile,
  upsertWorkspace,
  workspaces,
} from './index'

describe('greenfield local worker schema', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-worker-db-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  function explain(query: string): string {
    const rows = getWorkerDb().all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${query}`))
    return rows.map(r => r.detail).join('\n')
  }

  it('creates only the greenfield local workspace tables plus security primitives', () => {
    const rows = getWorkerDb().all<{ name: string }>(
      sql.raw('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name'),
    ).map(row => row.name)

    expect(rows).toEqual([
      '__drizzle_migrations',
      'artifacts',
      'files',
      'lessons',
      'projects',
      'reviews',
      'run_events',
      'runs',
      'settings',
      'sqlite_sequence',
      'worker_config',
      'worker_identity',
      'worker_secrets',
      'workspaces',
    ])
  })

  it('persists the workspace -> project -> run -> artifact -> review -> lesson loop', () => {
    const workspace = upsertWorkspace({
      id: 'ws-1',
      name: 'Hiring workspace',
      rootPath: '/tmp/hiring',
      at: '2026-05-09T01:00:00.000Z',
    })
    expect(workspace.rootPath).toBe('/tmp/hiring')

    const projectRecord = createProject({
      id: 'project-1',
      workspaceId: workspace.id,
      title: 'Screen candidate',
      body: 'Review the candidate packet.',
      selectedSoulId: 'hr',
      selectedSkillId: 'candidate-screen',
      status: 'queued',
      at: '2026-05-09T01:01:00.000Z',
    })
    expect(listProjects(workspace.id)).toEqual([projectRecord])

    const run = createRun({
      id: 'run-1',
      workspaceId: workspace.id,
      projectId: projectRecord.id,
      executor: 'codex',
      prompt: projectRecord.body,
      status: 'running',
      metadataJson: { domain: 'hr' },
      at: '2026-05-09T01:02:00.000Z',
    })
    expect(listRuns(workspace.id)).toEqual([run])
    appendRunEvent({
      runId: run.id,
      seq: 1,
      type: 'status',
      payloadJson: { status: 'running' },
      at: '2026-05-09T01:02:01.000Z',
    })
    expect(listRunEvents(run.id)).toHaveLength(1)

    const file = upsertFile({
      id: 'file-1',
      workspaceId: workspace.id,
      path: 'reports/candidate.md',
      source: 'run',
      size: 128,
      at: '2026-05-09T01:03:00.000Z',
    })
    expect(file.path).toBe('reports/candidate.md')
    expect(file.kind).toBe('file')
    expect(listFiles(workspace.id)).toEqual([file])

    const artifact = registerArtifact({
      id: 'artifact-1',
      workspaceId: workspace.id,
      runId: run.id,
      path: file.path,
      title: 'Candidate review',
      metadataJson: { fileId: file.id },
      at: '2026-05-09T01:04:00.000Z',
    })
    expect(listArtifacts(workspace.id)).toEqual([artifact])
    const review = createReview({
      id: 'review-1',
      workspaceId: workspace.id,
      runId: run.id,
      artifactId: artifact.id,
      verdict: 'warn',
      findingsJson: [{ message: 'Needs source evidence' }],
      at: '2026-05-09T01:05:00.000Z',
    })
    expect(listReviews(workspace.id)).toEqual([review])
    const lesson = createLesson({
      id: 'lesson-1',
      workspaceId: workspace.id,
      sourceReviewId: review.id,
      statement: 'Always cite the candidate packet source.',
      evidenceJson: [{ reviewId: review.id }],
      at: '2026-05-09T01:06:00.000Z',
    })

    expect(lesson.status).toBe('proposed')
    expect(listLessons(workspace.id)).toEqual([lesson])
    expect(setSetting('executor.default', { engine: 'codex' }).valueJson).toEqual({ engine: 'codex' })
  })

  it('keeps indexes aligned with the new local workspace query paths', () => {
    expect(explain(`SELECT * FROM workspaces ORDER BY updated_at DESC LIMIT 20`)).toContain('workspaces_updated_at_idx')
    expect(explain(`SELECT * FROM projects WHERE workspace_id = 'ws-1' ORDER BY updated_at DESC LIMIT 20`)).toContain('projects_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM runs WHERE status = 'running' ORDER BY updated_at DESC LIMIT 20`)).toContain('runs_status_updated_at_idx')
    expect(explain(`SELECT * FROM run_events WHERE run_id = 'run-1' ORDER BY seq ASC LIMIT 200`)).toContain('run_events_run_seq')
    expect(explain(`SELECT * FROM files WHERE workspace_id = 'ws-1' ORDER BY updated_at DESC LIMIT 50`)).toContain('files_workspace_updated_at_idx')
    expect(explain(`SELECT * FROM files WHERE kind = 'generated' LIMIT 50`)).toContain('files_kind_idx')
    expect(explain(`SELECT * FROM artifacts WHERE status = 'available' ORDER BY updated_at DESC LIMIT 50`)).toContain('artifacts_status_updated_at_idx')
    expect(explain(`SELECT * FROM reviews WHERE workspace_id = 'ws-1' ORDER BY created_at DESC LIMIT 50`)).toContain('reviews_workspace_created_at_idx')
    expect(explain(`SELECT * FROM lessons WHERE status = 'proposed' ORDER BY updated_at DESC LIMIT 50`)).toContain('lessons_status_updated_at_idx')
  })

  it('exports the schema objects used by downstream packages', () => {
    expect(workspaces).toBeDefined()
    expect(projects).toBeDefined()
    expect(runs).toBeDefined()
    expect(runEvents).toBeDefined()
    expect(files).toBeDefined()
    expect(artifacts).toBeDefined()
    expect(reviews).toBeDefined()
    expect(lessons).toBeDefined()
    expect(settings).toBeDefined()
  })
})
