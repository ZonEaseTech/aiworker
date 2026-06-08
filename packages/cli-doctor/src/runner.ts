import type { Check, CheckResult, DoctorReport, Severity } from './types'

const SEVERITY_RANK: Record<Severity, number> = { error: 2, ok: 0, warn: 1 }

export function maxSeverity(severities: Severity[]): Severity {
  let max: Severity = 'ok'
  for (const severity of severities) {
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[max])
      max = severity
  }
  return max
}

// error → 1 (fixes npm-doctor's "error but exit 0"); warn → 0 unless --strict
// (fixes brew-doctor's "warn but exit 1"). See spec §3.2.
export function computeExitCode(overall: Severity, strict: boolean): number {
  if (overall === 'error')
    return 1
  if (overall === 'warn' && strict)
    return 1
  return 0
}

export async function runChecks(
  checks: Check[],
  options: { probe?: boolean, strict?: boolean } = {},
): Promise<DoctorReport> {
  const probe = options.probe ?? false
  const strict = options.strict ?? false
  const results: CheckResult[] = []
  for (const check of checks) {
    try {
      results.push(await check.run({ probe }))
    }
    catch (error) {
      // A check that throws is itself a failure — surface it as error, never crash doctor.
      results.push({
        category: check.category,
        detail: error instanceof Error ? error.message : String(error),
        id: check.id,
        label: check.label,
        probed: probe,
        severity: 'error',
      })
    }
  }
  const overall = maxSeverity(results.map(result => result.severity))
  return { exitCode: computeExitCode(overall, strict), overall, results }
}
