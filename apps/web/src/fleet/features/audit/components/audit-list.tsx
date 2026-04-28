import type { AuditEventRecord } from '@/fleet/api'
import { ChevronLeft, ChevronRight, FileText, Filter } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { useDebounce } from '@/shared/lib/hooks/useDebounce'
import { useAuditEvents } from '../hooks'

const PAGE_LIMIT = 50

export function AuditList() {
  const [actionFilter, setActionFilter] = useState('')
  const [workerIdFilter, setWorkerIdFilter] = useState('')
  /** before 游标栈：每翻一页 push 一个，回退时 pop。 */
  const [cursorStack, setCursorStack] = useState<number[]>([])

  const debouncedAction = useDebounce(actionFilter.trim(), 300)
  const debouncedWorkerId = useDebounce(workerIdFilter.trim(), 300)
  const before = cursorStack[cursorStack.length - 1]

  const query = useAuditEvents({
    limit: PAGE_LIMIT,
    ...(before === undefined ? {} : { before }),
    ...(debouncedAction.length > 0 ? { action: debouncedAction } : {}),
    ...(debouncedWorkerId.length > 0 ? { workerId: debouncedWorkerId } : {}),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="break-words text-sm text-muted-foreground">
          fleet.db
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">audit_events</code>
          {' '}
          — gateway-side activity. Worker-side audit lives in each worker&apos;s
          own database.
        </p>
      </div>

      <FilterBar
        action={actionFilter}
        workerId={workerIdFilter}
        onActionChange={(v) => {
          setActionFilter(v)
          setCursorStack([])
        }}
        onWorkerIdChange={(v) => {
          setWorkerIdFilter(v)
          setCursorStack([])
        }}
      />

      {query.isLoading
        ? <Skeleton className="h-64 w-full" />
        : query.isError
          ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to load audit events:
                {' '}
                {(query.error as Error | null)?.message ?? 'unknown error'}
              </p>
            )
          : (query.data?.events ?? []).length === 0
              ? (
                  <EmptyState />
                )
              : (
                  <div className="overflow-hidden rounded-lg border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[7rem]">id</TableHead>
                          <TableHead className="w-[12rem]">When</TableHead>
                          <TableHead className="w-[10rem]">Actor</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead className="w-[14rem]">Worker</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(query.data?.events ?? []).map(ev => (
                          <AuditRow key={ev.id} event={ev} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

      <Pager
        canBack={cursorStack.length > 0}
        canForward={query.data?.hasMore ?? false}
        onBack={() => setCursorStack(s => s.slice(0, -1))}
        onForward={() => {
          const events = query.data?.events ?? []
          const last = events[events.length - 1]
          if (last)
            setCursorStack(s => [...s, last.id])
        }}
      />
    </div>
  )
}

function FilterBar({
  action,
  workerId,
  onActionChange,
  onWorkerIdChange,
}: {
  action: string
  workerId: string
  onActionChange: (v: string) => void
  onWorkerIdChange: (v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
      <div className="grid w-full gap-1 sm:w-64">
        <Label htmlFor="audit-action">Action prefix</Label>
        <Input
          id="audit-action"
          placeholder="gateway.connect."
          value={action}
          onChange={e => onActionChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="w-full"
        />
      </div>
      <div className="grid w-full gap-1 sm:w-64">
        <Label htmlFor="audit-worker">Worker id (exact)</Label>
        <Input
          id="audit-worker"
          placeholder="w_…"
          value={workerId}
          onChange={e => onWorkerIdChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="w-full"
        />
      </div>
      <div className="flex min-w-0 items-start gap-1.5 pb-1.5 text-xs text-muted-foreground sm:items-center">
        <Filter className="mt-0.5 size-3.5 shrink-0 sm:mt-0" />
        <span className="min-w-0 break-words">
          Filters apply on debounce. Action prefix is a SQL
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">LIKE</code>
          ;
          {' '}
          non-alphanumeric characters fall back to exact match.
        </span>
      </div>
    </div>
  )
}

function AuditRow({ event }: { event: AuditEventRecord }) {
  const [expanded, setExpanded] = useState(false)
  const detailJson = event.detail ? JSON.stringify(event.detail, null, 2) : null
  const compact = detailJson?.replace(/\s+/g, ' ').trim() ?? '—'
  return (
    <TableRow className="align-top">
      <TableCell className="font-mono text-xs">{event.id}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(event.at).toLocaleString()}
      </TableCell>
      <TableCell className="text-xs">{event.actor}</TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{event.action}</code>
      </TableCell>
      <TableCell className="font-mono text-xs">{event.workerId ?? '—'}</TableCell>
      <TableCell className="text-xs">
        {detailJson === null
          ? <span className="text-muted-foreground">—</span>
          : (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="text-left text-xs text-primary hover:underline"
                  onClick={() => setExpanded(v => !v)}
                >
                  {expanded ? 'Hide JSON' : 'Show JSON'}
                </button>
                {expanded
                  ? (
                      <pre className="max-h-64 overflow-auto rounded bg-muted/50 p-2 font-mono text-[11px]">
                        {detailJson}
                      </pre>
                    )
                  : (
                      <span className="line-clamp-1 break-all text-muted-foreground">{compact}</span>
                    )}
              </div>
            )}
      </TableCell>
    </TableRow>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 p-6 text-center sm:p-12">
      <FileText className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No audit events match the current filters.
      </p>
    </div>
  )
}

function Pager({
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
}) {
  return (
    <div className="flex justify-between">
      <Button variant="outline" size="sm" disabled={!canBack} onClick={onBack}>
        <ChevronLeft className="size-3.5" />
        Newer
      </Button>
      <Button variant="outline" size="sm" disabled={!canForward} onClick={onForward}>
        Older
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  )
}
