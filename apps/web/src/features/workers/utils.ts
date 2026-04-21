import type { RegisteredWorkerLivenessState } from '@aiworker/shared'

/** Tailwind/cva variant keyed by the manager-side liveness label. */
export function stateBadgeVariant(
  state: RegisteredWorkerLivenessState | undefined,
): 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' {
  switch (state) {
    case 'online':
      return 'success'
    case 'offline':
      return 'secondary'
    case 'auth-failed':
      return 'destructive'
    case 'config-version-mismatch':
      return 'warning'
    default:
      return 'outline'
  }
}

export function stateBadgeLabel(state: RegisteredWorkerLivenessState | undefined): string {
  return state ?? 'unknown'
}

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const RELATIVE_THRESHOLDS: { unit: Intl.RelativeTimeFormatUnit, ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 3600 * 1000 },
  { unit: 'month', ms: 30 * 24 * 3600 * 1000 },
  { unit: 'day', ms: 24 * 3600 * 1000 },
  { unit: 'hour', ms: 3600 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
]

/** Format an ISO-8601 timestamp as e.g. "2 minutes ago". Falls back to em-dash. */
export function formatRelativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso)
    return '—'
  const then = Date.parse(iso)
  if (Number.isNaN(then))
    return '—'
  const diff = then - now
  const abs = Math.abs(diff)
  for (const { unit, ms } of RELATIVE_THRESHOLDS) {
    if (abs >= ms || unit === 'second')
      return RTF.format(Math.round(diff / ms), unit)
  }
  return RTF.format(0, 'second')
}

/** Truncate a worker id like `w_abcd1234efgh` to `w_abcd…efgh`. */
export function truncateWorkerId(id: string): string {
  if (id.length <= 12)
    return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}
