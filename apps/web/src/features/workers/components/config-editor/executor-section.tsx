import type { CmdOverrides, EngineKind, ExecutorProfile, PermissionPolicy } from '@aiworker/shared'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExecutorForm } from './executor-form'
import { defaultProfileFor, ENGINE_CATALOG, listEngines, listVariantsFor } from './executor-variants'

interface ExecutorSectionProps {
  executor: ExecutorProfile
  onChange: (next: ExecutorProfile) => void
}

/**
 * Two-step engine × variant picker. Variant body fields render via the
 * lean `<ExecutorForm>` schema mapper. CmdOverrides + per-request fields
 * (modelId / reasoningId / permissionPolicy) live in their own collapsed
 * "Advanced" panel so the common case stays one screen of inputs.
 *
 * Save semantics: the parent passes the full `ExecutorProfile`. The variant
 * body is NEVER sent — only `{ engine, variant, overrides? }`. Default
 * profile fields live server-side in `default-profiles.ts` and merge in via
 * `resolveVariant` at executor build time.
 */
export function ExecutorSection({ executor, onChange }: ExecutorSectionProps) {
  const engineMeta = ENGINE_CATALOG[executor.engine]
  const variantMeta = engineMeta.variants[executor.variant]

  const [advancedOpen, setAdvancedOpen] = useState(false)

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

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <header>
        <h2 className="text-lg font-semibold">Executor</h2>
        <p className="text-sm text-muted-foreground">
          Choose an engine, pick a variant preset, then override only the fields you need.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="executor-engine">Engine</Label>
          <select
            id="executor-engine"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={executor.engine}
            onChange={e => switchEngine(e.target.value as EngineKind)}
          >
            {listEngines().map(eng => (
              <option key={eng} value={eng}>
                {ENGINE_CATALOG[eng].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{engineMeta.description}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="executor-variant">Variant</Label>
          <select
            id="executor-variant"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={executor.variant}
            onChange={e => switchVariant(e.target.value)}
          >
            {listVariantsFor(executor.engine).map(v => (
              <option key={v} value={v}>
                {engineMeta.variants[v]!.label}
              </option>
            ))}
          </select>
          {variantMeta?.description && (
            <p className="text-xs text-muted-foreground">{variantMeta.description}</p>
          )}
        </div>
      </div>

      {variantMeta && (
        <ExecutorForm
          schema={variantMeta.schema}
          value={bodyOverrides}
          secretFields={variantMeta.secretFields}
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
