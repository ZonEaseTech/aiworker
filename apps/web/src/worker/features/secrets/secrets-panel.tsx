import { Eye, EyeOff, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { WorkerApiError } from '@/worker/api'
import { useDeleteWorkerSecret, usePutWorkerSecret, useWorkerSecrets } from '@/worker/lib/hooks'

/**
 * Secrets CRUD 面板（FEAT-035 §验收 3）。
 *
 * 不变量：
 * - 明文 value 仅在用户输入时活在 React state；提交后 setValue('') 清掉，
 *   再加 dialog `key={...}` 强制 unmount，state 不会泄漏到 list 视图。
 * - `WorkerApiError` 收敛 401/403/400 等到 banner，UI 不写死 status code。
 */
type DialogMode
  = | { kind: 'add' }
    | { kind: 'replace', key: string }
    | null

export function SecretsPanel() {
  const q = useWorkerSecrets()
  const put = usePutWorkerSecret()
  const del = useDeleteWorkerSecret()
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
      setError(err instanceof WorkerApiError ? err.message : '删除失败。')
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            常规 secret 通过配置编辑器管理；这里用于 out-of-band 轮换 / 应急处置。
          </p>
        </div>
        <Button onClick={() => setMode({ kind: 'add' })}>
          <Plus className="size-4" />
          添加 secret
        </Button>
      </header>

      {q.isLoading
        ? <Skeleton className="h-40" />
        : q.isError
          ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                加载 secrets 失败：
                {q.error instanceof Error ? q.error.message : '未知错误'}
              </p>
            )
          : (q.data?.keys.length === 0
              ? (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    尚无 secret。
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
                            替换
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
              setError(err instanceof WorkerApiError ? err.message : '保存失败。')
            }
          }}
        />
      )}

      <Dialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除该 secret？</DialogTitle>
            <DialogDescription>
              将从 worker vault 移除
              {' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{confirmDelete}</code>
              ；config 里引用它的字段在替换前会加载失败。
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
      setErr('key 必填。')
      return
    }
    if (value.length === 0) {
      setErr('value 必填。')
      return
    }
    if (mode.kind === 'add' && existingKeys.includes(trimmed)) {
      setErr('该 key 已存在；改用「替换」。')
      return
    }
    await onSubmit({ key: trimmed, value })
    // 提交完成后清掉明文，避免 dialog 关闭后还活在 React state 里。
    setValue('')
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {mode.kind === 'add' ? '添加 secret' : `替换 ${mode.key}`}
            </DialogTitle>
            <DialogDescription>
              value 加密存入 worker vault，之后绝不再回传 UI。
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
