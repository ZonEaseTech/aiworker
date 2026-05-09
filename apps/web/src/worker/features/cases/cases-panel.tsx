import type { WorkerCaseDecisionStatus, WorkerCaseFile, WorkerCaseLessonCandidate } from '@/worker/api'
import { FileSearch, GitBranch, Lightbulb, RefreshCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  useCase,
  useCases,
  useProposeCaseLessons,
  useRerunCase,
} from '@/worker/lib/hooks'

export function CasesPanel() {
  const casesQ = useCases(50)
  const cases = casesQ.data?.cases ?? []
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined)
  const activeTaskId = selectedTaskId !== undefined && cases.some(item => item.taskId === selectedTaskId)
    ? selectedTaskId
    : cases[0]?.taskId

  return (
    <section className="app-page">
      <header className="app-page-header min-w-0">
        <h1 className="app-page-title">Cases</h1>
        <p className="app-page-copy break-words">
          Worker Case File、Review Decision、evidence、risk 和 Lessons Queue。
        </p>
      </header>

      <div
        data-testid="worker-cases-panel"
        className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <CaseList
          cases={cases}
          isLoading={casesQ.isLoading}
          error={casesQ.error instanceof Error ? casesQ.error.message : null}
          activeTaskId={activeTaskId}
          onSelect={setSelectedTaskId}
        />
        <CaseDetail taskId={activeTaskId} />
      </div>
    </section>
  )
}

