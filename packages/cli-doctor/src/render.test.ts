import type { DoctorReport } from './types'

import { describe, expect, it } from 'bun:test'

import { renderJson, renderText, severityCounts } from './render'

const report: DoctorReport = {
  exitCode: 0,
  overall: 'warn',
  results: [
    { category: 'runtime', detail: 'bun 1.3.14', id: 'r', label: 'bun', probed: false, severity: 'ok' },
    {
      category: 'provisioning',
      detail: 'aissh not found',
      fix: { command: 'install aissh', message: 'remote provisioning unavailable' },
      id: 'a',
      label: 'aissh',
      probed: false,
      severity: 'warn',
    },
  ],
}

describe('severityCounts', () => {
  it('counts by severity', () => {
    expect(severityCounts(report.results)).toEqual({ error: 0, ok: 1, warn: 1 })
  })
})

describe('renderText', () => {
  it('shows symbols, the fix for non-ok rows, and a summary line', () => {
    const out = renderText(report, { title: 'Doctor' })
    expect(out).toContain('Doctor')
    expect(out).toContain('[✓]')
    expect(out).toContain('[!]')
    expect(out).toContain('fix: install aissh')
    expect(out).toContain('0 error, 1 warning (exit 0)')
  })

  it('never prints a fix line for ok rows', () => {
    const out = renderText({ ...report, overall: 'ok', results: [report.results[0]!] })
    expect(out).not.toContain('fix:')
    expect(out).toContain('Healthy')
  })
})

describe('renderJson', () => {
  it('round-trips the report', () => {
    expect(JSON.parse(renderJson(report))).toEqual(report)
  })
})
