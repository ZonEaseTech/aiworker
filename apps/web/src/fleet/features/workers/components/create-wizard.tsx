import type { RegisteredWorkerLivenessState } from '@zonease/aiworker-shared'
import type { WorkerApiError } from '@/fleet/api'
import { useNavigate } from '@tanstack/react-router'
import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'
import { AlertTriangle, CheckCircle2, Copy, Eye, EyeOff, Info, Lock } from 'lucide-react'
import { useId, useState } from 'react'
import { WorkerApiError as WorkerApiErrorClass } from '@/fleet/api'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useLaunchWorker } from '../hooks'
import { stateBadgeLabel, stateBadgeVariant } from '../utils'

interface CreateWizardProps {
  open: boolean
  onOpenChange: (next: boolean) => void
}

interface FormErrors {
  displayName?: string
  forceId?: string
  form?: string
}

interface SuccessPayload {
  id: string
  displayName: string
  baseUrl: string
  lastSeenState?: RegisteredWorkerLivenessState
  /** gateway 颁发的一次性 deviceToken；仅在 React state in-memory，关闭对话框立刻清。 */
  deviceToken: string
}

/**
 * PLAN-010 §P6 — create-wizard. Drives POST /api/workers/launch-local which
 * spins a worker container on the dashboard's docker engine, scrapes the
 * bootstrap token, and registers the row in one round-trip. The wizard
 * surfaces the plaintext bearer once (like a GitHub PAT) — it is never
 * retrievable from the manager again.
 */
