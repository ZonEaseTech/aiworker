import type { FormEvent, ReactNode } from 'react'
import type { LocalLesson, LocalReview } from '@zonease/aiworker-shared'
import type { LucideIcon } from 'lucide-react'

import { Activity, BookOpen, FileText, FolderOpen, Play, Plus, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { createBrief, loadLocalWorkspaceData, readFile, startRun, type LocalWorkspaceData } from './api'

interface WorkspaceState {
  data: LocalWorkspaceData | null
  loading: boolean
  error: string | null
}

export function WorkspaceApp() {
  const [state, setState] = useState<WorkspaceState>({ data: null, loading: true, error: null })
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
      setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!activeFile) {
      setFileBody('')
      return
    }
    let live = true
    readFile(activeFile)
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
  }, [activeFile])

  const data = state.data
  const activeBrief = useMemo(
    () => data?.briefs.find(brief => brief.id === activeBriefId) ?? data?.briefs[0] ?? null,
    [activeBriefId, data?.briefs],
  )
  const activeRun = useMemo(
    () => data?.runs.find(run => run.id === activeRunId) ?? data?.runs[0] ?? null,
    [activeRunId, data?.runs],
  )
  const filteredFiles = useMemo(
    () => (data?.files ?? []).filter(file => file.path.toLowerCase().includes(query.toLowerCase())),
    [data?.files, query],
  )
  const activeArtifact = data?.artifacts.find(artifact => artifact.runId === activeRun?.id) ?? data?.artifacts[0] ?? null
  const activeReview = data?.reviews.find(review => review.runId === activeRun?.id || review.artifactId === activeArtifact?.id) ?? data?.reviews[0] ?? null
  const visibleLessons = data?.lessons.filter(lesson => !activeReview || lesson.sourceReviewId === activeReview.id || lesson.sourceReviewId === null) ?? []

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!briefTitle.trim() || !briefBody.trim())
      return
    const result = await createBrief({ title: briefTitle, body: briefBody })
    setBriefTitle('')
    setBriefBody('')
    setActiveBriefId(result.brief.id)
    await refresh()
  }

  async function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await startRun({
      briefId: activeBrief?.id,
      prompt: directPrompt.trim() ? directPrompt : undefined,
    })
    setDirectPrompt('')
    setActiveRunId(result.run.id)
    await refresh()
  }

  if (state.loading && !data)
    return <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Loading workspace</main>

  if (state.error)
    return <main className="flex min-h-dvh items-center justify-center bg-background"><p className="app-alert-error">{state.error}</p></main>

  if (!data)
    return null

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-feature leading-none">{data.info.workspace.name}</p>
          <p className="truncate font-mono text-micro text-muted-foreground">{data.info.workspace.rootPath}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} aria-label="Refresh workspace">
          <RefreshCw className="size-4" />
        </Button>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-4">
        <aside className="min-h-0 border-b border-hairline bg-soft-stone/60 lg:border-b-0 lg:border-r">
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
            <form className="flex flex-col gap-2" onSubmit={submitBrief}>
              <div className="flex items-center gap-2 text-sm font-medium"><Plus className="size-4" /> Brief</div>
              <Input value={briefTitle} onChange={event => setBriefTitle(event.target.value)} placeholder="Title" />
              <textarea className="app-field min-h-20 resize-none" value={briefBody} onChange={event => setBriefBody(event.target.value)} placeholder="Body" />
              <Button type="submit" size="sm"><Plus className="size-4" /> Create</Button>
            </form>

            <List title="Briefs" icon={BookOpen}>
              {data.briefs.map(brief => (
                <button key={brief.id} type="button" className={rowClass(activeBrief?.id === brief.id)} onClick={() => setActiveBriefId(brief.id)}>
                  <span className="truncate">{brief.title}</span>
                  <span className="font-mono text-micro text-muted-foreground">{brief.status}</span>
                </button>
              ))}
            </List>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="file-search"><Search className="size-4" /> Files</label>
              <Input id="file-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" />
              <div className="flex flex-col gap-1">
                {filteredFiles.map(file => (
                  <button key={file.id} type="button" className={rowClass(activeFile === file.path)} onClick={() => setActiveFile(file.path)}>
                    <span className="truncate">{file.path}</span>
                    <span className="font-mono text-micro text-muted-foreground">{file.kind}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-h-0 lg:col-span-2">
          <div className="flex h-full min-h-0 flex-col overflow-auto p-4">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-hairline pb-4">
              <div>
                <p className="text-micro uppercase text-muted-foreground">Run Surface</p>
                <h1 className="font-display text-card-heading font-normal">{activeBrief?.title ?? 'Workspace'}</h1>
              </div>
              <StatusPill value={activeRun?.status ?? 'idle'} />
            </div>

            <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={submitRun}>
              <Input value={directPrompt} onChange={event => setDirectPrompt(event.target.value)} placeholder={activeBrief?.body ?? 'Prompt'} />
              <Button type="submit"><Play className="size-4" /> Run</Button>
            </form>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Runs" icon={Activity}>
                {data.runs.map(run => (
                  <button key={run.id} type="button" className={rowClass(activeRun?.id === run.id)} onClick={() => setActiveRunId(run.id)}>
                    <span className="truncate">{run.summary ?? run.prompt}</span>
                    <span className="font-mono text-micro text-muted-foreground">{run.status}</span>
                  </button>
                ))}
              </Panel>
              <Panel title="Artifacts" icon={FolderOpen}>
                {data.artifacts.map(artifact => (
                  <button key={artifact.id} type="button" className={rowClass(activeArtifact?.id === artifact.id)} onClick={() => setActiveFile(artifact.path)}>
                    <span className="truncate">{artifact.title}</span>
                    <span className="font-mono text-micro text-muted-foreground">{artifact.status}</span>
                  </button>
                ))}
              </Panel>
            </div>

            <section className="mt-4 min-h-80 rounded-sm border border-hairline bg-card">
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-3 text-sm font-medium">
                <FileText className="size-4" />
                <span className="truncate">{activeFile ?? activeArtifact?.path ?? 'Preview'}</span>
              </div>
              <pre className="min-h-72 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed text-foreground">
                {fileBody || activeRun?.summary || activeBrief?.body}
              </pre>
            </section>
          </div>
        </section>

        <aside className="min-h-0 border-t border-hairline bg-muted/40 lg:border-l lg:border-t-0">
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
            <Panel title="Review" icon={Search}>
              {activeReview ? <ReviewBlock review={activeReview} /> : <p className="text-sm text-muted-foreground">No review</p>}
            </Panel>
            <Panel title="Lessons" icon={BookOpen}>
              {visibleLessons.map(lesson => <LessonBlock key={lesson.id} lesson={lesson} />)}
            </Panel>
          </div>
        </aside>
      </section>
    </main>
  )
}

function rowClass(active: boolean): string {
  return [
    'flex min-h-10 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left text-sm transition-colors',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline bg-background text-foreground hover:bg-soft-stone',
  ].join(' ')
}

function StatusPill({ value }: { value: string }) {
  return <span className="rounded-pill border border-hairline bg-background px-3 py-1 font-mono text-micro uppercase">{value}</span>
}

function List({ title, icon: Icon, children }: { title: string, icon: LucideIcon, children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4" /> {title}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  )
}

function Panel({ title, icon: Icon, children }: { title: string, icon: LucideIcon, children: ReactNode }) {
  return (
    <section className="rounded-sm border border-hairline bg-card">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3 text-sm font-medium">
        <Icon className="size-4" />
        {title}
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </section>
  )
}

function ReviewBlock({ review }: { review: LocalReview }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <StatusPill value={review.verdict} />
      {review.findingsJson.map((finding, index) => (
        <p key={index} className="rounded-sm bg-soft-stone p-3">{String(finding.message ?? JSON.stringify(finding))}</p>
      ))}
    </div>
  )
}

function LessonBlock({ lesson }: { lesson: LocalLesson }) {
  return (
    <article className="rounded-sm border border-hairline bg-background p-3 text-sm">
      <p>{lesson.statement}</p>
      <p className="mt-2 font-mono text-micro uppercase text-muted-foreground">{lesson.status}</p>
    </article>
  )
}
