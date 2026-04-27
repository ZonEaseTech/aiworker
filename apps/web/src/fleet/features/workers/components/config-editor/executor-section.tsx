import type {
  CmdOverrides,
  EngineAvailabilityStatus,
  EngineKind,
  ExecutorProfile,
  PermissionPolicy,
} from '@zonease/aiworker-shared'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useRefreshWorkerEngines, useWorkerEngines } from '../../hooks'
import { buildAvailabilityMap, resolveEngineStatus } from './engine-availability'
import { ExecutorForm } from './executor-form'
import { defaultProfileFor, ENGINE_CATALOG, listEngines, listVariantsFor } from './executor-variants'

interface ExecutorSectionProps {
  executor: ExecutorProfile
  onChange: (next: ExecutorProfile) => void
  /**
   * 当挂在 ConfigEditor 下传入 workerId 时，组件会调用 `GET /engines` 渲染
   * 每个 engine 的可达性徽标，并为当前 engine 是 not-installed 的情况提供安装
   * 指引；测试场景（不关心徽标）可省略。
   */
  workerId?: string
}

const STATUS_LABEL: Record<EngineAvailabilityStatus, string> = {
  'ready': 'ready',
  'login-required': 'login required',
  'not-found': 'not installed',
}

const STATUS_DOT_CLASS: Record<EngineAvailabilityStatus, string> = {
  'ready': 'bg-emerald-500',
  'login-required': 'bg-amber-500',
  'not-found': 'bg-muted-foreground/40',
}

const STATUS_TEXT_CLASS: Record<EngineAvailabilityStatus, string> = {
  'ready': 'text-emerald-700 dark:text-emerald-400',
  'login-required': 'text-amber-700 dark:text-amber-400',
  'not-found': 'text-muted-foreground',
}

/**
 * 可达性徽标：2-color dot + 文字标签。测试以 `data-testid` 锁定。
 */
