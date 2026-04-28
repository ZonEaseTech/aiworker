import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { Power } from 'lucide-react'
import { useState } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { useStopWorker } from '../hooks'

/**
 * `workers.stop` 行级动作：向 worker 发停机指令，**不**从 fleet.db 摘除。
 * 路由是 operator-to-node，worker offline 时直接禁用按钮（菜单层亦已 disable）。
 */
export function StopWorkerDialog({
  worker,
  open,
  onOpenChange,
}: {
  worker: SafeRegisteredWorker
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const stop = useStopWorker()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stop worker runtime</DialogTitle>
          <DialogDescription>
            Sends
            {' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">workers.stop</code>
            {' '}
            to
            {' '}
            <strong>{worker.displayName}</strong>
            . The fleet.db row is kept so the worker can reconnect later. Use
            {' '}
            <em>Remove from fleet</em>
            {' '}
            if you also want to invalidate its deviceToken.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="my-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={stop.isPending}>
            Cancel
          </Button>
          <Button
            disabled={stop.isPending}
            onClick={async () => {
              setError(null)
              try {
                await stop.mutateAsync(worker.id)
                onOpenChange(false)
              }
              catch (err) {
                setError(err instanceof WorkerApiError ? err.message : (err instanceof Error ? err.message : String(err)))
              }
            }}
          >
            <Power className="size-4" />
            {stop.isPending ? 'Stopping…' : 'Stop runtime'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
