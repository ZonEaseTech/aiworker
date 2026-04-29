import type { ApprovalRow } from '@/worker/api'
import { Check, Clock, Loader2, ShieldAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { WorkerApiError } from '@/worker/api'
import { useApprovals, useGrantApproval } from '@/worker/lib/hooks'

/**
 * Per-tool approval 队列（FEAT-035 §验收 6）。
 *
 * Polling 5 秒——`useApprovals` 的 refetchInterval 已设。pending 数 > 0 时
 * 顶部显示 prominent banner，方便 operator 一眼发现，沿用 CLI `aiworker
 * approvals` 的格式。
 */
export function ApprovalsPanel() {
  const q = useApprovals()
  const grant = useGrantApproval()
  const [error, setError] = useState<string | null>(null)
  const approvals = useMemo<ApprovalRow[]>(() => q.data?.approvals ?? [], [q.data])

  async function decide(row: ApprovalRow, decision: 'allow' | 'deny') {
    setError(null)
    try {
      await grant.mutateAsync({ taskId: row.taskId, toolCallId: row.toolCallId, decision })
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : '提交失败。')
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          orchestrator 命中 toolPolicy `ask` 规则时挂起的工具调用。批准前 60s 内未处理视同 deny。
        </p>
      </header>

      {approvals.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 text-warning" />
          <div className="flex-1">
            <p className="font-bold">
              {approvals.length}
              {' '}
              个 pending approval
            </p>
            <p className="text-xs text-muted-foreground">超时（默认 60s）未处理 = deny。</p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {q.isLoading
        ? <Skeleton className="h-40" />
        : q.isError
          ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                加载失败：
                {q.error instanceof Error ? q.error.message : '未知错误'}
              </p>
            )
          : approvals.length === 0
            ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  当前没有 pending approval。
                </p>
              )
            : (
                <ul className="flex flex-col gap-3">
                  {approvals.map(row => (
                    <li
                      key={`${row.taskId}:${row.toolCallId}`}
                      className="flex flex-col gap-3 rounded-md border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm">{row.toolName}</code>
                            <ExpiresIn at={row.expiresAt} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            task
                            <code className="ml-1 font-mono">{row.taskId}</code>
                            <span className="mx-2">·</span>
                            tool call
                            <code className="ml-1 font-mono">{row.toolCallId}</code>
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void decide(row, 'deny')}
                            disabled={grant.isPending}
                          >
                            <X className="size-4" />
                            Deny
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void decide(row, 'allow')}
                            disabled={grant.isPending}
                          >
                            {grant.isPending
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Check className="size-4" />}
                            Allow
                          </Button>
                        </div>
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">查看 params</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-foreground">
                          {JSON.stringify(row.params, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
    </div>
  )
}

function ExpiresIn({ at }: { at: number }) {
  const remainingMs = at - Date.now()
  if (remainingMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-micro text-destructive">
        <Clock className="size-3" />
        expired
      </span>
    )
  }
  const seconds = Math.max(0, Math.round(remainingMs / 1000))
  return (
    <span className="inline-flex items-center gap-1 text-micro text-muted-foreground">
      <Clock className="size-3" />
      剩
      {seconds}
      s
    </span>
  )
}
