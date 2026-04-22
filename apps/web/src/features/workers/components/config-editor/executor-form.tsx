import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecretField } from './brain-section'

/**
 * Lean Zod-schema → form mapper. Renders one field per top-level key of the
 * variant body schema. We match a handful of common shapes (`string`,
 * `number`, `boolean`, `enum`, `array<string>`, `record<string,string>`) and
 * fall back to a JSON textarea for anything else. This is intentionally
 * thin — the alternative is shipping a dynamic-schema library, which the
 * FEAT-014 acceptance explicitly rules out.
 *
 * Empty-string semantics: optional string inputs treat "" as "field cleared"
 * and emit `undefined` to the parent. This lines up with the worker_secrets
 * round-trip where empty masks the stored secret.
 */
export interface ExecutorFormProps {
  schema: z.ZodObject<z.ZodRawShape>
  value: Record<string, unknown>
  /**
   * Key paths the UI treats as secrets. The mapper renders these via
   * `<SecretField>` (masked input + show/hide toggle).
   */
  secretFields?: string[]
  onChange: (next: Record<string, unknown>) => void
}

const EMPTY_SECRET_FIELDS: string[] = []

export function ExecutorForm({ schema, value, secretFields = EMPTY_SECRET_FIELDS, onChange }: ExecutorFormProps) {
  const shape = schema.shape
  const secretSet = new Set(secretFields)

  function patch(key: string, next: unknown) {
    const merged = { ...value }
    if (next === undefined)
      delete merged[key]
    else
      merged[key] = next
    onChange(merged)
  }

  const entries = Object.entries(shape)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, fieldSchema]) => (
        <FieldRenderer
          key={key}
          name={key}
          schema={fieldSchema}
          value={value[key]}
          isSecret={secretSet.has(key)}
          onChange={next => patch(key, next)}
        />
      ))}
    </div>
  )
}

interface FieldRendererProps {
  name: string
  schema: z.ZodTypeAny
  value: unknown
  isSecret: boolean
  onChange: (next: unknown) => void
}

function unwrapOptional(schema: z.ZodTypeAny): { inner: z.ZodTypeAny, optional: boolean } {
  if (schema instanceof z.ZodOptional)
    return { inner: schema._def.innerType as z.ZodTypeAny, optional: true }
  if (schema instanceof z.ZodNullable)
    return { inner: schema._def.innerType as z.ZodTypeAny, optional: true }
  return { inner: schema, optional: false }
}

function FieldRenderer({ name, schema, value, isSecret, onChange }: FieldRendererProps) {
  const { inner, optional } = unwrapOptional(schema)
  const labelSuffix = optional ? ' (optional)' : ''

  if (inner instanceof z.ZodString) {
    const str = typeof value === 'string' ? value : ''
    if (isSecret) {
      return (
        <SecretField
          label={`${name}${labelSuffix}`}
          value={str}
          onChange={next => onChange(next || (optional ? undefined : ''))}
        />
      )
    }
    return (
      <LabeledInput
        label={`${name}${labelSuffix}`}
        value={str}
        onChange={next => onChange(next || (optional ? undefined : ''))}
      />
    )
  }

  if (inner instanceof z.ZodNumber) {
    const num = typeof value === 'number' ? value : 0
    return (
      <NumberInput
        label={`${name}${labelSuffix}`}
        value={num}
        onChange={next => onChange(next)}
      />
    )
  }

  if (inner instanceof z.ZodBoolean) {
    const checked = value === true
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        {name}
      </label>
    )
  }

  if (inner instanceof z.ZodEnum) {
    const options = (inner._def.values ?? inner.options ?? []) as string[]
    const current = typeof value === 'string' ? value : (optional ? '' : (options[0] ?? ''))
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{`${name}${labelSuffix}`}</Label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={current}
          onChange={e => onChange(e.target.value || (optional ? undefined : options[0]))}
        >
          {optional && <option value="">— unset —</option>}
          {options.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (inner instanceof z.ZodArray) {
    const arr = Array.isArray(value) ? (value as unknown[]).filter(v => typeof v === 'string') as string[] : []
    return (
      <LabeledInput
        label={`${name}${labelSuffix} (comma- or space-separated)`}
        value={arr.join(' ')}
        onChange={(next) => {
          const parsed = next.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
          if (parsed.length === 0)
            onChange(optional ? undefined : [])
          else onChange(parsed)
        }}
      />
    )
  }

  if (inner instanceof z.ZodRecord) {
    const rec: Record<string, string> = (typeof value === 'object' && value !== null)
      ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>
      : {}
    const text = Object.entries(rec).map(([k, v]) => `${k}=${v}`).join('\n')
    return (
      <div className="sm:col-span-2 flex flex-col gap-1.5">
        <Label>{`${name}${labelSuffix} (KEY=value per line)`}</Label>
        <textarea
          className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
          value={text}
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
            if (entries.length === 0)
              onChange(optional ? undefined : {})
            else onChange(Object.fromEntries(entries))
          }}
        />
      </div>
    )
  }

  // Fallback: free-form JSON textarea. Parses on blur; invalid JSON is
  // ignored so the user can keep editing without losing focus.
  return (
    <div className="sm:col-span-2 flex flex-col gap-1.5">
      <Label>{`${name}${labelSuffix} (JSON)`}</Label>
      <JsonTextarea value={value} onChange={onChange} optional={optional} />
    </div>
  )
}

function stringifyJson(value: unknown): string {
  if (value === undefined || value === null)
    return ''
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return ''
  }
}

function JsonTextarea({
  value,
  onChange,
  optional,
}: {
  value: unknown
  onChange: (next: unknown) => void
  optional: boolean
}) {
  const initial = stringifyJson(value)

  return (
    <textarea
      className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
      defaultValue={initial}
      onBlur={(e) => {
        const text = e.target.value.trim()
        if (text.length === 0) {
          onChange(optional ? undefined : null)
          return
        }
        try {
          onChange(JSON.parse(text))
        }
        catch {
          // Leave value unchanged on parse error; the user can fix and blur again.
        }
      }}
    />
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