export function CreateWizard({ open, onOpenChange }: CreateWizardProps) {
  const [instanceKey, setInstanceKey] = useState(0)

  function handleOpenChange(next: boolean) {
    if (next)
      setInstanceKey(k => k + 1)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <CreateFlow
          key={instanceKey}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function CreateFlow({ onClose }: { onClose: () => void }) {
  const [success, setSuccess] = useState<SuccessPayload | null>(null)
  const navigate = useNavigate()

  if (success) {
    return (
      <SuccessStep
        payload={success}
        onClose={onClose}
        onGoToWorker={() => {
          onClose()
          void navigate({ to: '/workers/$workerId', params: { workerId: success.id } })
        }}
      />
    )
  }

  return (
    <CreateForm
      onCancel={onClose}
      onSuccess={setSuccess}
    />
  )
}

interface CreateFormProps {
  onCancel: () => void
  onSuccess: (payload: SuccessPayload) => void
}

function CreateForm({ onCancel, onSuccess }: CreateFormProps) {
  const displayNameId = useId()
  const forceIdId = useId()
  const [displayName, setDisplayName] = useState('')
  const [forceId, setForceId] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const launch = useLaunchWorker()

  function validate(): FormErrors | null {
    const next: FormErrors = {}
    const trimmedName = displayName.trim()
    if (trimmedName.length === 0)
      next.displayName = 'Display name is required'
    else if (trimmedName.length > 80)
      next.displayName = 'Display name must be 80 characters or fewer'
    if (forceId.trim().length > 0 && !WORKER_ID_PATTERN.test(forceId.trim()))
      next.forceId = 'Worker id must match w_<12 chars> (base32 crockford)'
    return Object.keys(next).length > 0 ? next : null
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    if (validationErrors) {
      setErrors(validationErrors)
      return
    }
    setErrors({})
    try {
      const result = await launch.mutateAsync({
        displayName: displayName.trim(),
        ...(forceId.trim().length > 0 ? { forceId: forceId.trim() } : {}),
      })
      onSuccess({
        id: result.worker.id,
        displayName: result.worker.displayName,
        baseUrl: result.worker.baseUrl,
        lastSeenState: result.worker.lastSeenState,
        deviceToken: result.deviceToken,
      })
    }
    catch (err) {
      setErrors(mapServerError(err))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Create worker</DialogTitle>
        <DialogDescription>
          The manager spawns a fresh worker container on the local docker
          engine, scrapes its bootstrap token, and registers it in one step.
          Takes 10–30 seconds.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor={displayNameId}>Display name</Label>
          <Input
            id={displayNameId}
            placeholder="prod-edge-1"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={80}
            autoFocus
            aria-invalid={errors.displayName ? 'true' : undefined}
          />
          <FieldError message={errors.displayName} />
        </div>

        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setAdvancedOpen(v => !v)}
          >
            {advancedOpen ? 'Hide' : 'Show'}
            {' '}
            advanced options
          </button>
        </div>

        {advancedOpen && (
          <div className="grid gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3">
            <Label htmlFor={forceIdId}>Force workerId (optional)</Label>
            <Input
              id={forceIdId}
              placeholder="w_abcdef123456"
              value={forceId}
              onChange={e => setForceId(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={errors.forceId ? 'true' : undefined}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Pins the container's future workerId. Only useful for
                deterministic replay / test scenarios — leave empty to let the
                worker mint its own.
              </span>
            </p>
            <FieldError message={errors.forceId} />
          </div>
        )}

        {errors.form && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {errors.form}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={launch.isPending}>
          {launch.isPending ? 'Launching…' : 'Launch'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function mapServerError(err: unknown): FormErrors {
  if (err instanceof WorkerApiErrorClass) {
    const apiErr = err as WorkerApiError
    switch (apiErr.code) {
      case 'quota-exceeded':
        return {
          form: typeof apiErr.quotaLimit === 'number'
            ? `Worker quota reached (${apiErr.quotaCurrent ?? '?'} / ${apiErr.quotaLimit}). Delete an existing worker or raise MANAGER_MAX_WORKERS.`
            : 'Worker quota reached. Delete an existing worker or raise MANAGER_MAX_WORKERS.',
        }
      case 'launch-timeout':
        return { form: 'The worker container took too long to emit its bootstrap token. Check `docker logs` on the host.' }
      case 'launch-failed':
        return { form: apiErr.message || 'Launch failed. Check the dashboard logs and the supervisor prerequisites in docs/deployment.md.' }
      case 'auth-failed':
        return { form: 'The launched worker rejected its own bootstrap token. This is a bug — file an issue.' }
      case 'worker-unreachable':
        return { form: apiErr.message || 'The launched worker could not be reached at its baseUrl. Check the docker network membership of the dashboard.' }
      case 'invalid-worker-info':
        return { form: 'Reached the worker but its /info response was malformed.' }
      case 'already-registered':
        return { form: 'The worker reported an id that is already in the registry.' }
      case 'invalid-body':
        return { form: 'The manager rejected the payload. Re-check the fields.' }
      case 'auth-required':
        return { form: 'Dashboard authentication required. Reload the page and sign in.' }
      default:
        return { form: apiErr.message || 'Launch failed. Try again.' }
    }
  }
  return { form: 'Launch failed. Try again.' }
}

function FieldError({ message }: { message?: string }) {
  if (!message)
    return null
  return <p role="alert" className="text-xs text-destructive">{message}</p>
}

function SuccessStep({
  payload,
  onClose,
  onGoToWorker,
}: {
  payload: SuccessPayload
  onClose: () => void
  onGoToWorker: () => void
}) {
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  async function onCopyToken() {
    try {
      await navigator.clipboard.writeText(payload.deviceToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    catch {
      // Clipboard may be unavailable in insecure contexts; the operator can
      // still select the field value by hand.
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          <DialogTitle>Worker created</DialogTitle>
        </div>
        <DialogDescription>
          The bearer token is shown
          {' '}
          <strong>once</strong>
          {' '}
          — copy it before closing if you need it outside the dashboard. The
          manager retains an encrypted copy; the plaintext is not recoverable.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 py-4 text-sm">
        <dt className="text-muted-foreground">Worker id</dt>
        <dd className="font-mono text-xs">{payload.id}</dd>
        <dt className="text-muted-foreground">Display name</dt>
        <dd>{payload.displayName}</dd>
        <dt className="text-muted-foreground">Base URL</dt>
        <dd className="break-all font-mono text-xs">{payload.baseUrl}</dd>
        {payload.lastSeenState && (
          <>
            <dt className="text-muted-foreground">State</dt>
            <dd>
              <Badge variant={stateBadgeVariant(payload.lastSeenState)}>
                {stateBadgeLabel(payload.lastSeenState)}
              </Badge>
            </dd>
          </>
        )}
      </dl>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
        <p className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
          <Lock className="size-3.5" />
          One-time bearer token
        </p>
        <div className="flex items-center gap-2 rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px]">
          <code className="flex-1 break-all">
            {showToken ? payload.deviceToken : payload.deviceToken.replace(/./g, '•')}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setShowToken(v => !v)}
            aria-label={showToken ? 'Hide token' : 'Show token'}
          >
            {showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onCopyToken}
            aria-label="Copy token"
          >
            <Copy className="size-3" />
          </Button>
        </div>
        {copied && (
          <p role="status" className="mt-1 text-emerald-600 dark:text-emerald-400">
            Copied.
          </p>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This value is not shown again. If you lose it, rotate the token
            from the worker&apos;s detail page.
          </span>
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onGoToWorker}>Go to worker</Button>
      </DialogFooter>
    </>
  )
}
