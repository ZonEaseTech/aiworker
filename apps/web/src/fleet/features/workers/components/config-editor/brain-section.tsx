import type { BrainSourceConfig, WorkerConfig } from '@zonease/aiworker-shared'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'

interface BrainSectionProps {
  brains: BrainSourceConfig[]
  brainWriteTarget: string
  brainRetrieval: WorkerConfig['brainRetrieval']
  onChange: (patch: Partial<Pick<WorkerConfig, 'brains' | 'brainWriteTarget' | 'brainRetrieval'>>) => void
}

function defaultFilesystemSource(index: number): BrainSourceConfig {
  return {
    id: `brain-${index}`,
    type: 'filesystem',
    priority: 100,
    readOnly: false,
    // Leave `home` undefined — the worker factory defaults to
    // `~/.aiworker/workers/<workerId>/brain/`. Operators can override by
    // typing a path in the form.
    config: {},
  }
}

function defaultCloudGatewaySource(index: number): BrainSourceConfig {
  return {
    id: `brain-${index}`,
    type: 'cloud-gateway',
    priority: 100,
    readOnly: false,
    config: { url: '', token: '' },
  }
}

export function BrainSection({
  brains,
  brainWriteTarget,
  brainRetrieval,
  onChange,
}: BrainSectionProps) {
  function replaceAt(index: number, next: BrainSourceConfig) {
    const nextBrains = brains.slice()
    nextBrains[index] = next
    onChange({ brains: nextBrains })
  }

  function removeAt(index: number) {
    const removed = brains[index]
    const nextBrains = brains.filter((_, i) => i !== index)
    const patch: Parameters<typeof onChange>[0] = { brains: nextBrains }
    if (removed && brainWriteTarget === removed.id)
      patch.brainWriteTarget = nextBrains[0]?.id ?? ''
    onChange(patch)
  }

  function addSource(type: BrainSourceConfig['type']) {
    const next
      = type === 'filesystem'
        ? defaultFilesystemSource(brains.length + 1)
        : defaultCloudGatewaySource(brains.length + 1)
    onChange({ brains: [...brains, next] })
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Brain sources</h2>
          <p className="text-sm text-muted-foreground">
            Knowledge and memory backends the worker reads from. Leave secret fields empty to keep the existing value.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addSource('filesystem')}>
            <Plus className="size-3.5" />
            Filesystem
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addSource('cloud-gateway')}>
            <Plus className="size-3.5" />
            Cloud gateway
          </Button>
        </div>
      </header>

      {brains.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No brain sources configured yet. Add at least one to enable retrieval.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {brains.map((source, index) => (
          <BrainSourceRow
            key={source.id}
            source={source}
            onChange={next => replaceAt(index, next)}
            onRemove={() => removeAt(index)}
          />
        ))}
      </ul>

      {brains.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Write target</Label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={brainWriteTarget}
              onChange={e => onChange({ brainWriteTarget: e.target.value })}
            >
              <option value="">— none —</option>
              {brains.map(b => (
                <option key={b.id} value={b.id}>{b.id}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The source that receives
              {' '}
              <code className="font-mono text-[11px]">writeMemory</code>
              {' '}
              calls.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Retrieval mode</Label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={brainRetrieval}
              onChange={e => onChange({ brainRetrieval: e.target.value as WorkerConfig['brainRetrieval'] })}
            >
              <option value="merge-by-priority">merge-by-priority</option>
              <option value="first-match">first-match</option>
            </select>
          </div>
        </div>
      )}
    </section>
  )
}

function BrainSourceRow({
  source,
  onChange,
  onRemove,
}: {
  source: BrainSourceConfig
  onChange: (next: BrainSourceConfig) => void
  onRemove: () => void
}) {
  function patchCommon(patch: Partial<Pick<BrainSourceConfig, 'id' | 'priority' | 'readOnly'>>) {
    onChange({ ...source, ...patch })
  }

  function switchType(nextType: BrainSourceConfig['type']) {
    if (nextType === source.type)
      return
    if (nextType === 'filesystem') {
      onChange({
        id: source.id,
        type: 'filesystem',
        priority: source.priority,
        readOnly: source.readOnly,
        config: {},
      })
    }
    else {
      onChange({
        id: source.id,
        type: 'cloud-gateway',
        priority: source.priority,
        readOnly: source.readOnly,
        config: { url: '', token: '' },
      })
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,120px)_auto]">
        <div className="flex flex-col gap-1.5">
          <Label>Id</Label>
          <Input
            value={source.id}
            onChange={e => patchCommon({ id: e.target.value })}
            aria-label="Brain source id"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={source.type}
            onChange={e => switchType(e.target.value as BrainSourceConfig['type'])}
            aria-label="Brain source type"
          >
            <option value="filesystem">filesystem</option>
            <option value="cloud-gateway">cloud-gateway</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Priority</Label>
          <Input
            type="number"
            value={source.priority}
            onChange={e => patchCommon({ priority: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={source.readOnly}
              onChange={e => patchCommon({ readOnly: e.target.checked })}
            />
            read-only
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove brain source"
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {source.type === 'filesystem'
        ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="home (optional — leave blank for default ~/.aiworker/workers/<id>/brain)">
                <Input
                  value={source.config.home ?? ''}
                  onChange={e => onChange({ ...source, config: { ...source.config, home: e.target.value || undefined } })}
                />
              </Field>
            </div>
          )
        : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="url">
                <Input
                  value={source.config.url}
                  onChange={e => onChange({ ...source, config: { ...source.config, url: e.target.value } })}
                />
              </Field>
              <SecretField
                label="token"
                value={source.config.token}
                onChange={v => onChange({ ...source, config: { ...source.config, token: v } })}
              />
              <Field label="defaultCategory (optional)">
                <Input
                  value={source.config.defaultCategory ?? ''}
                  onChange={e => onChange({ ...source, config: { ...source.config, defaultCategory: e.target.value } })}
                />
              </Field>
              <Field label="defaultTypeId (optional)">
                <Input
                  value={source.config.defaultTypeId ?? ''}
                  onChange={e => onChange({ ...source, config: { ...source.config, defaultTypeId: e.target.value } })}
                />
              </Field>
            </div>
          )}
    </li>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function SecretField({
  label,
  value,
  onChange,
  placeholder = '(unchanged)',
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setShow(v => !v)}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Leave empty to keep the stored value.
      </p>
    </div>
  )
}
