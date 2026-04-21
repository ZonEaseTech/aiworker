import type { SafeRegisteredWorker } from '@aiworker/shared'
import { useNavigate } from '@tanstack/react-router'
import { Activity, Check, Copy, KeyRound, Settings as SettingsIcon, ShieldAlert, TestTube2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WorkerApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDeleteWorker, useUpdateWorker } from '../hooks'
import { formatRelativeTime, stateBadgeLabel, stateBadgeVariant } from '../utils'

interface WorkerShellProps {
  worker: SafeRegisteredWorker
}

interface SidebarItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
}

const SIDEBAR: SidebarItem[] = [
  { id: 'overview', label: 'Overview', icon: Activity, enabled: true },
  { id: 'config', label: 'Config', icon: SettingsIcon, enabled: false },
  { id: 'secrets', label: 'Secrets', icon: KeyRound, enabled: false },
  { id: 'test', label: 'Test', icon: TestTube2, enabled: false },
  { id: 'activity', label: 'Activity', icon: ShieldAlert, enabled: false },
]

export function WorkerShell({ worker }: WorkerShellProps) {
  const [active, setActive] = useState<string>('overview')

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-card px-3 py-4">
        <div className="px-2 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</p>
          <p className="truncate text-sm font-semibold">{worker.displayName}</p>
        </div>
        {SIDEBAR.map(item => (
          <SidebarLink
            key={item.id}
            item={item}
            isActive={active === item.id}
            onClick={() => item.enabled && setActive(item.id)}
          />
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-6">
        {active === 'overview' && <OverviewPanel key={`${worker.id}-${worker.displayName}`} worker={worker} />}
      </div>
    </div>
  )
}

function SidebarLink({ item, isActive, onClick }: {
  item: SidebarItem
  isActive: boolean
  onClick: () => void
}) {
  const className = cn(
    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
    item.enabled
      ? isActive
        ? 'bg-accent text-accent-foreground font-medium'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      : 'cursor-not-allowed text-muted-foreground/60',
  )
  if (item.enabled) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <item.icon className="size-4" />
        {item.label}
      </button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={(props, state) => (
          <button
            type="button"
            aria-disabled="true"
            onClick={e => e.preventDefault()}
            {...props}
            data-state={state.open ? 'open' : 'closed'}
            className={className}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        )}
      />
      <TooltipContent>Coming in 4.2</TooltipContent>
    </Tooltip>
  )
}

function OverviewPanel({ worker }: { worker: SafeRegisteredWorker }) {
  const update = useUpdateWorker(worker.id)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(worker.displayName)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing)
      inputRef.current?.focus()
  }, [editing])

  async function save() {
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 80) {
      setError('Display name must be 1–80 characters.')
      return
    }
    if (trimmed === worker.displayName) {
      setEditing(false)
      setError(undefined)
      return
    }
    try {
      await update.mutateAsync({ displayName: trimmed })
      setEditing(false)
      setError(undefined)
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : 'Could not save changes.')
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Manager-side metadata for this worker.</p>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-6 sm:grid-cols-[160px_1fr]">
        <Row label="Worker id">
          <span className="break-all font-mono text-xs">{worker.id}</span>
          <CopyInline value={worker.id} label="worker id" />
        </Row>
        <Row label="Base URL">
          <a
            href={worker.baseUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-xs text-primary hover:underline"
          >
            {worker.baseUrl}
          </a>
        </Row>
        <Row label="Display name">
          {editing
            ? (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={80}
                    />
                    <Button onClick={save} disabled={update.isPending}>Save</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(false)
                        setName(worker.displayName)
                        setError(undefined)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                </div>
              )
            : (
                <div className="flex items-center gap-2">
                  <span>{worker.displayName}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                </div>
              )}
        </Row>
        <Row label="State">
          <Badge variant={stateBadgeVariant(worker.lastSeenState)}>
            {stateBadgeLabel(worker.lastSeenState)}
          </Badge>
        </Row>
        <Row label="Last seen">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(worker.lastSeenAt)}
            {' '}
            {worker.lastSeenAt && (
              <span className="ml-1 font-mono text-[10px]">
                (
                {worker.lastSeenAt}
                )
              </span>
            )}
          </span>
        </Row>
        <Row label="Config version">
          <span className="font-mono text-xs">{worker.lastConfigVersion ?? '—'}</span>
        </Row>
        <Row label="Added">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(worker.addedAt)}
            {' '}
            via
            {' '}
            <Badge variant="outline">{worker.addedBy}</Badge>
          </span>
        </Row>
      </dl>

      <UnregisterCard worker={worker} />
    </div>
  )
}

function Row({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1 text-sm">{children}</dd>
    </>
  )
}

function CopyInline({ value, label }: { value: string, label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Copy ${label}`}
      className="size-6"
      onClick={() => {
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

function UnregisterCard({ worker }: { worker: SafeRegisteredWorker }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const navigate = useNavigate()
  const del = useDeleteWorker()

  async function confirm() {
    try {
      await del.mutateAsync(worker.id)
      setOpen(false)
      void navigate({ to: '/workers' })
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : 'Could not unregister this worker.')
    }
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Unregister worker</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes the manager&apos;s pointer to this worker. The worker container itself is untouched.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Unregister
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unregister this worker?</DialogTitle>
            <DialogDescription>
              The manager will no longer poll
              {' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{worker.baseUrl}</code>
              {' '}
              or proxy traffic to it. You can re-register it any time with the same token.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirm} disabled={del.isPending}>
              {del.isPending ? 'Unregistering…' : 'Unregister'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
