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
import { useRefreshWorkerEngines, useWorkerEngines } from '@/worker/lib/hooks'
import { buildAvailabilityMap, resolveEngineStatus } from './engine-availability'
import { ExecutorForm } from './executor-form'
import { defaultProfileFor, ENGINE_CATALOG, listEngines, listVariantsFor } from './executor-variants'

interface ExecutorSectionProps {
  executor: ExecutorProfile
  onChange: (next: ExecutorProfile) => void
}

const STATUS_LABEL: Record<EngineAvailabilityStatus, string> = {
  'ready': 'ready',
  'login-required': 'login required',
  'not-found': 'not installed',
}

const STATUS_DOT_CLASS: Record<EngineAvailabilityStatus, string> = {
  'ready': 'bg-success',
  'login-required': 'bg-warning',
  'not-found': 'bg-muted-foreground/40',
}

const STATUS_TEXT_CLASS: Record<EngineAvailabilityStatus, string> = {
  'ready': 'text-success',
  'login-required': 'text-warning',
  'not-found': 'text-muted-foreground',
}

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
 * Two-step engine × variant picker。worker 视角直接调 `/api/worker/engines`
 * （fleet 走 gateway proxy）。其他逻辑保持与 fleet 视角一致。
 */
export function ExecutorSection({ executor, onChange }: ExecutorSectionProps) {
  const engineMeta = ENGINE_CATALOG[executor.engine]
  const variantMeta = engineMeta.variants[executor.variant]

  const [advancedOpen, setAdvancedOpen] = useState(false)

  const enginesQuery = useWorkerEngines()
  const availability = buildAvailabilityMap(enginesQuery.data?.engines)
  const refreshEngines = useRefreshWorkerEngines()
  const [refreshing, setRefreshing] = useState(false)

  async function onRefresh() {
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

  const overridesObj = (executor.overrides ?? {}) as Record<string, unknown>
  const { cmd: cmdOverride, ...bodyOverrides } = overridesObj as { cmd?: CmdOverrides } & Record<string, unknown>

  const selectedEngineStatus = resolveEngineStatus(availability, executor.engine)
  const currentVariantAvailability = executor.engine === 'acp'
    ? availability.get(`acp:${executor.variant}`)
    : availability.get(executor.engine)

  return (
    <section className="app-panel flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-feature font-normal">Executor</h2>
          <p className="text-sm text-muted-foreground">
            选 engine + variant，仅 override 想改的字段。
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || enginesQuery.isFetching}
          aria-label="Refresh engine availability"
          data-testid="refresh-engines-btn"
          className="inline-flex items-center gap-1 rounded-sm border border-hairline px-2 py-1 text-xs text-muted-foreground hover:bg-soft-stone disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {availability.size > 0 && (
        <div className="flex flex-wrap gap-2 rounded-sm border border-hairline bg-soft-stone p-2 text-xs">
          {listEngines().map((eng) => {
            const status = resolveEngineStatus(availability, eng)
            return (
              <span
                key={eng}
                className="inline-flex items-center gap-2 rounded-full border border-hairline bg-background px-2.5 py-1"
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
            className="app-field h-10"
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
            className="app-field h-10"
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

function InstallCallout({ engine }: { engine: EngineKind }) {
  const anchor = anchorFor(engine)
  return (
    <div
      role="alert"
      data-testid="engine-install-callout"
      className="app-alert-warning"
    >
      <p className="font-medium">本 worker 没有该 engine 对应的 CLI。</p>
      <p className="mt-1 text-muted-foreground">
        进 worker 容器装 / 登录后点 Refresh。具体步骤见
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
        。
      </p>
    </div>
  )
}

function LoginCallout({ engine }: { engine: EngineKind }) {
  const anchor = anchorFor(engine)
  return (
    <div
      role="status"
      data-testid="engine-login-callout"
      className="app-alert-warning"
    >
      <p className="font-medium">CLI 已装但缺登录态。</p>
      <p className="mt-1 text-muted-foreground">
        在 worker 容器跑对应 CLI 的 login 命令（见
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
        ）后 Refresh。
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
          className="app-field h-10"
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
    <div className="flex flex-col gap-3 rounded-sm border border-hairline bg-soft-stone p-3">
      <p className="text-xs text-muted-foreground">
        cmd overrides 仅对 spawn 二进制的 engine（cli / claude-code / acp）生效。
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
          <Label>cmd.extraArgs (空白分隔)</Label>
          <Input
            value={argsStr}
            onChange={(e) => {
              const arr = e.target.value.split(/\s+/).filter(Boolean)
              patch({ ...cmd, extraArgs: arr })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>cmd.env (KEY=value 每行)</Label>
          <textarea
            className="app-field min-h-[80px] font-mono"
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
