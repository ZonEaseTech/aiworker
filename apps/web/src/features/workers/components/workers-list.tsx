import type { SafeRegisteredWorker } from '@aiworker/shared'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, ExternalLink, PlusCircle, ServerOff } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useRegisteredWorkers } from '../hooks'
import { formatRelativeTime, stateBadgeLabel, stateBadgeVariant, truncateWorkerId } from '../utils'
import { RegisterWizard } from './register-wizard'

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

export function WorkersList({ workers: workersProp }: WorkersListProps = {}) {
  const navigate = useNavigate()
  const query = useRegisteredWorkers()
  const [wizardOpen, setWizardOpen] = useState(false)

  const workers = workersProp ?? query.data
  const isLoading = workersProp === undefined && query.isLoading

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workers</h1>
          <p className="text-sm text-muted-foreground">
            Registered AIWorker runtimes the manager can drive.
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <PlusCircle className="size-4" />
          Register worker
        </Button>
      </div>

      {isLoading
        ? <WorkersListSkeleton />
        : workers && workers.length > 0
          ? (
              <div className="overflow-hidden rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display name</TableHead>
                      <TableHead>Worker id</TableHead>
                      <TableHead>Base URL</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Config version</TableHead>
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
                        <TableCell className="font-medium">{worker.displayName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {truncateWorkerId(worker.id)}
                            </code>
                            <CopyButton value={worker.id} label="worker id" />
                          </div>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeTime(worker.lastSeenAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stateBadgeVariant(worker.lastSeenState)}>
                            {stateBadgeLabel(worker.lastSeenState)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {worker.lastConfigVersion ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          : <EmptyState onRegister={() => setWizardOpen(true)} />}

      <RegisterWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}

function WorkersListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="space-y-3 p-6">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 p-12 text-center">
      <ServerOff className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">No workers registered yet</h2>
        <p className="text-sm text-muted-foreground">
          Click Register to add one — it just needs the worker&apos;s base URL and bootstrap API token.
        </p>
      </div>
      <Button onClick={onRegister}>
        <PlusCircle className="size-4" />
        Register a worker
      </Button>
    </div>
  )
}
