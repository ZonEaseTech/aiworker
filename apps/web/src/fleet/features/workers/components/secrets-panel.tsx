import { Eye, EyeOff, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkerApiError } from '@/lib/api'
import { useDeleteWorkerSecret, usePutWorkerSecret, useWorkerSecrets } from '../hooks'

interface SecretsPanelProps {
  workerId: string
}

type DialogMode
  = | { kind: 'add' }
    | { kind: 'replace', key: string }
    | null

export function SecretsPanel({ workerId }: SecretsPanelProps) {
  const q = useWorkerSecrets(workerId)
  const put = usePutWorkerSecret(workerId)
  const del = useDeleteWorkerSecret(workerId)
  const [mode, setMode] = useState<DialogMode>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDelete() {
    if (!confirmDelete)
      return
    setError(null)
    try {
      await del.mutateAsync(confirmDelete)
      setConfirmDelete(null)
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : 'Delete failed.')
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Most secrets are managed through the Config editor. Use this panel for out-of-band rotation.
          </p>
        </div>
        <Button onClick={() => setMode({ kind: 'add' })}>
          <Plus className="size-4" />
          Add secret
        </Button>
      </header>

      {q.isLoading
        ? <Skeleton className="h-40" />
        : q.isError
          ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to load secrets:
                {' '}
                {q.error instanceof Error ? q.error.message : 'unknown error'}
              </p>
            )
          : (q.data?.keys.length === 0
              ? (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No secrets stored.
                  </p>
                )
              : (
                  <ul className="flex flex-col gap-2">
                    {q.data?.keys.map(key => (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-md border bg-card px-4 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <KeyRound className="size-4 text-muted-foreground" />
                          <code className="font-mono text-sm">{key}</code>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setMode({ kind: 'replace', key })}
                          >
                            Replace
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete secret ${key}`}
                            onClick={() => setConfirmDelete(key)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {mode && (
        <SecretFormDialog
          key={mode.kind === 'add' ? '__add' : `__replace_${mode.key}`}
          existingKeys={q.data?.keys ?? []}
          mode={mode}
          submitting={put.isPending}
          onClose={() => setMode(null)}
          onSubmit={async ({ key, value }) => {
            setError(null)
            try {
              await put.mutateAsync({ key, value })
              setMode(null)
            }
            catch (err) {
              setError(err instanceof WorkerApiError ? err.message : 'Save failed.')
            }
          }}
        />
      )}

      <Dialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete secret?</DialogTitle>
            <DialogDescription>
              This removes
              {' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{confirmDelete}</code>
              {' '}
              from the worker's vault. Anything referencing it in the config will fail to load until replaced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={runDelete} disabled={del.isPending}>
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SecretFormDialog({
  mode,
  existingKeys,
  submitting,
  onClose,
  onSubmit,
}: {
  mode: Exclude<DialogMode, null>
  existingKeys: string[]
  submitting: boolean
  onClose: () => void
  onSubmit: (body: { key: string, value: string }) => Promise<void>
}) {
  const keyId = useId()
  const valueId = useId()
  const [key, setKey] = useState(mode.kind === 'replace' ? mode.key : '')
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const trimmed = key.trim()
    if (trimmed.length === 0) {
      setErr('Key is required.')
      return
    }
    if (value.length === 0) {
      setErr('Value is required.')
      return
    }
    if (mode.kind === 'add' && existingKeys.includes(trimmed)) {
      setErr('A secret with this key already exists. Use Replace instead.')
      return
    }
    await onSubmit({ key: trimmed, value })
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {mode.kind === 'add' ? 'Add secret' : `Replace ${mode.key}`}
            </DialogTitle>
            <DialogDescription>
              Values are stored in the worker's encrypted vault and never sent back to the dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor={keyId}>Key</Label>
              <Input
                id={keyId}
                value={key}
                onChange={e => setKey(e.target.value)}
                disabled={mode.kind === 'replace'}
                autoFocus={mode.kind === 'add'}
                spellCheck={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={valueId}>Value</Label>
              <div className="flex gap-2">
                <Input
                  id={valueId}
                  type={showValue ? 'text' : 'password'}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={mode.kind === 'replace'}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showValue ? 'Hide value' : 'Show value'}
                  onClick={() => setShowValue(v => !v)}
                >
                  {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
