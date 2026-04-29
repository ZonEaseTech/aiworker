import type { ChannelType } from '@zonease/aiworker-shared'
import type { CronAddInput, CronJobRow } from '@/worker/api'
import { Loader2, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { WorkerApiError } from '@/worker/api'
import { useAddCron, useCronJobs, useDeleteCron, usePatchCron } from '@/worker/lib/hooks'

const CHANNEL_TYPES: ChannelType[] = ['web', 'line', 'telegram', 'lark', 'whatsapp']

type DialogMode
  = | { kind: 'add' }
    | { kind: 'edit', job: CronJobRow }
    | null

/**
 * Cron CRUD（FEAT-035 §验收 5）。直连 worker REST `/api/worker/cron`。
 */
export function CronPanel() {
  const q = useCronJobs()
  const add = useAddCron()
  const patch = usePatchCron()
  const del = useDeleteCron()

  const [mode, setMode] = useState<DialogMode>(null)
  const [confirmDelete, setConfirmDelete] = useState<CronJobRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggleEnabled(job: CronJobRow) {
    setError(null)
    try {
      await patch.mutateAsync({ id: job.id, patch: { enabled: !job.enabled } })
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : '更新失败。')
    }
  }

  async function runDelete() {
    if (!confirmDelete)
      return
    setError(null)
    try {
      await del.mutateAsync(confirmDelete.id)
      setConfirmDelete(null)
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : '删除失败。')
    }
  }

  const jobs = q.data?.jobs ?? []

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cron</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按 cron 表达式定期触发的 prompt 任务。结果通过指定 channel 发出。
          </p>
        </div>
        <Button onClick={() => setMode({ kind: 'add' })}>
          <Plus className="size-4" />
          添加
        </Button>
      </header>

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
                加载 cron 列表失败：
                {q.error instanceof Error ? q.error.message : '未知错误'}
              </p>
            )
          : jobs.length === 0
            ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  尚无 cron。
                </p>
              )
            : (
                <ul className="flex flex-col gap-3">
                  {jobs.map(job => (
                    <li key={job.id} className="flex flex-col gap-2 rounded-md border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm">{job.expression}</code>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-micro uppercase text-muted-foreground">
                              {job.channel}
                            </span>
                            {!job.enabled && (
                              <span className="rounded bg-warning-soft px-1.5 py-0.5 text-micro font-bold text-warning">
                                disabled
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground" title={job.prompt}>
                            {job.prompt}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            chatId
                            <code className="ml-1 font-mono">{job.chatId}</code>
                            <span className="mx-2">·</span>
                            account
                            <code className="ml-1 font-mono">{job.accountId}</code>
                            <span className="mx-2">·</span>
                            next
                            <code className="ml-1 font-mono">{job.nextRunAt ?? '—'}</code>
                            <span className="mx-2">·</span>
                            last
                            <code className="ml-1 font-mono">{job.lastRunAt ?? '—'}</code>
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={job.enabled ? '暂停' : '启用'}
                            onClick={() => void toggleEnabled(job)}
                            disabled={patch.isPending}
                          >
                            {job.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="编辑"
                            onClick={() => setMode({ kind: 'edit', job })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="删除"
                            onClick={() => setConfirmDelete(job)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

      {mode && (
        <CronFormDialog
          key={mode.kind === 'add' ? '__add' : `__edit_${mode.job.id}`}
          mode={mode}
          submitting={add.isPending || patch.isPending}
          onClose={() => setMode(null)}
          onSubmit={async (input) => {
            setError(null)
            try {
              if (mode.kind === 'add')
                await add.mutateAsync(input)
              else
                await patch.mutateAsync({ id: mode.job.id, patch: input })
              setMode(null)
            }
            catch (err) {
              setError(err instanceof WorkerApiError ? err.message : '保存失败。')
            }
          }}
        />
      )}
      {/* CronFormDialog 的 onSubmit 把 add/patch 都收成 CronAddInput——add 时走全字段，
          patch 时走子集（同 shape 兼容 CronPatchInput）。 */}

      <Dialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除该 cron？</DialogTitle>
            <DialogDescription>
              将立即停止
              {' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{confirmDelete?.id}</code>
              {' '}
              的调度。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={runDelete} disabled={del.isPending}>
              {del.isPending ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CronFormState {
  expression: string
  prompt: string
  channel: ChannelType
  chatId: string
  accountId: string
  enabled: boolean
}

function CronFormDialog({
  mode,
  submitting,
  onClose,
  onSubmit,
}: {
  mode: Exclude<DialogMode, null>
  submitting: boolean
  onClose: () => void
  /**
   * 提交 callback 永远以「全字段」CronAddInput 形态传出，patch 流由父组件
   * 在调用 mutate 时按 CronPatchInput shape 兼容（前者所有必填字段都在后者
   * 可选范围内）。这样表单本身不必区分 add / patch 的字段可选性。
   */
  onSubmit: (body: CronAddInput) => Promise<void>
}) {
  const exprId = useId()
  const promptId = useId()
  const chatId = useId()
  const accountId = useId()

  const initial = useMemo<CronFormState>(() => {
    if (mode.kind === 'edit') {
      return {
        expression: mode.job.expression,
        prompt: mode.job.prompt,
        channel: mode.job.channel,
        chatId: mode.job.chatId,
        accountId: mode.job.accountId,
        enabled: mode.job.enabled,
      }
    }
    return {
      expression: '0 9 * * *',
      prompt: '',
      channel: 'web',
      chatId: '',
      accountId: '',
      enabled: true,
    }
  }, [mode])

  const [form, setForm] = useState<CronFormState>(initial)
  const [err, setErr] = useState<string | null>(null)

  function patch<K extends keyof CronFormState>(key: K, value: CronFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.expression.trim() || !form.prompt.trim() || !form.chatId.trim()) {
      setErr('expression / prompt / chatId 必填。')
      return
    }
    const body: CronAddInput = {
      expression: form.expression.trim(),
      prompt: form.prompt.trim(),
      channel: form.channel,
      chatId: form.chatId.trim(),
      enabled: form.enabled,
    }
    if (form.accountId.trim().length > 0)
      body.accountId = form.accountId.trim()
    await onSubmit(body)
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{mode.kind === 'add' ? '添加 cron' : `编辑 ${mode.job.id}`}</DialogTitle>
            <DialogDescription>
              cron 表达式遵循 5 字段标准（分 时 日 月 周）。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor={exprId}>Expression</Label>
              <Input id={exprId} value={form.expression} onChange={e => patch('expression', e.target.value)} className="font-mono" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={promptId}>Prompt</Label>
              <textarea
                id={promptId}
                className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                value={form.prompt}
                onChange={e => patch('prompt', e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Channel</Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.channel}
                  onChange={e => patch('channel', e.target.value as ChannelType)}
                >
                  {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={chatId}>chatId</Label>
                <Input id={chatId} value={form.chatId} onChange={e => patch('chatId', e.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={accountId}>accountId（留空 = `sys:cron`）</Label>
                <Input id={accountId} value={form.accountId} onChange={e => patch('accountId', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => patch('enabled', e.target.checked)}
                />
                启用
              </label>
            </div>
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
