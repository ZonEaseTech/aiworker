import type { WorkerConfig } from '@zonease/aiworker-shared'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { WorkerApiError } from '@/worker/api'
import { usePutWorkerConfig, useWorkerConfig, useWorkerInfo } from '@/worker/lib/hooks'
import { BrainSection } from './brain-section'
import { ChannelsSection } from './channels-section'
import { ExecutorSection } from './executor-section'

/**
 * worker 自管 config 编辑器。直连 `GET/PUT /api/worker/config` + `If-Match`
 * 乐观锁。与 fleet 视角的同名组件结构等价；transport 不同。
 */
export function ConfigEditor() {
  const cfg = useWorkerConfig()
  const info = useWorkerInfo()
  // Bumped on operator-initiated reload (e.g. from a 409 banner)。
  const [reloadToken, setReloadToken] = useState(0)

  if (cfg.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (cfg.isError || !cfg.data) {
    const msg = cfg.error instanceof Error ? cfg.error.message : '未知错误'
    return (
      <div className="app-alert-error">
        加载 worker config 失败：
        {' '}
        {msg}
        {' '}
        <Button type="button" variant="outline" size="sm" onClick={() => void cfg.refetch()}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <ConfigForm
      key={reloadToken}
      initial={cfg.data.config}
      initialVersion={cfg.data.version}
      info={info.data}
      onReload={() => {
        setReloadToken(n => n + 1)
        void cfg.refetch()
      }}
    />
  )
}

function ConfigForm({
  initial,
  initialVersion,
  info,
  onReload,
}: {
  initial: WorkerConfig
  initialVersion: number
  info: ReturnType<typeof useWorkerInfo>['data']
  onReload: () => void
}) {
  const [draft, setDraft] = useState<WorkerConfig>(initial)
  const [version, setVersion] = useState(initialVersion)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ expected?: number, actual?: number } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const put = usePutWorkerConfig()

  function patchBrain(patch: Partial<Pick<WorkerConfig, 'brains' | 'brainWriteTarget' | 'brainRetrieval'>>) {
    setDraft(d => ({ ...d, ...patch }))
  }

  function setExecutor(next: WorkerConfig['executor']) {
    setDraft(d => ({ ...d, executor: next }))
  }

  function setChannels(next: WorkerConfig['channels']) {
    setDraft(d => ({ ...d, channels: next }))
  }

  function setEvolution(next: WorkerConfig['evolution']) {
    setDraft(d => ({ ...d, evolution: next }))
  }

  function validate(): string | null {
    if (draft.brains.length > 0 && draft.brainWriteTarget.length === 0)
      return '配置了 brain source 后必须选 write target，或者删光所有 brain。'
    if (draft.brains.length > 0 && !draft.brains.some(b => b.id === draft.brainWriteTarget))
      return `brainWriteTarget "${draft.brainWriteTarget}" 不在已配置的 brain id 列表里。`
    const ids = new Set<string>()
    for (const b of draft.brains) {
      if (b.id.length === 0)
        return '每个 brain source 必须有 id。'
      if (ids.has(b.id))
        return `重复的 brain id：${b.id}`
      ids.add(b.id)
    }
    return null
  }

  async function onSave() {
    setError(null)
    setConflict(null)
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }
    try {
      const res = await put.mutateAsync({ config: draft, ifMatchVersion: version })
      setFlash(
        res.runtimeReload === 'ok'
          ? `已保存（version ${res.version}）。`
          : `已保存（version ${res.version}），但 runtime reload 失败——重启 worker 才能让新 config 真正生效。`,
      )
      setDraft(res.config)
      setVersion(res.version)
    }
    catch (err) {
      if (err instanceof WorkerApiError && err.code === 'version-conflict') {
        setConflict({ expected: err.expectedVersion, actual: err.actualVersion })
        return
      }
      if (err instanceof WorkerApiError && err.code === 'invalid-config') {
        setError(`worker 拒绝了 config：${err.message}`)
        return
      }
      setError(err instanceof Error ? err.message : '保存失败。')
    }
  }

  return (
    <form
      className="app-page pb-24"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave()
      }}
    >
      <div className="app-page-header">
        <h1 className="app-page-title">Configuration</h1>
        <p className="app-page-copy">
          Version
          {' '}
          <span className="font-mono">{version}</span>
          。Secret 字段渲染为占位，留空保留旧值。
        </p>
      </div>

      {conflict && (
        <div
          role="alert"
          className="app-alert-warning flex items-start gap-3"
        >
          <AlertTriangle className="mt-0.5 size-4 text-warning" />
          <div className="flex-1">
            <p className="font-medium">Version 冲突</p>
            <p className="text-muted-foreground">
              你基于 version
              {' '}
              <code className="font-mono">{conflict.expected ?? version}</code>
              {' '}
              做了改动，但当前 stored version 是
              {' '}
              <code className="font-mono">{conflict.actual ?? '?'}</code>
              。期间另一方已经保存了新版本。
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            Reload 重新编辑
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="app-alert-error">
          {error}
        </p>
      )}

      {flash && (
        <p role="status" className="app-alert-success">
          {flash}
        </p>
      )}

      <BrainSection
        brains={draft.brains}
        brainWriteTarget={draft.brainWriteTarget}
        brainRetrieval={draft.brainRetrieval}
        onChange={patchBrain}
      />

      <ExecutorSection executor={draft.executor} onChange={setExecutor} />

      <ChannelsSection channels={draft.channels} info={info} onChange={setChannels} />

      <section className="app-panel flex flex-col gap-4">
        <h2 className="text-feature font-normal">Evolution (L3)</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.evolution.enabled}
            onChange={e => setEvolution({ ...draft.evolution, enabled: e.target.checked })}
          />
          启用 evolution observer
        </label>
        <div className="flex flex-col gap-1.5 max-w-[240px]">
          <label className="text-sm font-medium">Observation 保留天数</label>
          <input
            type="number"
            min={0}
            className="app-field h-10"
            value={draft.evolution.observationRetentionDays}
            onChange={e => setEvolution({
              ...draft.evolution,
              observationRetentionDays: Number.parseInt(e.target.value, 10) || 0,
            })}
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-background/95 px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            保存使用
            {' '}
            <code className="font-mono">{`If-Match: ${version}`}</code>
            ——若 stored version 已前移则返 409。
          </p>
          <Button type="submit" disabled={put.isPending}>
            {put.isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Save className="size-4" />}
            {put.isPending ? '保存中…' : '保存配置'}
          </Button>
        </div>
      </div>
    </form>
  )
}
