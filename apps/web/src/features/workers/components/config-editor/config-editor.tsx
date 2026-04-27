import type { WorkerConfig } from '@zonease/aiworker-shared'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkerApiError } from '@/lib/api'
import { usePutWorkerConfig, useWorkerConfig, useWorkerInfo } from '../../hooks'
import { BrainSection } from './brain-section'
import { ChannelsSection } from './channels-section'
import { ExecutorSection } from './executor-section'

interface ConfigEditorProps {
  workerId: string
}

export function ConfigEditor({ workerId }: ConfigEditorProps) {
  const cfg = useWorkerConfig(workerId)
  const info = useWorkerInfo(workerId)
  // Bumped on operator-initiated reload (e.g. from a 409 banner). Keying the
  // form on this forces a full reset; ordinary save-success flows reuse the
  // same instance so the flash message and cursor position stick around.
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
    const msg = cfg.error instanceof Error ? cfg.error.message : 'unknown error'
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load worker config:
        {' '}
        {msg}
        {' '}
        <Button type="button" variant="outline" size="sm" onClick={() => void cfg.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <ConfigForm
      key={reloadToken}
      workerId={workerId}
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
  workerId,
  initial,
  initialVersion,
  info,
  onReload,
}: {
  workerId: string
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
  const put = usePutWorkerConfig(workerId)

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
      return 'Pick a brain write target or remove all brain sources.'
    if (draft.brains.length > 0 && !draft.brains.some(b => b.id === draft.brainWriteTarget))
      return `brainWriteTarget "${draft.brainWriteTarget}" is not one of the configured brain ids.`
    const ids = new Set<string>()
    for (const b of draft.brains) {
      if (b.id.length === 0)
        return 'Every brain source needs a non-empty id.'
      if (ids.has(b.id))
        return `Duplicate brain id: ${b.id}`
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
          ? `Saved (version ${res.version}).`
          : `Saved (version ${res.version}) — but worker runtime reload failed. The config is persisted; restart the worker to apply.`,
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
        setError(`The worker rejected the config: ${err.message}`)
        return
      }
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  return (
    <form
      className="flex flex-col gap-6 pb-24"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave()
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Version
          {' '}
          <span className="font-mono">{version}</span>
          . Secret fields are redacted — leave them empty to keep the stored value.
        </p>
      </div>

      {conflict && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-medium">Version conflict</p>
            <p className="text-muted-foreground">
              Your edits were based on version
              {' '}
              <code className="font-mono">{conflict.expected ?? version}</code>
              , but the current stored version is
              {' '}
              <code className="font-mono">{conflict.actual ?? '?'}</code>
              . Someone else saved a new config while you were editing.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            Reload and re-edit
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {flash && (
        <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          {flash}
        </p>
      )}

      <BrainSection
        brains={draft.brains}
        brainWriteTarget={draft.brainWriteTarget}
        brainRetrieval={draft.brainRetrieval}
        onChange={patchBrain}
      />

      <ExecutorSection workerId={workerId} executor={draft.executor} onChange={setExecutor} />

      <ChannelsSection channels={draft.channels} info={info} onChange={setChannels} />

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Evolution (L3)</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.evolution.enabled}
            onChange={e => setEvolution({ ...draft.evolution, enabled: e.target.checked })}
          />
          Enable evolution observer
        </label>
        <div className="flex flex-col gap-1.5 max-w-[240px]">
          <label className="text-sm font-medium">Observation retention (days)</label>
          <input
            type="number"
            min={0}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={draft.evolution.observationRetentionDays}
            onChange={e => setEvolution({
              ...draft.evolution,
              observationRetentionDays: Number.parseInt(e.target.value, 10) || 0,
            })}
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Saving uses
            {' '}
            <code className="font-mono">{`If-Match: ${version}`}</code>
            {' '}
            — the worker returns 409 if the stored version has moved on.
          </p>
          <Button type="submit" disabled={put.isPending}>
            {put.isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Save className="size-4" />}
            {put.isPending ? 'Saving…' : 'Save configuration'}
          </Button>
        </div>
      </div>
    </form>
  )
}
