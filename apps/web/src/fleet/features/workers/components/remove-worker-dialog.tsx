import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useRemoveWorker } from '../hooks'

/**
 * `workers.remove` 行级动作：把 worker 从 fleet.db 摘除（存量 deviceToken 立刻
 * 作废）。需要 operator 输入 displayName 完整字符串作为「我确实想删」的二次
 * 确认——这条记录删除后不可恢复，与 git revert 一类的快速回滚不同。
 */
export function RemoveWorkerDialog({
  worker,
  open,
  onOpenChange,
}: {
  worker: SafeRegisteredWorker
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const remove = useRemoveWorker()
  const expected = worker.displayName

  function reset() {
    setConfirmation('')
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next)
          reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove worker</DialogTitle>
          <DialogDescription>
            Removing
            {' '}
            <strong>{worker.displayName}</strong>
            {' '}
            invalidates its
            {' '}
            <code className="app-code">deviceToken</code>
            {' '}
            and deletes its fleet.db row. The worker container itself is not
            stopped — use the
            {' '}
            <em>Stop runtime</em>
            {' '}
            action first if you also want to halt it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-4 text-sm">
          <Label htmlFor="remove-confirm">
            Type
            {' '}
            <code className="app-code">{expected}</code>
            {' '}
            to confirm
          </Label>
          <Input
            id="remove-confirm"
            value={confirmation}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={e => setConfirmation(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="app-alert-error text-xs">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || confirmation !== expected}
            onClick={async () => {
              setError(null)
              try {
                await remove.mutateAsync(worker.id)
                onOpenChange(false)
              }
              catch (err) {
                setError(err instanceof WorkerApiError ? err.message : (err instanceof Error ? err.message : String(err)))
              }
            }}
          >
            <Trash2 className="size-4" />
            {remove.isPending ? 'Removing…' : 'Remove worker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
