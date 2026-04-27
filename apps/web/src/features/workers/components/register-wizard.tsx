import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { useNavigate } from '@tanstack/react-router'
import { generateWorkerApiToken, WORKER_API_TOKEN_PREFIX } from '@zonease/aiworker-shared'
import { CheckCircle2, Copy, Eye, EyeOff, Info, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WorkerApiError } from '@/lib/api'
import { useRegisterWorker } from '../hooks'
import { stateBadgeLabel, stateBadgeVariant } from '../utils'

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
  const baseUrlHelpId = useId()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const register = useRegisterWorker()

  function onGenerateToken() {
    const token = generateWorkerApiToken()
    setApiToken(token)
    setGeneratedToken(token)
    setShowToken(true)
    setCopied(false)
    setErrors(prev => ({ ...prev, apiToken: undefined }))
  }

  async function onCopyToken() {
    if (!generatedToken)
      return
    try {
      await navigator.clipboard.writeText(generatedToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    catch {
      // Clipboard write may fail in insecure contexts; operator can still
      // select the field value by hand.
    }
  }

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
            placeholder="http://aiworker-worker:9217"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            autoComplete="off"
            autoFocus
            data-invalid={errors.baseUrl ? 'true' : undefined}
            aria-invalid={errors.baseUrl ? 'true' : undefined}
            aria-describedby={baseUrlHelpId}
          />
          <p id={baseUrlHelpId} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Worker's HTTP root — scheme + host/port, no trailing path. Typical shapes:
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">http://aiworker-worker:9217</code>
              (same compose),
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">https://worker-1.example.com</code>
              (reverse proxy),
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">http://203.0.113.10:9217</code>
              (direct port).
            </span>
          </p>
          <FieldError message={errors.baseUrl} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={apiTokenId}>Bootstrap API token</Label>
          <div className="flex gap-2">
            <Input
              id={apiTokenId}
              placeholder="wtk_…"
              value={apiToken}
              onChange={(e) => {
                setApiToken(e.target.value)
                // Any manual edit invalidates the "this value was just minted
                // by the dashboard" claim — hide the helper block.
                if (generatedToken && e.target.value !== generatedToken)
                  setGeneratedToken(null)
              }}
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
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateToken}
              aria-label="Generate API token"
            >
              <Sparkles className="size-4" />
              Generate
            </Button>
          </div>
          <FieldError message={errors.apiToken} />
          {generatedToken && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">
                Token minted in this browser.
              </p>
              <p className="mb-2 text-muted-foreground">
                Set it as an env var on the worker container before first
                boot — only honoured on a fresh worker (no
                {' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">worker_identity</code>
                {' '}
                row yet):
              </p>
              <div className="flex items-center gap-2 rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px]">
                <code className="flex-1 break-all">
                  AIWORKER_FORCE_TOKEN=
                  {generatedToken}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={onCopyToken}
                  aria-label="Copy env assignment"
                >
                  <Copy className="size-3" />
                </Button>
              </div>
              {copied && (
                <p role="status" className="mt-1 text-emerald-600 dark:text-emerald-400">
                  Copied.
                </p>
              )}
              <p className="mt-2 text-muted-foreground">
                If the worker already minted its own token on a previous
                boot, this env var is ignored and registration will fail —
                use the token from its startup logs instead.
              </p>
            </div>
          )}
          <AuthMountHint />
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

/**
 * FEAT-022 reminder: the bearer token lets the manager talk to the worker,
 * but agentic executors (claude-code / codex / acp gemini / acp qwen /
 * cursor) also need CLI auth on the worker side. Surface a lightweight,
 * collapsed-by-default pointer so operators who *don't* need agentic auth
 * aren't distracted. Linked doc already enumerates the two supported
 * recipes (host mount / docker exec login).
 */
function AuthMountHint() {
  return (
    <details className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-medium text-muted-foreground">
        Using an agentic engine? You'll also need to seed CLI auth on the worker.
      </summary>
      <p className="mt-2 text-muted-foreground">
        The bearer token above only authorises dashboard → worker calls.
        {' '}
        claude-code / codex / gemini / qwen / cursor each need their own
        login state (`~/.claude.json`, `~/.codex/auth.json`, etc.) inside
        the worker container. Two recipes:
      </p>
      <ul className="mt-1.5 ml-4 list-disc text-muted-foreground">
        <li>
          <strong>Mount the host&apos;s auth dir</strong>
          {' '}
          into the container
          (read-only), or
        </li>
        <li>
          <strong>docker exec &lt;worker&gt; &lt;cli&gt; login</strong>
          {' '}
          once
          inside a fresh container.
        </li>
      </ul>
      <p className="mt-2 text-muted-foreground">
        Full walkthrough:
        {' '}
        <a
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          href="/docs/executor-engines.md#auth-recipes"
          target="_blank"
          rel="noreferrer"
        >
          docs/executor-engines.md#auth-recipes
        </a>
        {' '}
        · starter compose:
        {' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          ops/compose/docker-compose.worker.example.yml
        </code>
      </p>
    </details>
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