function CaseList({
  cases,
  isLoading,
  error,
  activeTaskId,
  onSelect,
}: {
  cases: WorkerCaseFile[]
  isLoading: boolean
  error: string | null
  activeTaskId?: string
  onSelect: (taskId: string) => void
}) {
  return (
    <aside className="app-panel flex min-w-0 flex-col gap-3 lg:col-span-1">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-feature font-normal">Case list</h2>
        <Badge variant="outline">{cases.length}</Badge>
      </div>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {error && (
        <p role="alert" className="app-alert-error">
          加载失败：
          {error}
        </p>
      )}
      {!isLoading && cases.length === 0 && !error && (
        <div className="app-empty p-6">
          暂无 Case File。
        </div>
      )}
      <ul className="flex max-h-96 min-w-0 flex-col gap-2 overflow-y-auto">
        {cases.map(file => (
          <li key={file.taskId}>
            <button
              type="button"
              className={`flex w-full min-w-0 flex-col gap-2 rounded-sm border px-3 py-3 text-left text-sm transition-colors ${
                activeTaskId === file.taskId
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-hairline bg-background hover:bg-soft-stone'
              }`}
              onClick={() => onSelect(file.taskId)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <StatusBadge status={file.reviewDecision.status} active={activeTaskId === file.taskId} />
                <span className="truncate font-mono text-xs">{file.taskId}</span>
              </span>
              <span className={`line-clamp-2 text-xs ${activeTaskId === file.taskId ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                {file.workOrder.prompt}
              </span>
              <span className={`font-mono text-micro ${activeTaskId === file.taskId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {new Date(file.workOrder.createdAt).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function CaseDetail({ taskId }: { taskId?: string }) {
  const caseQ = useCase(taskId)
  const rerun = useRerunCase()
  const proposeLessons = useProposeCaseLessons()
  const file = caseQ.data?.case
  const pendingAction = rerun.isPending || proposeLessons.isPending

  if (taskId === undefined) {
    return (
      <section className="app-panel lg:col-span-2">
        <div className="app-empty">选择一个 Case 查看详情。</div>
      </section>
    )
  }

  if (caseQ.isLoading || file === undefined) {
    return (
      <section className="app-panel lg:col-span-2">
        <Skeleton className="h-96 w-full" />
      </section>
    )
  }

  if (caseQ.error) {
    return (
      <section className="app-panel lg:col-span-2">
        <p role="alert" className="app-alert-error">
          加载失败：
          {caseQ.error instanceof Error ? caseQ.error.message : 'unknown error'}
        </p>
      </section>
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 lg:col-span-2">
      <div className="app-panel flex min-w-0 flex-col gap-4">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-micro uppercase text-muted-foreground">Review Decision</p>
            <h2 className="break-words text-feature font-normal">{file.reviewDecision.summary}</h2>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{file.taskId}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StatusBadge status={file.reviewDecision.status} />
            <Badge variant={file.risk.risk === 'high' ? 'destructive' : 'outline'}>
              risk:
              {file.risk.risk}
            </Badge>
            <Badge variant={file.risk.enforceable ? 'default' : 'secondary'}>
              {file.risk.enforceable ? 'enforced' : 'observe-only'}
            </Badge>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="messages" value={String(file.evidence.messageCount)} />
          <Metric label="tool events" value={String(file.evidence.toolEventCount)} />
          <Metric label="journal events" value={String(file.evidence.journalEventCount)} />
          <Metric label="reruns" value={String(file.lineage.rerunCount)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction}
            onClick={() => rerun.mutate({ taskId: file.taskId })}
          >
            <RefreshCcw className="size-4" />
            Rerun
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pendingAction || file.lessons.candidateCount === 0}
            onClick={() => proposeLessons.mutate(file.taskId)}
          >
            <Lightbulb className="size-4" />
            Propose lessons
          </Button>
        </div>

        {(rerun.error || proposeLessons.error) && (
          <p role="alert" className="app-alert-error">
            操作失败：
            {(rerun.error ?? proposeLessons.error)?.message}
          </p>
        )}
        {rerun.data && (
          <p className="app-alert-success">
            已创建 rerun task：
            <code className="app-code">{rerun.data.id}</code>
          </p>
        )}
        {proposeLessons.data && (
          <p className="app-alert-success">
            已创建
            {' '}
            {proposeLessons.data.proposals.length}
            {' '}
            条 pending proposal。
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkOrder file={file} />
        <RiskPanel file={file} />
        <EvidencePanel file={file} />
        <LessonsPanel file={file} />
      </div>
    </section>
  )
}

function WorkOrder({ file }: { file: WorkerCaseFile }) {
  return (
    <section className="app-panel-soft min-w-0">
      <h3 className="mb-3 flex items-center gap-2 text-micro uppercase text-muted-foreground">
        <FileSearch className="size-4" />
        Work Order
      </h3>
      <dl className="space-y-3 text-sm">
        <DetailRow label="status" value={file.workOrder.status} />
        <DetailRow label="created" value={new Date(file.workOrder.createdAt).toLocaleString()} />
        {file.workOrder.finishedAt && <DetailRow label="finished" value={new Date(file.workOrder.finishedAt).toLocaleString()} />}
        {file.workOrder.conversationId && <DetailRow label="conversation" value={file.workOrder.conversationId} code />}
      </dl>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-sm border border-hairline bg-background p-3 text-sm">
        {file.workOrder.prompt}
      </p>
      {file.outcome.assistantPreview && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-sm border border-hairline bg-background p-3 text-sm text-muted-foreground">
          {file.outcome.assistantPreview}
        </p>
      )}
    </section>
  )
}

function RiskPanel({ file }: { file: WorkerCaseFile }) {
  return (
    <section className="app-panel-soft min-w-0">
      <h3 className="mb-3 text-micro uppercase text-muted-foreground">Risk</h3>
      <dl className="space-y-3 text-sm">
        <DetailRow label="authority" value={file.risk.authorityMode} code />
        <DetailRow label="executor" value={file.risk.executorNote} />
        <DetailRow label="observe-only reasons" value={String(file.risk.observeOnlyReasonCount)} />
      </dl>
      {file.risk.warning && <p className="mt-3 app-alert-warning">{file.risk.warning}</p>}
      {file.risk.recommendation && (
        <p className="mt-3 text-sm text-muted-foreground">{file.risk.recommendation}</p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {file.risk.signals.map(signal => (
          <li key={`${signal.type}:${signal.reason}`} className="rounded-sm border border-hairline bg-background p-2 text-xs">
            <span className="font-mono">{signal.type}</span>
            <span>{` · ${signal.reason}`}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EvidencePanel({ file }: { file: WorkerCaseFile }) {
  const refs = useMemo(() => [
    ...file.reviewDecision.evidenceRefs,
    ...file.evidence.keyEvidenceRefs,
  ].filter((item, index, all) => item.length > 0 && all.indexOf(item) === index), [file])

  return (
    <section className="app-panel-soft min-w-0">
      <h3 className="mb-3 flex items-center gap-2 text-micro uppercase text-muted-foreground">
        <GitBranch className="size-4" />
        Evidence
      </h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {file.evidence.loadedMemoryIds.map(id => <Badge key={`mem:${id}`} variant="outline">{`memory:${id}`}</Badge>)}
        {file.evidence.loadedSkillIds.map(id => <Badge key={`skill:${id}`} variant="outline">{`skill:${id}`}</Badge>)}
      </div>
      <ReasonList reasons={file.reviewDecision.reasons} />
      <RefList refs={refs.length === 0 ? [file.rawJournalRef] : refs} />
    </section>
  )
}

function LessonsPanel({ file }: { file: WorkerCaseFile }) {
  return (
    <section className="app-panel-soft min-w-0">
      <h3 className="mb-3 text-micro uppercase text-muted-foreground">Lessons Queue</h3>
      {file.lessons.candidates.length === 0
        ? <p className="text-sm text-muted-foreground">暂无 lesson candidate。</p>
        : (
            <ul className="flex flex-col gap-3">
              {file.lessons.candidates.map(candidate => <LessonItem key={candidate.index} candidate={candidate} />)}
            </ul>
          )}
      {file.lessons.proposalIds.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {file.lessons.proposalIds.map(id => <Badge key={id} variant="secondary">{id}</Badge>)}
        </div>
      )}
    </section>
  )
}

function LessonItem({ candidate }: { candidate: WorkerCaseLessonCandidate }) {
  return (
    <li className="rounded-sm border border-hairline bg-background p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{candidate.kind}</Badge>
        <Badge variant={candidate.risk === 'high' ? 'destructive' : 'secondary'}>
          risk:
          {candidate.risk}
        </Badge>
        <Badge variant="outline">
          confidence:
          {candidate.confidence.toFixed(2)}
        </Badge>
      </div>
      <p className="break-words">{candidate.summary}</p>
      {candidate.target && <p className="mt-2 font-mono text-xs text-muted-foreground">{candidate.target}</p>}
      <RefList refs={candidate.evidenceRefs} />
    </li>
  )
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-sm border border-hairline bg-soft-stone p-3">
      <p className="text-micro uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  )
}

function DetailRow({ label, value, code = false }: { label: string, value: string, code?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="text-micro uppercase text-muted-foreground">{label}</dt>
      <dd className={code ? 'break-all font-mono text-xs' : 'break-words'}>{value}</dd>
    </div>
  )
}

function ReasonList({ reasons }: { reasons: WorkerCaseFile['reviewDecision']['reasons'] }) {
  if (reasons.length === 0)
    return <p className="text-sm text-muted-foreground">暂无 decision reason。</p>
  return (
    <ul className="mb-3 flex flex-col gap-2">
      {reasons.map(reason => (
        <li key={`${reason.source}:${reason.mode}:${reason.reason}`} className="rounded-sm border border-hairline bg-background p-2 text-xs">
          <div className="mb-1 flex flex-wrap gap-2">
            <Badge variant="outline">{reason.source}</Badge>
            <Badge variant={reason.mode === 'enforced' ? 'default' : 'secondary'}>{reason.mode}</Badge>
          </div>
          <p className="break-words">{reason.reason}</p>
        </li>
      ))}
    </ul>
  )
}

function RefList({ refs }: { refs: string[] }) {
  if (refs.length === 0)
    return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {refs.map(ref => <li key={ref}><Badge variant="outline">{ref}</Badge></li>)}
    </ul>
  )
}

function StatusBadge({ status, active = false }: { status: WorkerCaseDecisionStatus, active?: boolean }) {
  const variant = status === 'blocked'
    ? 'destructive'
    : status === 'ready_to_ship'
      ? 'default'
      : status === 'needs_rerun'
        ? 'secondary'
        : 'outline'
  return (
    <Badge variant={active ? 'secondary' : variant}>{status}</Badge>
  )
}
