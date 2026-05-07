import type { PendingEnrollment } from '@zonease/aiworker-gateway-proto'
import { AlertTriangle, Check, Copy, Eye, EyeOff, Inbox, Lock, X } from 'lucide-react'
import { useState } from 'react'
import { WorkerApiError } from '@/fleet/api'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { useApproveEnrollment, usePendingEnrollments, useRejectEnrollment } from '../hooks'

interface ApprovedToken {
  workerId: string
  deviceToken: string
}

export function EnrollList() {
  const query = usePendingEnrollments()
  const approve = useApproveEnrollment()
  const reject = useRejectEnrollment()
  const [approved, setApproved] = useState<ApprovedToken | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  return (
    <div className="app-page">
      <div className="app-page-header">
        <h1 className="app-page-title">Pending enrollments</h1>
        <p className="app-page-copy">
          Workers awaiting OTP approval. Issued OTPs are
          {' '}
          <strong>not displayed</strong>
          {' '}
          here for shoulder-surfing safety — operators read the OTP from the
          worker&apos;s own logs / CLI before approving.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="app-alert-error">
          {actionError}
        </p>
      )}

      {query.isLoading
        ? <Skeleton className="h-32 w-full" />
        : (query.data ?? []).length === 0
            ? (
                <EmptyState />
              )
            : (
                <div className="overflow-hidden rounded-sm border border-hairline bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker id</TableHead>
                        <TableHead>Display name</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(query.data ?? []).map(entry => (
                        <PendingRow
                          key={entry.otp}
                          entry={entry}
                          busy={approve.isPending || reject.isPending}
                          onApprove={async () => {
                            setActionError(null)
                            try {
                              const res = await approve.mutateAsync(entry.otp)
                              setApproved(res)
                            }
                            catch (err) {
                              setActionError(err instanceof WorkerApiError ? err.message : (err instanceof Error ? err.message : String(err)))
                            }
                          }}
                          onReject={async () => {
                            setActionError(null)
                            try {
                              await reject.mutateAsync(entry.otp)
                            }
                            catch (err) {
                              setActionError(err instanceof WorkerApiError ? err.message : (err instanceof Error ? err.message : String(err)))
                            }
                          }}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

      {approved && (
        <ApprovedTokenDialog
          payload={approved}
          onClose={() => setApproved(null)}
        />
      )}
    </div>
  )
}

function PendingRow({
  entry,
  busy,
  onApprove,
  onReject,
}: {
  entry: PendingEnrollment
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const submittedDate = new Date(entry.submittedAt)
  const expiresDate = new Date(entry.expiresAt)
  const expiresIn = Math.max(0, expiresDate.getTime() - Date.now())
  const expiresMinutes = Math.floor(expiresIn / 60_000)
  const expiresSeconds = Math.floor((expiresIn % 60_000) / 1000)
  return (
    <TableRow>
      <TableCell>
        <code className="app-code">{entry.workerId}</code>
      </TableCell>
      <TableCell>{entry.displayName ?? '—'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {submittedDate.toLocaleString()}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <Badge variant={expiresIn === 0 ? 'destructive' : 'outline'}>
          {expiresIn === 0
            ? 'expired'
            : `${expiresMinutes}m ${expiresSeconds.toString().padStart(2, '0')}s`}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onReject}
          >
            <X className="size-3.5" />
            Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={onApprove}>
            <Check className="size-3.5" />
            Approve
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function EmptyState() {
  return (
    <div className="app-empty flex flex-col items-center justify-center gap-3">
      <Inbox className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-feature font-normal text-foreground">No pending enrollments</h2>
        <p className="text-sm text-muted-foreground">
          Workers started with
          {' '}
          <code className="app-code">aiworker serve</code>
          {' '}
          and
          {' '}
          <code className="app-code">AIWORKER_GATEWAY_URL</code>
          {' '}
          set will request an OTP here. Use
          {' '}
          <code className="app-code">aiworker enroll list</code>
          {' '}
          and
          {' '}
          <code className="app-code">aiworker enroll approve &lt;otp&gt;</code>
          {' '}
          to review and approve them.
        </p>
      </div>
    </div>
  )
}

function ApprovedTokenDialog({
  payload,
  onClose,
}: {
  payload: ApprovedToken
  onClose: () => void
}) {
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(payload.deviceToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    catch { /* clipboard unavailable */ }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enrollment approved</DialogTitle>
          <DialogDescription>
            Fleet has issued a fresh
            {' '}
            <code className="app-code">deviceToken</code>
            {' '}
            for
            {' '}
            <code className="app-code">{payload.workerId}</code>
            . Shown
            {' '}
            <strong>once</strong>
            ; copy it before closing.
          </DialogDescription>
        </DialogHeader>
        <div className="app-panel text-xs">
          <p className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
            <Lock className="size-3.5" />
            One-time deviceToken
          </p>
          <div className="flex items-center gap-2 rounded-sm bg-soft-stone px-2 py-1.5 font-mono text-micro">
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
              onClick={onCopy}
              aria-label="Copy token"
            >
              <Copy className="size-3" />
            </Button>
          </div>
          {copied && (
            <p role="status" className="mt-1 text-success">
              Copied.
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Worker has already received this token via its WS connection. Use
              this dialog only if you need to forward it elsewhere.
            </span>
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
