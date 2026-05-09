import type {
  LocalArtifact,
  LocalFile,
  LocalLesson,
  LocalReview,
  LocalRun,
  LocalRunEvent,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { LocalWorkspaceData } from './api'

import {
  Activity,
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  FolderOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createBrief, loadLocalWorkspaceData, readFile, startRun } from './api'

interface StudioState {
  data: LocalWorkspaceData | null
  loading: boolean
  error: string | null
}

export function WorkerStudio() {
  const [state, setState] = useState<StudioState>({ data: null, loading: true, error: null })
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileBody, setFileBody] = useState('')
  const [briefTitle, setBriefTitle] = useState('')
  const [briefBody, setBriefBody] = useState('')
  const [directPrompt, setDirectPrompt] = useState('')
  const [query, setQuery] = useState('')

  async function refresh() {
    setState(current => ({ ...current, loading: true, error: null }))
    try {
      const data = await loadLocalWorkspaceData()
      setState({ data, loading: false, error: null })
      setActiveBriefId(current => current ?? data.briefs[0]?.id ?? null)
      setActiveRunId(current => current ?? data.runs[0]?.id ?? null)
    }
    catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const data = state.data

  const activeBrief = useMemo(
    () => data?.briefs.find(brief => brief.id === activeBriefId) ?? data?.briefs[0] ?? null,
    [activeBriefId, data?.briefs],
  )

  const activeRun = useMemo(
    () => data?.runs.find(run => run.id === activeRunId) ?? data?.runs[0] ?? null,
    [activeRunId, data?.runs],
  )

  const activeArtifact = useMemo(
    () => data?.artifacts.find(artifact => artifact.runId === activeRun?.id)
      ?? data?.artifacts[0]
      ?? null,
    [activeRun?.id, data?.artifacts],
  )

  const activeReview = useMemo(
    () => data?.reviews.find(review => review.runId === activeRun?.id || review.artifactId === activeArtifact?.id)
      ?? data?.reviews[0]
      ?? null,
    [activeArtifact?.id, activeRun?.id, data?.reviews],
  )

  const visibleLessons = useMemo(
    () => data?.lessons.filter(lesson => !activeReview || lesson.sourceReviewId === activeReview.id || lesson.sourceReviewId === null) ?? [],
    [activeReview, data?.lessons],
  )

  const activeEvents = useMemo(
    () => data?.events.filter(event => event.runId === activeRun?.id) ?? [],
    [activeRun?.id, data?.events],
  )

  const filteredFiles = useMemo(
    () => (data?.files ?? []).filter(file => file.path.toLowerCase().includes(query.trim().toLowerCase())),
    [data?.files, query],
  )
  const selectedFile = activeFile ?? activeArtifact?.path ?? null

  useEffect(() => {
    if (!selectedFile)
      return

    let live = true
    readFile(selectedFile)
      .then((text) => {
        if (live)
          setFileBody(text)
      })
      .catch((error) => {
        if (live)
          setFileBody(error instanceof Error ? error.message : String(error))
      })
    return () => {
      live = false
    }
  }, [selectedFile])

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = briefTitle.trim()
    const body = briefBody.trim()
    if (!title || !body)
      return

    const result = await createBrief({ title, body })
    setBriefTitle('')
    setBriefBody('')
    setActiveBriefId(result.brief.id)
    await refresh()
  }

  async function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await startRun({
      briefId: activeBrief?.id,
      prompt: directPrompt.trim() ? directPrompt.trim() : undefined,
    })
    setDirectPrompt('')
    setActiveRunId(result.run.id)
    await refresh()
  }

  if (state.loading && !data) {
    return (
      <main className="worker-studio worker-studio--centered">
        <div className="studio-loader">
          <Sparkles aria-hidden="true" />
          <span>Loading local studio</span>
        </div>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="worker-studio worker-studio--centered">
        <div className="studio-error" role="alert">{state.error}</div>
      </main>
    )
  }

  if (!data)
    return null

  const previewTitle = selectedFile ?? activeArtifact?.path ?? 'workspace'
  const previewBody = fileBody || activeRun?.summary || activeBrief?.body || ''

  return (
    <main className="worker-studio">
      <section className="studio-topline" aria-label="Workspace">
        <div className="studio-mark">
          <span className="studio-mark__dot" aria-hidden="true" />
          <span>AIWorker</span>
        </div>
        <div className="studio-workspace">
          <strong>{data.info.workspace.name}</strong>
          <span>{data.info.workspace.rootPath}</span>
        </div>
        <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh workspace">
          <RefreshCw aria-hidden="true" />
        </button>
      </section>

      <section className="studio-grid">
        <aside className="brief-shelf" aria-label="Brief shelf">
          <form className="brief-composer" onSubmit={submitBrief}>
            <div className="surface-title">
              <Plus aria-hidden="true" />
              <span>New brief</span>
            </div>
            <label className="field">
              <span>Title</span>
              <input value={briefTitle} onChange={event => setBriefTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea value={briefBody} onChange={event => setBriefBody(event.target.value)} rows={4} />
            </label>
            <button className="command-button" type="submit">
              <Plus aria-hidden="true" />
              <span>Create</span>
            </button>
          </form>

          <section className="shelf-stack" aria-label="Briefs">
            <div className="surface-title">
              <BookOpen aria-hidden="true" />
              <span>Briefs</span>
            </div>
            <div className="brief-list">
              {data.briefs.map(brief => (
                <button
                  key={brief.id}
                  className={activeBrief?.id === brief.id ? 'brief-item is-active' : 'brief-item'}
                  type="button"
                  onClick={() => setActiveBriefId(brief.id)}
                >
                  <span>{brief.title}</span>
                  <small>{brief.status}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="shelf-stack shelf-stack--files" aria-label="Files">
            <label className="surface-title search-title" htmlFor="studio-file-search">
              <Search aria-hidden="true" />
              <span>Files</span>
            </label>
            <input
              id="studio-file-search"
              className="file-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <div className="file-list">
              {filteredFiles.map(file => (
                <FileButton
                  key={file.id}
                  file={file}
                  active={selectedFile === file.path}
                  onSelect={() => setActiveFile(file.path)}
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="run-stage" aria-label="Run stage">
          <div className="stage-header">
            <div>
              <span className="eyebrow">Run lane</span>
              <h1>{activeBrief?.title ?? 'Local worker'}</h1>
            </div>
            <StatusBadge value={activeRun?.status ?? 'idle'} />
          </div>

          <form className="run-composer" onSubmit={submitRun}>
            <label htmlFor="studio-run-prompt">Prompt</label>
            <textarea
              id="studio-run-prompt"
              value={directPrompt}
              onChange={event => setDirectPrompt(event.target.value)}
              placeholder={activeBrief?.body ?? ''}
              rows={3}
            />
            <button className="run-button" type="submit">
              <Play aria-hidden="true" />
              <span>Run</span>
            </button>
          </form>

          <div className="run-lane" aria-label="Runs">
            {data.runs.map(run => (
              <RunChip
                key={run.id}
                run={run}
                active={activeRun?.id === run.id}
                onSelect={() => setActiveRunId(run.id)}
              />
            ))}
          </div>

          <section className="artifact-canvas" aria-label="Artifact canvas">
            <div className="artifact-toolbar">
              <div>
                <span className="eyebrow">Artifact canvas</span>
                <strong>{shortPath(previewTitle)}</strong>
              </div>
              <FileText aria-hidden="true" />
            </div>
            <pre>{previewBody}</pre>
          </section>

          <section className="artifact-strip" aria-label="Artifacts">
            {data.artifacts.map(artifact => (
              <ArtifactButton
                key={artifact.id}
                artifact={artifact}
                active={activeArtifact?.id === artifact.id || selectedFile === artifact.path}
                onSelect={() => {
                  setActiveFile(artifact.path)
                  if (artifact.runId)
                    setActiveRunId(artifact.runId)
                }}
              />
            ))}
          </section>
        </section>

        <aside className="review-rail" aria-label="Review rail">
          <section className="review-surface">
            <div className="surface-title">
              <CheckCircle2 aria-hidden="true" />
              <span>Review</span>
            </div>
            {activeReview ? <ReviewBlock review={activeReview} /> : <EmptyLine label="No review yet" />}
          </section>

          <section className="review-surface">
            <div className="surface-title">
              <Activity aria-hidden="true" />
              <span>Run events</span>
            </div>
            <div className="event-list">
              {activeEvents.length > 0
                ? activeEvents.map(event => <EventLine key={event.id} event={event} />)
                : <EmptyLine label="No events yet" />}
            </div>
          </section>

          <section className="lesson-ledger">
            <div className="surface-title">
              <BookOpen aria-hidden="true" />
              <span>Lessons</span>
            </div>
            <div className="lesson-list">
              {visibleLessons.length > 0
                ? visibleLessons.map(lesson => <LessonLine key={lesson.id} lesson={lesson} />)
                : <EmptyLine label="No lessons yet" />}
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

function FileButton({ file, active, onSelect }: { file: LocalFile, active: boolean, onSelect: () => void }) {
  return (
    <button className={active ? 'file-button is-active' : 'file-button'} type="button" onClick={onSelect}>
      <FolderOpen aria-hidden="true" />
      <span>{shortPath(file.path)}</span>
      <small>{file.kind}</small>
    </button>
  )
}

function RunChip({ run, active, onSelect }: { run: LocalRun, active: boolean, onSelect: () => void }) {
  return (
    <button className={active ? 'run-chip is-active' : 'run-chip'} type="button" onClick={onSelect}>
      <span>{run.summary ?? run.prompt}</span>
      <StatusDot value={run.status} />
    </button>
  )
}

function ArtifactButton({ artifact, active, onSelect }: { artifact: LocalArtifact, active: boolean, onSelect: () => void }) {
  return (
    <button className={active ? 'artifact-button is-active' : 'artifact-button'} type="button" onClick={onSelect}>
      <FileText aria-hidden="true" />
      <span>{artifact.title}</span>
      <small>{artifact.status}</small>
    </button>
  )
}

function ReviewBlock({ review }: { review: LocalReview }) {
  return (
    <div className="review-block">
      <StatusBadge value={review.verdict} />
      {review.findingsJson.map(finding => (
        <p key={jsonSummary(finding)}>{jsonSummary(finding)}</p>
      ))}
      {review.risksJson.map(risk => (
        <p key={jsonSummary(risk)} className="risk-line">{jsonSummary(risk)}</p>
      ))}
    </div>
  )
}

function EventLine({ event }: { event: LocalRunEvent }) {
  return (
    <div className="event-line">
      <StatusDot value={event.type} />
      <div>
        <strong>{event.type}</strong>
        <span>{jsonSummary(event.payloadJson)}</span>
      </div>
    </div>
  )
}

function LessonLine({ lesson }: { lesson: LocalLesson }) {
  return (
    <article className="lesson-line">
      <p>{lesson.statement}</p>
      <span>{lesson.status}</span>
    </article>
  )
}

function EmptyLine({ label }: { label: string }) {
  return <p className="empty-line">{label}</p>
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge ${statusClass(value)}`}>{value}</span>
}

function StatusDot({ value }: { value: string }) {
  return <Circle className={`status-dot ${statusClass(value)}`} aria-hidden="true" />
}

function statusClass(value: string): string {
  if (['succeeded', 'completed', 'pass', 'available', 'accepted'].includes(value))
    return 'is-positive'
  if (['running', 'queued', 'needs_review', 'proposed', 'assistant_delta', 'tool', 'file_change', 'artifact', 'review', 'lesson'].includes(value))
    return 'is-live'
  if (['failed', 'fail', 'error', 'missing', 'rejected'].includes(value))
    return 'is-negative'
  return 'is-neutral'
}

function shortPath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  if (parts.length <= 2)
    return value
  return `${parts.at(-2)}/${parts.at(-1)}`
}

function jsonSummary(value: Record<string, unknown>): string {
  for (const key of ['message', 'summary', 'text', 'path', 'title']) {
    const item = value[key]
    if (typeof item === 'string' && item.trim())
      return item
  }
  const serialized = JSON.stringify(value)
  return serialized === '{}' ? 'Recorded' : serialized
}
