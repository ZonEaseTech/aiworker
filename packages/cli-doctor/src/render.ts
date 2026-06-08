import type { CheckResult, DoctorReport, Severity } from './types'

const SYMBOL: Record<Severity, string> = { error: '✗', ok: '✓', warn: '!' }

export function severityCounts(results: CheckResult[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, ok: 0, warn: 0 }
  for (const result of results)
    counts[result.severity] += 1
  return counts
}

export function renderText(report: DoctorReport, options: { title?: string } = {}): string {
  const lines: string[] = []
  if (options.title)
    lines.push(options.title, '')

  for (const result of report.results) {
    lines.push(`[${SYMBOL[result.severity]}] ${result.category.padEnd(12)} ${result.label} — ${result.detail}`)
    if (result.severity !== 'ok' && result.fix) {
      lines.push(`    fix: ${result.fix.command ?? result.fix.message}`)
      if (result.fix.command && result.fix.message)
        lines.push(`         (${result.fix.message})`)
    }
  }

  const counts = severityCounts(report.results)
  lines.push('')
  lines.push(
    `${report.overall === 'ok' ? 'Healthy' : 'Issues found'}: `
    + `${counts.error} error, ${counts.warn} warning (exit ${report.exitCode})`,
  )
  return lines.join('\n')
}

export function renderJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}
