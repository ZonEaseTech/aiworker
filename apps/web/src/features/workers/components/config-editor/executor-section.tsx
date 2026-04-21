import type { ExecutorConfig } from '@aiworker/shared'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecretField } from './brain-section'

interface ExecutorSectionProps {
  executor: ExecutorConfig
  onChange: (next: ExecutorConfig) => void
}

function defaultHttp(): ExecutorConfig {
  return { type: 'http', baseUrl: '', apiKey: '', model: '', timeoutMs: 30_000 }
}

function defaultMcp(): ExecutorConfig {
  return { type: 'mcp', url: '', token: '', timeoutMs: 30_000 }
}

function defaultCli(): ExecutorConfig {
  return { type: 'cli', command: '', args: [], timeoutMs: 30_000 }
}

export function ExecutorSection({ executor, onChange }: ExecutorSectionProps) {
  function switchType(next: ExecutorConfig['type']) {
    if (next === executor.type)
      return
    if (next === 'http')
      onChange(defaultHttp())
    else if (next === 'mcp')
      onChange(defaultMcp())
    else onChange(defaultCli())
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <header>
        <h2 className="text-lg font-semibold">Executor</h2>
        <p className="text-sm text-muted-foreground">
          Chat-completion backend the worker uses for tool-calling loops.
        </p>
      </header>

      <div className="flex gap-4" role="radiogroup" aria-label="Executor type">
        {(['http', 'mcp', 'cli'] as const).map(t => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="executor-type"
              value={t}
              checked={executor.type === t}
              onChange={() => switchType(t)}
            />
            <span className="font-mono">{t}</span>
          </label>
        ))}
      </div>

      {executor.type === 'http' && <HttpFields executor={executor} onChange={onChange} />}
      {executor.type === 'mcp' && <McpFields executor={executor} onChange={onChange} />}
      {executor.type === 'cli' && <CliFields executor={executor} onChange={onChange} />}
    </section>
  )
}

function HttpFields({
  executor,
  onChange,
}: {
  executor: Extract<ExecutorConfig, { type: 'http' }>
  onChange: (next: ExecutorConfig) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LabeledInput
        label="baseUrl"
        value={executor.baseUrl}
        onChange={v => onChange({ ...executor, baseUrl: v })}
      />
      <LabeledInput
        label="model"
        value={executor.model}
        onChange={v => onChange({ ...executor, model: v })}
      />
      <SecretField
        label="apiKey"
        value={executor.apiKey}
        onChange={v => onChange({ ...executor, apiKey: v })}
      />
      <NumberInput
        label="timeoutMs"
        value={executor.timeoutMs}
        onChange={v => onChange({ ...executor, timeoutMs: v })}
      />
    </div>
  )
}

function McpFields({
  executor,
  onChange,
}: {
  executor: Extract<ExecutorConfig, { type: 'mcp' }>
  onChange: (next: ExecutorConfig) => void
}) {
  const toolsStr = (executor.tools ?? []).join(',')
  function setTools(next: string) {
    const arr = next.split(',').map(s => s.trim()).filter(Boolean)
    onChange({ ...executor, tools: arr.length > 0 ? arr : undefined })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LabeledInput
        label="url"
        value={executor.url}
        onChange={v => onChange({ ...executor, url: v })}
      />
      <SecretField
        label="token"
        value={executor.token}
        onChange={v => onChange({ ...executor, token: v })}
      />
      <LabeledInput
        label="defaultModel (optional)"
        value={executor.defaultModel ?? ''}
        onChange={v => onChange({ ...executor, defaultModel: v || undefined })}
      />
      <LabeledInput
        label="tools (comma-separated, optional)"
        value={toolsStr}
        onChange={setTools}
      />
      <NumberInput
        label="timeoutMs (optional)"
        value={executor.timeoutMs ?? 30_000}
        onChange={v => onChange({ ...executor, timeoutMs: v })}
      />
    </div>
  )
}

function CliFields({
  executor,
  onChange,
}: {
  executor: Extract<ExecutorConfig, { type: 'cli' }>
  onChange: (next: ExecutorConfig) => void
}) {
  const argsStr = executor.args.join(' ')
  function setArgs(next: string) {
    const arr = next.split(/\s+/).filter(Boolean)
    onChange({ ...executor, args: arr })
  }
  const envStr = Object.entries(executor.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
  function setEnv(next: string) {
    const entries: [string, string][] = []
    for (const line of next.split('\n')) {
      const eq = line.indexOf('=')
      if (eq <= 0)
        continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1)
      if (k.length > 0)
        entries.push([k, v])
    }
    onChange({ ...executor, env: entries.length > 0 ? Object.fromEntries(entries) : undefined })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LabeledInput
        label="command"
        value={executor.command}
        onChange={v => onChange({ ...executor, command: v })}
      />
      <LabeledInput
        label="args (space-separated)"
        value={argsStr}
        onChange={setArgs}
      />
      <LabeledInput
        label="cwd (optional)"
        value={executor.cwd ?? ''}
        onChange={v => onChange({ ...executor, cwd: v || undefined })}
      />
      <NumberInput
        label="timeoutMs (optional)"
        value={executor.timeoutMs ?? 30_000}
        onChange={v => onChange({ ...executor, timeoutMs: v })}
      />
      <div className="sm:col-span-2 flex flex-col gap-1.5">
        <Label>env (KEY=value per line, optional)</Label>
        <textarea
          className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
          value={envStr}
          onChange={e => setEnv(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={executor.sandbox === true}
          onChange={e => onChange({ ...executor, sandbox: e.target.checked })}
        />
        Sandbox each invocation (docker)
      </label>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10)
          onChange(Number.isNaN(parsed) ? 0 : parsed)
        }}
      />
    </div>
  )
}
