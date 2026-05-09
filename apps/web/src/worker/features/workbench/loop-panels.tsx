import type { WorkerArtifact, WorkerReview, WorkerReviewLessonCandidate, WorkerRun } from '@/worker/api'
import {
  Archive,
  FileSearch,
  GitBranch,
  Lightbulb,
  ListChecks,
  RefreshCcw,
  ScrollText,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import {
  usePromoteReviewLessons,
  useRerunReview,
  useReview,
  useReviews,
  useRuns,
  useWorkerArtifacts,
} from '@/worker/lib/hooks'

export function RunsPanel() {
  const runsQ = useRuns()
  const runs = runsQ.data?.runs ?? []

  return (
    <section data-testid="worker-runs-panel" className="app-page">
      <PageHeader eyebrow="Work orders" title="Runs" copy="所有本地 daemon work order 的当前状态、时间线和输出入口。" />
      <section className="app-panel flex min-w-0 flex-col gap-4">
        <PanelHeader icon={ListChecks} title="Run queue" badge={String(runs.length)} />
        {runsQ.isLoading
          ? <Skeleton className="h-48" />
          : runsQ.error
            ? <p role="alert" className="app-alert-error">{errorMessage(runsQ.error)}</p>
            : runs.length === 0
              ? <div className="app-empty p-8">暂无 run。</div>
              : (
                  <ul className="grid min-w-0 gap-2">
                    {runs.map(run => <RunRow key={run.id} run={run} />)}
                  </ul>
                )}
      </section>
    </section>
  )
}

export function ArtifactsPanel() {
  const [status, setStatus] = useState<'all' | WorkerArtifact['status']>('all')
  const artifactsQ = useWorkerArtifacts(useMemo(() => ({
    limit: 100,
    ...(status === 'all' ? {} : { status }),
  }), [status]))
  const artifacts = artifactsQ.data?.artifacts ?? []

  return (
    <section data-testid="worker-artifacts-panel" className="app-page">
      <PageHeader eyebrow="Outputs" title="Artifacts" copy="按 run 归档的文件、摘要和 executor 产物 metadata。" />
      <section className="app-panel flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelHeader icon={Archive} title="Artifact index" badge={String(artifacts.length)} />
          <div className="flex flex-wrap gap-2">
            {(['all', 'available', 'missing', 'archived'] as const).map(item => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={status === item ? 'default' : 'outline'}
                onClick={() => setStatus(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        {artifactsQ.isLoading
          ? <Skeleton className="h-48" />
          : artifactsQ.error
            ? <p role="alert" className="app-alert-error">{errorMessage(artifactsQ.error)}</p>
            : artifacts.length === 0
              ? <div className="app-empty p-8">暂无 artifact。</div>
              : (
                  <ul className="grid min-w-0 gap-2 lg:grid-cols-2">
                    {artifacts.map(artifact => <ArtifactCard key={artifact.id} artifact={artifact} />)}
                  </ul>
                )}
      </section>
    </section>
  )
}

export function ReviewsPanel() {
  const reviewsQ = useReviews(80)
  const reviews = reviewsQ.data?.reviews ?? []
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined)
  const activeRunId = selectedRunId !== undefined && reviews.some(item => item.taskId === selectedRunId)
    ? selectedRunId
    : reviews[0]?.taskId

  return (
    <section data-testid="worker-reviews-panel" className="app-page">
      <PageHeader eyebrow="Quality loop" title="Reviews" copy="Run review、evidence、risk、rerun 和 lesson promotion 的操作面。" />
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <ReviewList
          reviews={reviews}
          isLoading={reviewsQ.isLoading}
          error={reviewsQ.error}
          activeRunId={activeRunId}
          onSelect={setSelectedRunId}
        />
        <ReviewDetail runId={activeRunId} />
      </div>
    </section>
  )
}

export function LessonsPanel() {
  const reviewsQ = useReviews(100)
  const promoteLessons = usePromoteReviewLessons()
  const lessonRows = useMemo(() => {
    const reviews = reviewsQ.data?.reviews ?? []
    return reviews.flatMap(review => review.lessons.candidates.map(candidate => ({ candidate, review })))
  }, [reviewsQ.data?.reviews])

  return (
    <section data-testid="worker-lessons-panel" className="app-page">
      <PageHeader eyebrow="Durable context" title="Lessons" copy="从 review evidence 中筛出的 lesson candidates，只在证据足够时晋升。" />
      <section className="app-panel flex min-w-0 flex-col gap-4">
        <PanelHeader icon={Lightbulb} title="Lesson candidates" badge={String(lessonRows.length)} />
        {reviewsQ.isLoading
          ? <Skeleton className="h-48" />
          : reviewsQ.error
            ? <p role="alert" className="app-alert-error">{errorMessage(reviewsQ.error)}</p>
            : lessonRows.length === 0
              ? <div className="app-empty p-8">暂无 lesson candidate。</div>
              : (
                  <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
                    {lessonRows.map(({ candidate, review }) => (
                      <LessonCard
                        key={`${review.taskId}:${candidate.index}`}
                        candidate={candidate}
                        review={review}
                        disabled={promoteLessons.isPending}
                        onPromote={() => promoteLessons.mutate(review.taskId)}
                      />
                    ))}
                  </ul>
                )}
        {promoteLessons.error && (
          <p role="alert" className="app-alert-error">{promoteLessons.error.message}</p>
        )}
        {promoteLessons.data && (
          <p role="status" className="app-alert-success">
            已创建
            {' '}
            {promoteLessons.data.promotion.proposals.length}
            {' '}
            条 pending lesson proposal。
          </p>
        )}
      </section>
    </section>
  )
}

function ReviewList({
  reviews,
  isLoading,
  error,
  activeRunId,
  onSelect,
}: {
  reviews: WorkerReview[]
  isLoading: boolean
  error: unknown
  activeRunId?: string
  onSelect: (runId: string) => void
}) {
  return (
    <aside className="app-panel flex min-w-0 flex-col gap-3 lg:col-span-1">
      <PanelHeader icon={FileSearch} title="Review list" badge={String(reviews.length)} />
      {isLoading && <Skeleton className="h-32 w-full" />}
      {error ? <p role="alert" className="app-alert-error">{errorMessage(error)}</p> : null}
      {!isLoading && reviews.length === 0 && !error && <div className="app-empty p-6">暂无 review。</div>}
      <ul className="flex max-h-96 min-w-0 flex-col gap-2 overflow-y-auto">
        {reviews.map(review => (
          <li key={review.taskId}>
            <button
              type="button"
              className={cn(
                'flex w-full min-w-0 flex-col gap-2 rounded-sm border px-3 py-3 text-left text-sm transition-colors',
                activeRunId === review.taskId
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-hairline bg-background hover:bg-soft-stone',
              )}
              onClick={() => onSelect(review.taskId)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <StatusBadge status={review.reviewDecision.status} />
                <span className="truncate font-mono text-xs">{review.taskId}</span>
              </span>
              <span className={cn(
                'line-clamp-2 text-xs',
                activeRunId === review.taskId ? 'text-primary-foreground/75' : 'text-muted-foreground',
              )}
              >
                {review.workOrder.prompt}
              </span>
              <span className={cn(
                'font-mono text-micro',
                activeRunId === review.taskId ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
              >
                {formatDate(review.workOrder.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function ReviewDetail({ runId }: { runId?: string }) {
  const reviewQ = useReview(runId)
  const rerun = useRerunReview()
  const promoteLessons = usePromoteReviewLessons()
  const review = reviewQ.data?.review
  const pendingAction = rerun.isPending || promoteLessons.isPending

  if (runId === undefined) {
    return (
      <section className="app-panel lg:col-span-2">
        <div className="app-empty">选择一个 review 查看详情。</div>
      </section>
    )
  }

  if (reviewQ.isLoading || review === undefined) {
    return (
      <section className="app-panel lg:col-span-2">
        <Skeleton className="h-96 w-full" />
      </section>
    )
  }

  if (reviewQ.error) {
    return (
      <section className="app-panel lg:col-span-2">
        <p role="alert" className="app-alert-error">{errorMessage(reviewQ.error)}</p>
      </section>
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 lg:col-span-2">
      <div className="app-panel flex min-w-0 flex-col gap-4">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-micro uppercase text-muted-foreground">Review decision</p>
            <h2 className="break-words text-feature font-normal">{review.reviewDecision.summary}</h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{review.taskId}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StatusBadge status={review.reviewDecision.status} />
            <Badge variant={review.risk.risk === 'high' ? 'destructive' : 'outline'}>
              risk:
              {review.risk.risk}
            </Badge>
            <Badge variant={review.risk.enforceable ? 'default' : 'secondary'}>
              {review.risk.enforceable ? 'enforced' : 'observe-only'}
            </Badge>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="messages" value={String(review.evidence.messageCount)} />
          <Metric label="tool events" value={String(review.evidence.toolEventCount)} />
          <Metric label="journal events" value={String(review.evidence.journalEventCount)} />
          <Metric label="reruns" value={String(review.lineage.rerunCount)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction}
            onClick={() => rerun.mutate({ taskId: review.taskId })}
          >
            <RefreshCcw className="size-4" />
            Rerun
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction || review.lessons.candidateCount === 0}
            onClick={() => promoteLessons.mutate(review.taskId)}
          >
            <Lightbulb className="size-4" />
            Promote lessons
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReviewBlock title="Work order" icon={ScrollText}>
          <dl className="space-y-3 text-sm">
            <Detail label="status" value={review.workOrder.status} />
            <Detail label="created" value={formatDate(review.workOrder.createdAt)} />
            {review.workOrder.finishedAt && <Detail label="finished" value={formatDate(review.workOrder.finishedAt)} />}
            {review.workOrder.conversationId && <Detail label="conversation" value={review.workOrder.conversationId} code />}
          </dl>
          <p className="mt-4 whitespace-pre-wrap break-words rounded-sm border border-hairline bg-background p-3 text-sm">
            {review.workOrder.prompt}
          </p>
        </ReviewBlock>

        <ReviewBlock title="Evidence" icon={GitBranch}>
          <ReasonList reasons={review.reviewDecision.reasons.map(reason => reason.reason)} />
          <RefList refs={review.reviewDecision.evidenceRefs.length > 0 ? review.reviewDecision.evidenceRefs : [review.rawJournalRef]} />
        </ReviewBlock>

        <ReviewBlock title="Risk" icon={FileSearch}>
          <dl className="space-y-3 text-sm">
            <Detail label="authority" value={review.risk.authorityMode} code />
            <Detail label="executor" value={review.risk.executorNote} />
            <Detail label="observe-only reasons" value={String(review.risk.observeOnlyReasonCount)} />
          </dl>
          {review.risk.warning && <p className="mt-3 app-alert-warning">{review.risk.warning}</p>}
        </ReviewBlock>

        <ReviewBlock title="Lessons queue" icon={Lightbulb}>
          {review.lessons.candidates.length === 0
            ? <p className="text-sm text-muted-foreground">暂无 lesson candidate。</p>
            : (
                <ul className="flex flex-col gap-3">
                  {review.lessons.candidates.map(candidate => <LessonItem key={candidate.index} candidate={candidate} />)}
                </ul>
              )}
        </ReviewBlock>
      </div>
    </section>
  )
}

function RunRow({ run }: { run: WorkerRun }) {
  return (
    <li className="grid min-w-0 gap-2 rounded-sm border border-hairline bg-background px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs">{run.id}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{run.prompt}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <StatusBadge status={run.status} />
        <span className="font-mono text-micro text-muted-foreground">{formatDate(run.createdAt)}</span>
      </div>
    </li>
  )
}

function ArtifactCard({ artifact }: { artifact: WorkerArtifact }) {
  return (
    <li className="rounded-sm border border-hairline bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{artifact.title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{artifact.relativePath}</p>
        </div>
        <StatusBadge status={artifact.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Detail label="kind" value={artifact.kind} />
        <Detail label="source" value={artifact.source} />
        <Detail label="run" value={artifact.runId ?? '—'} code />
        <Detail label="size" value={artifact.sizeBytes === null ? '—' : String(artifact.sizeBytes)} />
      </dl>
    </li>
  )
}

function LessonCard({
  candidate,
  review,
  disabled,
  onPromote,
}: {
  candidate: WorkerReviewLessonCandidate
  review: WorkerReview
  disabled: boolean
  onPromote: () => void
}) {
  return (
    <li className="rounded-sm border border-hairline bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{candidate.kind}</Badge>
        <Badge variant={candidate.risk === 'high' ? 'destructive' : candidate.risk === 'medium' ? 'warning' : 'secondary'}>
          risk:
          {candidate.risk}
        </Badge>
        <span className="font-mono text-micro text-muted-foreground">
          {Math.round(candidate.confidence * 100)}
          %
        </span>
      </div>
      <p className="text-sm">{candidate.summary}</p>
      <p className="mt-3 truncate font-mono text-xs text-muted-foreground">{review.taskId}</p>
      <Button className="mt-4" type="button" variant="outline" disabled={disabled} onClick={onPromote}>
        <Lightbulb className="size-4" />
        Promote
      </Button>
    </li>
  )
}

function PageHeader({ eyebrow, title, copy }: { copy: string, eyebrow: string, title: string }) {
  return (
    <header className="app-page-header min-w-0">
      <p className="text-micro uppercase text-muted-foreground">{eyebrow}</p>
      <h1 className="app-page-title">{title}</h1>
      <p className="app-page-copy break-words">{copy}</p>
    </header>
  )
}

function PanelHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: typeof ListChecks
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

function ReviewBlock({
  title,
  icon: Icon,
  children,
}: {
  children: React.ReactNode
  icon: typeof ListChecks
  title: string
}) {
  return (
    <section className="app-panel-soft min-w-0">
      <h3 className="mb-3 flex items-center gap-2 text-micro uppercase text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function LessonItem({ candidate }: { candidate: WorkerReviewLessonCandidate }) {
  return (
    <li className="rounded-sm border border-hairline bg-background p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{candidate.kind}</Badge>
        <Badge variant={candidate.risk === 'high' ? 'destructive' : candidate.risk === 'medium' ? 'warning' : 'secondary'}>
          {candidate.risk}
        </Badge>
      </div>
      <p>{candidate.summary}</p>
      <RefList refs={candidate.evidenceRefs} />
    </li>
  )
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div className="min-w-0 border-l border-hairline pl-3">
      <dt className="text-micro uppercase text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">{value}</dd>
    </div>
  )
}

function Detail({ label, value, code }: { code?: boolean, label: string, value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro uppercase text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm', code && 'font-mono text-xs')}>{value}</dd>
    </div>
  )
}

function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0)
    return <p className="text-sm text-muted-foreground">No reasons recorded.</p>
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {reasons.map(reason => <li key={reason} className="rounded-sm border border-hairline bg-background p-2">{reason}</li>)}
    </ul>
  )
}

function RefList({ refs }: { refs: string[] }) {
  if (refs.length === 0)
    return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {refs.map(ref => <Badge key={ref} variant="outline">{ref}</Badge>)}
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

function formatDate(value?: string | null): string {
  if (!value)
    return '—'
  return new Date(value).toLocaleString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载失败'
}
