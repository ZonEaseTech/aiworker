import type { SafeRegisteredWorker } from '@aiworker/shared'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WorkerApiError } from '@/lib/api'
import { useRegisterWorker } from '../hooks'
import { stateBadgeLabel, stateBadgeVariant } from '../utils'

const WORKER_API_TOKEN_PREFIX = 'wtk_'

interface FormErrors {
  baseUrl?: string
  apiToken?: string
  displayName?: string
  /** Errors that don't apply to a single field — e.g. unknown server failure. */
  form?: string
}

interface RegisterWizardProps {
  open: boolean
  onOpenChange: (next: boolean) => void
}

export function RegisterWizard({ open, onOpenChange }: RegisterWizardProps) {
  // Bumping `instanceKey` whenever we re-open the dialog forces RegisterForm
  // and SuccessStep to remount with fresh internal state — avoids the
  // "reset state on close inside useEffect" anti-pattern.
  const [instanceKey, setInstanceKey] = useState(0)

  function handleOpenChange(next: boolean) {
    if (next)
      setInstanceKey(k => k + 1)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <RegisterFlow
          key={instanceKey}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function RegisterFlow({ onClose }: { onClose: () => void }) {
  const [registered, setRegistered] = useState<SafeRegisteredWorker | null>(null)
  const navigate = useNavigate()

  if (registered) {
    return (
      <SuccessStep
        worker={registered}
        onClose={onClose}
        onGoToConfig={() => {
          onClose()
          void navigate({ to: '/workers/$workerId', params: { workerId: registered.id } })
        }}
      />
    )
  }

  return (
    <RegisterForm
      onCancel={onClose}
      onSuccess={setRegistered}
    />
  )
}

interface RegisterFormProps {
  onCancel: () => void
  onSuccess: (row: SafeRegisteredWorker) => void
}

function RegisterForm({ onCancel, onSuccess }: RegisterFormProps) {
  const baseUrlId = useId()
  const apiTokenId = useId()
  const displayNameId = useId()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const register = useRegisterWorker()

  function validate(): FormErrors | null {
    const next: FormErrors = {}
    try {
      const parsed = new URL(baseUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        next.baseUrl = 'Base URL must use http(s)://'
    }
    catch {
      next.baseUrl = 'Enter a valid URL (e.g. https://worker.example.com)'
    }
    if (!apiToken.startsWith(WORKER_API_TOKEN_PREFIX))
      next.apiToken = `API token must start with ${WORKER_API_TOKEN_PREFIX}`
    const trimmedName = displayName.trim()
    if (trimmedName.length === 0)
      next.displayName = 'Display name is required'
    else if (trimmedName.length > 80)
      next.displayName = 'Display name must be 80 characters or fewer'
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
      const row = await register.mutateAsync({
        baseUrl: baseUrl.replace(/\/+$/, ''),
        apiToken,
        displayName: displayName.trim(),
      })
      onSuccess(row)
    }
    catch (err) {
      setErrors(mapServerError(err))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Register a worker</DialogTitle>
        <DialogDescription>
          The manager calls
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">/api/worker/info</code>
          {' '}
          on the worker to verify the bearer token before storing it.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor={baseUrlId}>Base URL</Label>
          <Input
            id={baseUrlId}
            placeholder="https://worker.example.com"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            autoComplete="off"
            autoFocus
            data-invalid={errors.baseUrl ? 'true' : undefined}
            aria-invalid={errors.baseUrl ? 'true' : undefined}
          />
          <FieldError message={errors.baseUrl} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={apiTokenId}>Bootstrap API token</Label>
          <div className="flex gap-2">
            <Input
              id={apiTokenId}
              placeholder="wtk_…"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.apiToken ? 'true' : undefined}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={showToken ? 'Hide API token' : 'Show API token'}
              onClick={() => setShowToken(v => !v)}
            >
              {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <FieldError message={errors.apiToken} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={displayNameId}>Display name</Label>
          <Input
            id={displayNameId}
            placeholder="prod-edge-1"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={80}
            aria-invalid={errors.displayName ? 'true' : undefined}
          />
          <FieldError message={errors.displayName} />
        </div>

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
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Registering…' : 'Register'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function mapServerError(err: unknown): FormErrors {
  if (err instanceof WorkerApiError) {
    switch (err.code) {
      case 'auth-failed':
        return { apiToken: 'Worker rejected this token (HTTP 401). Double-check the value.' }
      case 'already-registered':
        return {
          displayName: err.workerId
            ? `This worker is already registered as ${err.workerId}.`
            : 'This worker is already registered.',
        }
      case 'worker-unreachable':
        return { baseUrl: err.message || 'Could not reach this worker (HTTP 502).' }
      case 'invalid-worker-info':
        return { baseUrl: 'Reached the worker but its /info response was malformed.' }
      case 'invalid-body':
        return { form: 'The manager rejected the payload. Re-check each field.' }
      default:
        return { form: err.message || 'Registration failed. Try again.' }
    }
  }
  return { form: 'Registration failed. Try again.' }
}

function FieldError({ message }: { message?: string }) {
  if (!message)
    return null
  return <p role="alert" className="text-xs text-destructive">{message}</p>
}

function SuccessStep({
  worker,
  onClose,
  onGoToConfig,
}: {
  worker: SafeRegisteredWorker
  onClose: () => void
  onGoToConfig: () => void
}) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          <DialogTitle>Worker registered</DialogTitle>
        </div>
        <DialogDescription>
          The manager will keep its
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">lastSeenState</code>
          {' '}
          fresh on the next poll cycle.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 py-4 text-sm">
        <dt className="text-muted-foreground">Worker id</dt>
        <dd className="font-mono text-xs">{worker.id}</dd>
        <dt className="text-muted-foreground">Display name</dt>
        <dd>{worker.displayName}</dd>
        <dt className="text-muted-foreground">Base URL</dt>
        <dd className="break-all font-mono text-xs">{worker.baseUrl}</dd>
        <dt className="text-muted-foreground">State</dt>
        <dd>
          <Badge variant={stateBadgeVariant(worker.lastSeenState)}>
            {stateBadgeLabel(worker.lastSeenState)}
          </Badge>
        </dd>
      </dl>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onGoToConfig}>Go to worker config</Button>
      </DialogFooter>
    </>
  )
}
