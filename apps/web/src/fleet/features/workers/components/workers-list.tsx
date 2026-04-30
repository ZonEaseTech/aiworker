import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, ExternalLink, MoreHorizontal, PlusCircle, ServerOff, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { useRegisteredWorkers } from '../hooks'
import { formatRelativeTime, stateBadgeLabel, stateBadgeVariant, truncateWorkerId } from '../utils'
import { CreateWizard } from './create-wizard'
import { RegisterWizard } from './register-wizard'
import { RemoveWorkerDialog } from './remove-worker-dialog'
import { RotateTokenDialog } from './rotate-token-dialog'
import { StopWorkerDialog } from './stop-worker-dialog'

interface CopyButtonProps {
  value: string
  label: string
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Copy ${label}`}
      className="size-6"
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

interface WorkersListProps {
  /** Test seam — when supplied the component skips its own data fetching. */
  workers?: SafeRegisteredWorker[]
}

type RowAction
  = | { kind: 'rotate', worker: SafeRegisteredWorker }
    | { kind: 'remove', worker: SafeRegisteredWorker }
    | { kind: 'stop', worker: SafeRegisteredWorker }

export function WorkersList({ workers: workersProp }: WorkersListProps = {}) {
  const navigate = useNavigate()
  const query = useRegisteredWorkers()
  const [pairOpen, setPairOpen] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<RowAction | null>(null)

  const workers = workersProp ?? query.data
  const isLoading = workersProp === undefined && query.isLoading

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Workers</h1>
          <p className="text-sm text-muted-foreground">
            Registered AIWorker runtimes the fleet can drive.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setPairOpen(true)}
          >
            <PlusCircle className="size-4" />
            Pair worker
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setLaunchOpen(true)}>
            <Sparkles className="size-4" />
            Launch worker
          </Button>
        </div>
      </div>

      {isLoading
        ? <WorkersListSkeleton />
        : workers && workers.length > 0
          ? (
              <div className="overflow-hidden rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display name</TableHead>
                      <TableHead>Worker id</TableHead>
                      <TableHead>Base URL</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="w-[1%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workers.map(worker => (
                      <TableRow
                        key={worker.id}
                        className="cursor-pointer"
                        onClick={() =>
                          void navigate({ to: '/workers/$workerId', params: { workerId: worker.id } })}
                      >
                        <TableCell className="font-bold">{worker.displayName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {truncateWorkerId(worker.id)}
                            </code>
                            <CopyButton value={worker.id} label="worker id" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {worker.baseUrl
                            ? (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={worker.baseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {worker.baseUrl}
                                    <ExternalLink className="size-3" />
                                  </a>
                                  <CopyButton value={worker.baseUrl} label="base URL" />
                                </div>
                              )
                            : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeTime(worker.lastSeenAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stateBadgeVariant(worker.lastSeenState)}>
                            {stateBadgeLabel(worker.lastSeenState)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <RowActionsMenu
                            worker={worker}
                            onRotate={() => setPendingAction({ kind: 'rotate', worker })}
                            onRemove={() => setPendingAction({ kind: 'remove', worker })}
                            onStop={() => setPendingAction({ kind: 'stop', worker })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          : <EmptyState onRegister={() => setPairOpen(true)} />}

      <RegisterWizard open={pairOpen} onOpenChange={setPairOpen} />
      <CreateWizard open={launchOpen} onOpenChange={setLaunchOpen} />
      {pendingAction?.kind === 'rotate' && (
        <RotateTokenDialog
          worker={pendingAction.worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
      {pendingAction?.kind === 'remove' && (
        <RemoveWorkerDialog
          worker={pendingAction.worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
      {pendingAction?.kind === 'stop' && (
        <StopWorkerDialog
          worker={pendingAction.worker}
          open
          onOpenChange={open => !open && setPendingAction(null)}
        />
      )}
    </div>
  )
}

interface RowActionsMenuProps {
  worker: SafeRegisteredWorker
  onRotate: () => void
  onRemove: () => void
  onStop: () => void
}

/**
 * 简版下拉，避免引入新的 menu primitive 依赖。点击展开时再渲染列表，关闭时
 * blur 自动收起；shadcn DropdownMenu 在 FEAT-035 worker 视角接入后再统一升级。
 */
function RowActionsMenu({ worker, onRotate, onRemove, onStop }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const isOnline = worker.lastSeenState === 'online'
  return (
    <div className="relative inline-block text-left">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Worker actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="size-8"
        onClick={() => setOpen(v => !v)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-card"
          onMouseLeave={() => setOpen(false)}
        >
          <a
            role="menuitem"
            href={workerUiPath(worker.id)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="size-3.5" />
            Open worker UI
          </a>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
            onClick={() => {
              setOpen(false)
              onRotate()
            }}
          >
            Rotate token
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={!isOnline}
            title={!isOnline ? 'Stop is only available while the worker is online.' : undefined}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            onClick={() => {
              setOpen(false)
              onStop()
            }}
          >
            Stop runtime
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            Remove from fleet
          </button>
        </div>
      )}
    </div>
  )
}

function workerUiPath(workerId: string): string {
  return `/w/${workerId}/`
}

function WorkersListSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="space-y-3 p-4 sm:p-6">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-card p-6 text-center sm:p-12">
      <ServerOff className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-bold">No workers registered yet</h2>
        <p className="text-sm text-muted-foreground">
          Click Pair to attach a worker that has already started — it just
          needs the worker&apos;s base URL and bootstrap API token.
        </p>
      </div>
      <Button className="w-full sm:w-auto" onClick={onRegister}>
        <PlusCircle className="size-4" />
        Register a worker
      </Button>
    </div>
  )
}
