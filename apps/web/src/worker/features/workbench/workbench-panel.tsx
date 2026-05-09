import type { WorkerPack, WorkerPackTemplate } from '@zonease/aiworker-shared'
import type { WorkerArtifact, WorkerCaseFile, WorkerRun } from '@/worker/api'
import { BUILTIN_WORKER_PACKS } from '@zonease/aiworker-shared'
import { Activity, FileSearch, Loader2, MessageSquare, RefreshCcw, Send, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import {
  useReviews,
  useRuns,
  useSubmitTask,
  useWorkerArtifacts,
  useWorkerHealth,
  useWorkerInfo,
} from '@/worker/lib/hooks'

const DEFAULT_PACK = requireFirstPack()
const DEFAULT_TEMPLATE = requireFirstTemplate(DEFAULT_PACK)

export function WorkbenchPanel() {
  const healthQ = useWorkerHealth()
  const infoQ = useWorkerInfo()
  const runsQ = useRuns()
  const reviewsQ = useReviews(8)
  const submit = useSubmitTask()

  const [selectedPackId, setSelectedPackId] = useState(DEFAULT_PACK.id)
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_TEMPLATE.id)
  const [prompt, setPrompt] = useState(DEFAULT_TEMPLATE.prompt)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedPack = findPack(selectedPackId)
  const selectedTemplate = findTemplate(selectedPack, selectedTemplateId)
  const runs = runsQ.data?.runs ?? []
  const activeRun = selectedRunId
    ? (runs.find(run => run.id === selectedRunId) ?? null)
    : (runs[0] ?? null)
  const activeRunId = activeRun?.id ?? selectedRunId ?? undefined
  const artifactsQ = useWorkerArtifacts(useMemo(() => ({
    ...(activeRunId ? { runId: activeRunId } : {}),
    limit: 8,
  }), [activeRunId]))
  const reviews = reviewsQ.data?.reviews ?? []
  const activeCase = activeRun
    ? (reviews.find(file => file.taskId === activeRun.id) ?? null)
    : (reviews[0] ?? null)

  function selectPack(pack: WorkerPack) {
    const firstTemplate = requireFirstTemplate(pack)
    setSelectedPackId(pack.id)
    setSelectedTemplateId(firstTemplate.id)
    setPrompt(firstTemplate.prompt)
  }

  function selectTemplate(template: WorkerPackTemplate) {
    setSelectedTemplateId(template.id)
    setPrompt(template.prompt)
  }

  async function submitWorkOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = prompt.trim()
    if (!text || submit.isPending)
      return
    setSubmitError(null)
    try {
      const run = await submit.mutateAsync(text)
      setSelectedRunId(run.id)
    }
    catch (err) {
      setSubmitError(errorMessage(err))
    }
  }

  return (
    <section data-testid="worker-workbench-panel" className="app-page">
      <header className="app-page-header min-w-0">
        <p className="text-micro uppercase text-muted-foreground">Local Worker</p>
        <h1 className="app-page-title">Worker Workbench</h1>
        <p className="app-page-copy">
          {selectedPack.label}
          {' / '}
          {selectedPack.domain}
        </p>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="app-panel flex min-w-0 flex-col gap-5 xl:col-span-2">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <PickerGroup title="Worker pack" icon={MessageSquare}>
              {BUILTIN_WORKER_PACKS.map(pack => (
                <button
                  key={pack.id}
                  type="button"
                  aria-pressed={pack.id === selectedPack.id}
                  className={cn(
                    'flex min-w-0 flex-col gap-1 rounded-sm border px-3 py-3 text-left transition-colors',
                    pack.id === selectedPack.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-hairline bg-background hover:bg-soft-stone',
                  )}
                  onClick={() => selectPack(pack)}
                >
                  <span className="truncate text-sm font-medium">{pack.label}</span>
                  <span className={cn(
                    'line-clamp-2 text-xs',
                    pack.id === selectedPack.id ? 'text-primary-foreground/75' : 'text-muted-foreground',
                  )}
                  >
                    {pack.description}
                  </span>
                </button>
              ))}
            </PickerGroup>

            <PickerGroup title="Work-order template" icon={FileSearch}>
              {selectedPack.workOrderTemplates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={template.id === selectedTemplate.id}
                  className={cn(
                    'flex min-w-0 flex-col gap-1 rounded-sm border px-3 py-3 text-left transition-colors',
                    template.id === selectedTemplate.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-hairline bg-background hover:bg-soft-stone',
                  )}
                  onClick={() => selectTemplate(template)}
                >
                  <span className="truncate text-sm font-medium">{template.title}</span>
                  <span className={cn(
                    'line-clamp-2 text-xs',
                    template.id === selectedTemplate.id ? 'text-primary-foreground/75' : 'text-muted-foreground',
                  )}
                  >
                    {template.description}
                  </span>
                </button>
              ))}
            </PickerGroup>
          </div>

          <form className="flex min-w-0 flex-col gap-3" onSubmit={submitWorkOrder}>
            <label htmlFor="worker-workbench-prompt" className="text-micro uppercase text-muted-foreground">
              Work order
            </label>
            <textarea
              id="worker-workbench-prompt"
              className="app-field min-h-40 resize-y"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
            />
            {submitError && (
              <p role="alert" className="app-alert-error">
                {submitError}
              </p>
            )}
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="truncate text-xs text-muted-foreground">
                {selectedTemplate.title}
                {' · '}
                {selectedPack.artifactKinds.join(', ')}
              </p>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={submit.isPending || prompt.trim().length === 0}
              >
                {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                运行 work order
              </Button>
            </div>
          </form>
        </section>

        <RuntimePanel
          selectedPack={selectedPack}
          health={healthQ.data}
          info={infoQ.data}
          loading={healthQ.isLoading || infoQ.isLoading}
          error={healthQ.error ?? infoQ.error}
        />

        <RunTimeline
          runs={runs}
          isLoading={runsQ.isLoading}
          error={runsQ.error}
          activeRunId={activeRunId}
          onSelect={setSelectedRunId}
        />

        <ArtifactPanel
          artifacts={artifactsQ.data?.artifacts ?? []}
          isLoading={artifactsQ.isLoading}
          error={artifactsQ.error}
          activeRunId={activeRunId}
        />

        <ReviewPanel
          caseFile={activeCase}
          isLoading={reviewsQ.isLoading}
          error={reviewsQ.error}
        />
      </div>
    </section>
  )
}

function PickerGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof MessageSquare
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-micro uppercase text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{title}</span>
      </h2>
      <div className="grid min-w-0 gap-2">
        {children}
      </div>
    </section>
  )
}

function RuntimePanel({
  selectedPack,
  health,
  info,
  loading,
  error,
}: {
  selectedPack: WorkerPack
  health?: { status: string, workerId: string, configVersion: number }
  info?: {
    configVersion?: number
    executor?: { type: string, status: string, model?: string }
    brainSummary?: { scopeManifest?: { primarySoul?: string, status: string } }
  }
  loading: boolean
  error: unknown
}) {
  return (
    <section className="app-panel-dark flex min-w-0 flex-col gap-4">
      <header className="flex items-center gap-2">
        <Activity className="size-4" />
        <h2 className="text-feature font-normal">Runtime</h2>
      </header>
      {loading
        ? <Skeleton className="h-28 bg-on-dark/15" />
        : error
          ? <p role="alert" className="text-sm text-coral-soft">{errorMessage(error)}</p>
          : (
              <dl className="grid gap-3 text-sm">
                <Metric label="worker" value={health?.workerId ?? '—'} />
                <Metric label="status" value={health?.status ?? 'unknown'} />
                <Metric label="config" value={`v${info?.configVersion ?? health?.configVersion ?? '—'}`} />
                <Metric label="executor" value={info?.executor ? `${info.executor.type} / ${info.executor.status}` : 'unknown'} />
                <Metric label="pack" value={selectedPack.id} />
                <Metric label="scope soul" value={info?.brainSummary?.scopeManifest?.primarySoul ?? '—'} />
              </dl>
            )}
    </section>
  )
}