export function AvailabilityBadge({
  status,
  label,
  testId,
}: {
  status: EngineAvailabilityStatus | undefined
  label?: string
  testId?: string
}) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid={testId}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
        unknown
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${STATUS_TEXT_CLASS[status]}`}
      data-testid={testId}
      data-status={status}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Two-step engine × variant picker. Variant body fields render via the
 * lean `<ExecutorForm>` schema mapper. CmdOverrides + per-request fields
 * (modelId / reasoningId / permissionPolicy) live in their own collapsed
 * "Advanced" panel so the common case stays one screen of inputs.
 *
 * FEAT-018 additions: each engine (and each acp agent) carries a reachability
 * badge driven by `GET /api/worker/engines`. Engines whose CLI isn't installed
 * stay selectable — the variant panel then renders an install callout linking
 * to `docs/executor-engines.md`.
 *
 * Save semantics: the parent passes the full `ExecutorProfile`. The variant
 * body is NEVER sent — only `{ engine, variant, overrides? }`. Default
 * profile fields live server-side in `default-profiles.ts` and merge in via
 * `resolveVariant` at executor build time.
 */
export function ExecutorSection({ executor, onChange, workerId }: ExecutorSectionProps) {
  const engineMeta = ENGINE_CATALOG[executor.engine]
  const variantMeta = engineMeta.variants[executor.variant]

  const [advancedOpen, setAdvancedOpen] = useState(false)

  const enginesQuery = useWorkerEngines(workerId)
  const availability = buildAvailabilityMap(enginesQuery.data?.engines)
  const refreshEngines = useRefreshWorkerEngines(workerId ?? '')
  const [refreshing, setRefreshing] = useState(false)

  async function onRefresh() {
    if (!workerId)
      return
    setRefreshing(true)
    try {
      await refreshEngines()
    }
    finally {
      setRefreshing(false)
    }
  }

  function switchEngine(nextEngine: EngineKind) {
    if (nextEngine === executor.engine)
      return
    const variants = listVariantsFor(nextEngine)
    const keepVariant = variants.includes(executor.variant) ? executor.variant : undefined
    if (keepVariant)
      onChange({ engine: nextEngine, variant: keepVariant })
    else
      onChange(defaultProfileFor(nextEngine))
  }

  function switchVariant(nextVariant: string) {
    if (nextVariant === executor.variant)
      return
    // Drop overrides on variant switch — variant bodies are heterogeneous, so
    // re-using last variant's overrides almost always produces a broken merge.
    onChange({ engine: executor.engine, variant: nextVariant })
  }

  function setOverrides(nextOverrides: Record<string, unknown> | undefined) {
    if (!nextOverrides || Object.keys(nextOverrides).length === 0) {
      const { overrides: _drop, ...rest } = executor
      void _drop
      onChange(rest as ExecutorProfile)
      return
    }
    onChange({ ...executor, overrides: nextOverrides as ExecutorProfile['overrides'] })
  }

  function patchVariantBody(next: Record<string, unknown>) {
    const cmd = (executor.overrides as { cmd?: CmdOverrides } | undefined)?.cmd
    const merged: Record<string, unknown> = { ...next }
    if (cmd && Object.keys(cmd).length > 0)
      merged.cmd = cmd
    setOverrides(merged)
  }

  function patchCmd(nextCmd: CmdOverrides | undefined) {
    const overrides = (executor.overrides ?? {}) as Record<string, unknown>
    const { cmd: _drop, ...rest } = overrides
    void _drop
    if (!nextCmd || Object.keys(nextCmd).length === 0) {
      setOverrides(rest)
      return
    }
    setOverrides({ ...rest, cmd: nextCmd })
  }

  function patchTopLevel(next: Pick<ExecutorProfile, 'modelId' | 'reasoningId' | 'permissionPolicy'>) {
    const out = { ...executor }
    if (next.modelId === undefined || next.modelId === '')
      delete out.modelId
    else out.modelId = next.modelId
    if (next.reasoningId === undefined || next.reasoningId === '')
      delete out.reasoningId
    else out.reasoningId = next.reasoningId
    if (next.permissionPolicy === undefined)
      delete out.permissionPolicy
    else out.permissionPolicy = next.permissionPolicy
    onChange(out)
  }

  // Body fields that aren't `cmd`. The variant form only edits these — the
  // `cmd` slot has its own dedicated panel.
  const overridesObj = (executor.overrides ?? {}) as Record<string, unknown>
  const { cmd: cmdOverride, ...bodyOverrides } = overridesObj as { cmd?: CmdOverrides } & Record<string, unknown>

  const selectedEngineStatus = resolveEngineStatus(availability, executor.engine)
  const currentVariantAvailability = executor.engine === 'acp'
    ? availability.get(`acp:${executor.variant}`)
    : availability.get(executor.engine)

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Executor</h2>
          <p className="text-sm text-muted-foreground">
            Choose an engine, pick a variant preset, then override only the fields you need.
          </p>
        </div>
        {workerId && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || enginesQuery.isFetching}
            aria-label="Refresh engine availability"
            data-testid="refresh-engines-btn"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </header>

      {workerId && availability.size > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          {listEngines().map((eng) => {
            const status = resolveEngineStatus(availability, eng)
            return (
              <span
                key={eng}
                className="inline-flex items-center gap-2 rounded border bg-background px-2 py-0.5"
                data-testid={`engine-availability-${eng}`}
              >
                <span className="font-medium">{ENGINE_CATALOG[eng].label}</span>
                <AvailabilityBadge status={status} testId={`engine-availability-badge-${eng}`} />
              </span>
            )
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="executor-engine">Engine</Label>
            <AvailabilityBadge
              status={selectedEngineStatus}
              testId="engine-selected-badge"
            />
          </div>
          <select
            id="executor-engine"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={executor.engine}
            onChange={e => switchEngine(e.target.value as EngineKind)}
          >
            {listEngines().map((eng) => {
              const status = resolveEngineStatus(availability, eng)
              const suffix = status ? ` — ${STATUS_LABEL[status]}` : ''
              return (
                <option key={eng} value={eng}>
                  {ENGINE_CATALOG[eng].label}
                  {suffix}
                </option>
              )
            })}
          </select>
          <p className="text-xs text-muted-foreground">{engineMeta.description}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="executor-variant">Variant</Label>
            {executor.engine === 'acp' && (
              <AvailabilityBadge
                status={currentVariantAvailability?.status}
                testId="variant-selected-badge"
              />
            )}
          </div>
          <select
            id="executor-variant"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={executor.variant}
            onChange={e => switchVariant(e.target.value)}
          >
            {listVariantsFor(executor.engine).map((v) => {
              const agentStatus = executor.engine === 'acp'
                ? availability.get(`acp:${v}`)?.status
                : undefined
              const suffix = agentStatus ? ` — ${STATUS_LABEL[agentStatus]}` : ''
              return (
                <option key={v} value={v}>
                  {engineMeta.variants[v]!.label}
                  {suffix}
                </option>
              )
            })}
          </select>
          {variantMeta?.description && (
            <p className="text-xs text-muted-foreground">{variantMeta.description}</p>
          )}
        </div>
      </div>

      {selectedEngineStatus === 'not-found' && (
        <InstallCallout engine={executor.engine} />
      )}
      {selectedEngineStatus === 'login-required' && (
        <LoginCallout engine={executor.engine} />
      )}

      {variantMeta && (
        <ExecutorForm
          schema={variantMeta.schema}
          value={bodyOverrides}
          secretFields={variantMeta.secretFields}
          fieldHints={variantMeta.fieldHints}
          onChange={patchVariantBody}
        />
      )}

      <div className="border-t pt-4">
        <button
          type="button"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setAdvancedOpen(open => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? '▾' : '▸'}
          {' '}
          Advanced (per-request + cmd overrides)
        </button>
        {advancedOpen && (
          <div className="mt-3 flex flex-col gap-4">
            <ProfileLevelOverrides
              modelId={executor.modelId}
              reasoningId={executor.reasoningId}
              permissionPolicy={executor.permissionPolicy}
              onChange={patchTopLevel}
            />
            <CmdOverridesSection cmd={cmdOverride} onChange={patchCmd} />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 当前选中的引擎在该 worker 中未安装 CLI，提示操作员跳去 `docs/executor-engines.md`
 * 查对应小节；不禁用 select，保留操作员保存草稿 + 之后再装 CLI 的自由度。
 */
function InstallCallout({ engine }: { engine: EngineKind }) {
  const anchor = anchorFor(engine)
  return (
    <div
      role="alert"
      data-testid="engine-install-callout"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <p className="font-medium">This worker doesn&apos;t have the CLI for this engine.</p>
      <p className="mt-1 text-muted-foreground">
        Install / authenticate inside the worker container, then hit Refresh.
        See
        {' '}
        <a
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          href={`/docs/executor-engines.md${anchor}`}
          target="_blank"
          rel="noreferrer"
        >
          docs/executor-engines.md
          {anchor}
        </a>
        {' '}
        for the exact npm package + login command.
      </p>
    </div>
  )
}

/**
 * 与 InstallCallout 类似，但强调 CLI 已安装、仅缺登录态；语言措辞不同便于操作员
 * 一眼分辨。
 */
function LoginCallout({ engine }: { engine: EngineKind }) {
  const anchor = anchorFor(engine)
  return (
    <div
      role="status"
      data-testid="engine-login-callout"
      className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
    >
      <p className="font-medium">CLI installed, but no auth file was found.</p>
      <p className="mt-1 text-muted-foreground">
        Run the CLI&apos;s login command inside the worker container (see
        {' '}
        <a
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          href={`/docs/executor-engines.md${anchor}`}
          target="_blank"
          rel="noreferrer"
        >
          docs/executor-engines.md
          {anchor}
        </a>
        ), then Refresh.
      </p>
    </div>
  )
}

function anchorFor(engine: EngineKind): string {
  switch (engine) {
    case 'claude-code':
      return '#claude-code'
    case 'acp':
      return '#acp'
    case 'codex':
      return '#codex'
    case 'cursor':
      return '#cursor'
    default:
      return ''
  }
}

function ProfileLevelOverrides({
  modelId,
  reasoningId,
  permissionPolicy,
  onChange,
}: {
  modelId?: string
  reasoningId?: string
  permissionPolicy?: PermissionPolicy
  onChange: (next: { modelId?: string, reasoningId?: string, permissionPolicy?: PermissionPolicy }) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label>modelId (per-request override)</Label>
        <Input
          value={modelId ?? ''}
          onChange={e => onChange({ modelId: e.target.value, reasoningId, permissionPolicy })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>reasoningId</Label>
        <Input
          value={reasoningId ?? ''}
          onChange={e => onChange({ modelId, reasoningId: e.target.value, permissionPolicy })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>permissionPolicy</Label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={permissionPolicy ?? ''}
          onChange={(e) => {
            const v = e.target.value as PermissionPolicy | ''
            onChange({ modelId, reasoningId, ...(v ? { permissionPolicy: v } : {}) })
          }}
        >
          <option value="">— unset —</option>
          <option value="auto">auto</option>
          <option value="supervised">supervised</option>
          <option value="plan">plan</option>
        </select>
      </div>
    </div>
  )
}

function CmdOverridesSection({
  cmd,
  onChange,
}: {
  cmd: CmdOverrides | undefined
  onChange: (next: CmdOverrides | undefined) => void
}) {
  function patch(next: CmdOverrides) {
    const cleaned: CmdOverrides = {}
    if (next.binary && next.binary.length > 0)
      cleaned.binary = next.binary
    if (next.extraArgs && next.extraArgs.length > 0)
      cleaned.extraArgs = next.extraArgs
    if (next.env && Object.keys(next.env).length > 0)
      cleaned.env = next.env
    if (next.cliVersion && next.cliVersion.length > 0)
      cleaned.cliVersion = next.cliVersion
    onChange(Object.keys(cleaned).length > 0 ? cleaned : undefined)
  }

  const argsStr = (cmd?.extraArgs ?? []).join(' ')
  const envStr = Object.entries(cmd?.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        cmd overrides apply to engines that spawn a binary (cli / claude-code / acp).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>cmd.binary</Label>
          <Input
            value={cmd?.binary ?? ''}
            onChange={e => patch({ ...cmd, binary: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>cmd.cliVersion</Label>
          <Input
            value={cmd?.cliVersion ?? ''}
            onChange={e => patch({ ...cmd, cliVersion: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>cmd.extraArgs (space-separated)</Label>
          <Input
            value={argsStr}
            onChange={(e) => {
              const arr = e.target.value.split(/\s+/).filter(Boolean)
              patch({ ...cmd, extraArgs: arr })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>cmd.env (KEY=value per line)</Label>
          <textarea
            className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={envStr}
            onChange={(e) => {
              const entries: [string, string][] = []
              for (const line of e.target.value.split('\n')) {
                const eq = line.indexOf('=')
                if (eq <= 0)
                  continue
                const k = line.slice(0, eq).trim()
                const v = line.slice(eq + 1)
                if (k.length > 0)
                  entries.push([k, v])
              }
              patch({ ...cmd, env: Object.fromEntries(entries) })
            }}
          />
        </div>
      </div>
    </div>
  )
}
