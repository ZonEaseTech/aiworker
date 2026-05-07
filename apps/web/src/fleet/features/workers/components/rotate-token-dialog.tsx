import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { AlertTriangle, CheckCircle2, Copy, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { useRotateWorkerToken } from '../hooks'

/**
 * `token.rotate` 行级动作：先弹确认，旋转成功后展示新 deviceToken（一次性可见）。
 * 关闭对话框时立即从 React state 清掉，绝不写浏览器存储。
 */
export function RotateTokenDialog({
  worker,
  open,
  onOpenChange,
}: {
  worker: SafeRegisteredWorker
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [instanceKey, setInstanceKey] = useState(0)

  function handleOpenChange(next: boolean) {
    if (next)
      setInstanceKey(k => k + 1)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <RotateFlow
          key={instanceKey}
          worker={worker}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function RotateFlow({ worker, onClose }: { worker: SafeRegisteredWorker, onClose: () => void }) {
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rotate = useRotateWorkerToken()

  if (issued)
    return <SuccessStep worker={worker} deviceToken={issued} onClose={onClose} />

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rotate device token</DialogTitle>
        <DialogDescription>
          Issuing a new
          {' '}
          <code className="app-code">deviceToken</code>
          {' '}
          immediately invalidates the previous one. The worker must re-pair
          (or auto-reconnect with the new token) before it can talk to the
          fleet again.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 py-4 text-sm">
        <dt className="text-muted-foreground">Worker</dt>
        <dd className="font-medium">{worker.displayName}</dd>
        <dt className="text-muted-foreground">Worker id</dt>
        <dd className="font-mono text-xs">{worker.id}</dd>
      </dl>
      {error && (
        <p role="alert" className="app-alert-error text-xs">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={rotate.isPending}>
          Cancel
        </Button>
        <Button
          disabled={rotate.isPending}
          onClick={async () => {
            setError(null)
            try {
              const res = await rotate.mutateAsync(worker.id)
              setIssued(res.deviceToken)
            }
            catch (err) {
              setError(err instanceof WorkerApiError ? err.message : (err instanceof Error ? err.message : String(err)))
            }
          }}
        >
          <RefreshCw className="size-4" />
          {rotate.isPending ? 'Rotating…' : 'Rotate token'}
        </Button>
      </DialogFooter>
    </>
  )
}

function SuccessStep({
  worker,
  deviceToken,
  onClose,
}: {
  worker: SafeRegisteredWorker
  deviceToken: string
  onClose: () => void
}) {
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(deviceToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="size-5" />
          <DialogTitle>Token rotated</DialogTitle>
        </div>
        <DialogDescription>
          New deviceToken for
          {' '}
          <strong>{worker.displayName}</strong>
          {' '}
          shown
          {' '}
          <strong>once</strong>
          . Copy it before closing — the fleet retains only an encrypted copy.
        </DialogDescription>
      </DialogHeader>

      <div className="app-panel text-xs">
        <p className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
          <Lock className="size-3.5" />
          One-time deviceToken
        </p>
        <div className="flex items-center gap-2 rounded-sm bg-soft-stone px-2 py-1.5 font-mono text-micro">
          <code className="flex-1 break-all">
            {showToken ? deviceToken : deviceToken.replace(/./g, '•')}
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
            onClick={onCopy}
            aria-label="Copy token"
          >
            <Copy className="size-3" />
          </Button>
        </div>
        {copied && (
          <p role="status" className="mt-1 text-success">Copied.</p>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>This value is not shown again. Lost tokens require another rotation.</span>
        </p>
      </div>

      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  )
}