function RunTimeline({
  runs,
  isLoading,
  error,
  activeRunId,
  onSelect,
}: {
  runs: WorkerRun[]
  isLoading: boolean
  error: unknown
  activeRunId?: string
  onSelect: (runId: string) => void
}) {
  return (
    <section className="app-panel flex min-w-0 flex-col gap-4 xl:col-span-2">
      <PanelHeader icon={RefreshCcw} title="Run timeline" badge={String(runs.length)} />
      {isLoading
        ? <Skeleton className="h-40" />
        : error
          ? <p role="alert" className="app-alert-error">{errorMessage(error)}</p>
          : runs.length === 0
            ? <div className="app-empty p-6">暂无 run。</div>
            : (
                <ul className="grid min-w-0 gap-2">
                  {runs.map(run => (
                    <li key={run.id}>
                      <button
                        type="button"
                        className={cn(
                          'grid w-full min-w-0 gap-2 rounded-sm border px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto]',
                          run.id === activeRunId
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-hairline bg-background hover:bg-soft-stone',
                        )}
                        onClick={() => onSelect(run.id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs">{run.id}</span>
                          <span className={cn(
                            'mt-1 line-clamp-2 text-sm',
                            run.id === activeRunId ? 'text-primary-foreground/75' : 'text-muted-foreground',
                          )}
                          >
                            {run.prompt}
                          </span>
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                          <StatusBadge status={run.status} />
                          <span className={cn(
                            'font-mono text-micro',
                            run.id === activeRunId ? 'text-primary-foreground/70' : 'text-muted-foreground',
                          )}
                          >
                            {formatDate(run.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
    </section>
  )
}

function ArtifactPanel({
  artifacts,
  isLoading,
  error,
  activeRunId,
}: {
  artifacts: WorkerArtifact[]
  isLoading: boolean
  error: unknown
  activeRunId?: string
}) {
  return (
    <section className="app-panel flex min-w-0 flex-col gap-4">
      <PanelHeader icon={FileSearch} title="Artifacts" badge={String(artifacts.length)} />
      {activeRunId && <p className="truncate font-mono text-xs text-muted-foreground">{activeRunId}</p>}
      {isLoading
        ? <Skeleton className="h-32" />
        : error
          ? <p role="alert" className="app-alert-error">{errorMessage(error)}</p>
          : artifacts.length === 0
            ? <div className="app-empty p-6">暂无 artifact。</div>
            : (
                <ul className="flex min-w-0 flex-col gap-2">
                  {artifacts.map(artifact => (
                    <li key={artifact.id} className="rounded-sm border border-hairline bg-background p-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{artifact.title}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{artifact.relativePath}</p>
                        </div>
                        <StatusBadge status={artifact.status} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {artifact.kind}
                        {' · '}
                        {artifact.mimeType ?? 'unknown'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
    </section>
  )
}

function ReviewPanel({
  caseFile,
  isLoading,
  error,
}: {
  caseFile: WorkerCaseFile | null
  isLoading: boolean
  error: unknown
}) {
  return (
    <section className="app-panel flex min-w-0 flex-col gap-4 xl:col-span-3">
      <PanelHeader icon={ShieldCheck} title="Run review" badge={caseFile?.reviewDecision.status ?? 'none'} />
      {isLoading
        ? <Skeleton className="h-32" />
        : error
          ? <p role="alert" className="app-alert-error">{errorMessage(error)}</p>
          : !caseFile
              ? <div className="app-empty p-6">暂无 case review。</div>
              : (
                  <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                    <div className="min-w-0 lg:col-span-2">
                      <p className="text-micro uppercase text-muted-foreground">Decision</p>
                      <h2 className="mt-1 break-words text-feature font-normal">{caseFile.reviewDecision.summary}</h2>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{caseFile.reviewDecision.action}</p>
                    </div>
                    <dl className="grid gap-3 text-sm">
                      <Detail label="task" value={caseFile.taskId} code />
                      <Detail label="risk" value={caseFile.risk.risk} />
                      <Detail label="lessons" value={String(caseFile.lessons.candidateCount)} />
                      <Detail label="messages" value={String(caseFile.evidence.messageCount)} />
                    </dl>
                  </div>
                )}
    </section>
  )
}

function PanelHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: typeof Activity
  title: string
  badge: string
}) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-feature font-normal">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{title}</span>
      </h2>
      <Badge variant="outline" className="shrink-0">{badge}</Badge>
    </header>
  )
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div className="min-w-0 border-l border-on-dark/20 pl-3">
      <dt className="text-micro uppercase text-on-dark/65">{label}</dt>
      <dd className="truncate font-mono text-xs text-on-dark">{value}</dd>
    </div>
  )
}

function Detail({
  label,
  value,
  code,
}: {
  label: string
  value: string
  code?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro uppercase text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm', code && 'font-mono text-xs')}>{value}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'succeeded' || status === 'available' || status === 'ready_to_ship'
    ? 'success'
    : status === 'failed' || status === 'missing' || status === 'blocked'
      ? 'destructive'
      : status === 'running' || status === 'queued' || status === 'needs_review'
        ? 'warning'
        : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

function findPack(id: string): WorkerPack {
  return BUILTIN_WORKER_PACKS.find(pack => pack.id === id) ?? DEFAULT_PACK
}

function findTemplate(pack: WorkerPack, id: string): WorkerPackTemplate {
  return pack.workOrderTemplates.find(template => template.id === id) ?? requireFirstTemplate(pack)
}

function requireFirstPack(): WorkerPack {
  const pack = BUILTIN_WORKER_PACKS[0]
  if (!pack)
    throw new Error('worker workbench requires at least one built-in worker pack')
  return pack
}

function requireFirstTemplate(pack: WorkerPack): WorkerPackTemplate {
  const template = pack.workOrderTemplates[0]
  if (!template)
    throw new Error(`worker pack "${pack.id}" has no work-order template`)
  return template
}

function formatDate(value?: string | null): string {
  if (!value)
    return '—'
  return new Date(value).toLocaleString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载失败'
}
