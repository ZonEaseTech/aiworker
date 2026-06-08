import type { Check, CheckResult } from './types'

import { describe, expect, it } from 'bun:test'

import { computeExitCode, maxSeverity, runChecks } from './runner'

function fixedCheck(id: string, severity: CheckResult['severity']): Check {
  return {
    category: 'runtime',
    id,
    label: id,
    run: () => ({ category: 'runtime', detail: id, id, label: id, probed: false, severity }),
  }
}

describe('maxSeverity', () => {
  it('returns the highest severity', () => {
    expect(maxSeverity([])).toBe('ok')
    expect(maxSeverity(['ok', 'ok'])).toBe('ok')
    expect(maxSeverity(['ok', 'warn'])).toBe('warn')
    expect(maxSeverity(['warn', 'error', 'ok'])).toBe('error')
  })
})

describe('computeExitCode', () => {
  it('error always exits 1', () => {
    expect(computeExitCode('error', false)).toBe(1)
    expect(computeExitCode('error', true)).toBe(1)
  })
  it('warn exits 0 unless strict', () => {
    expect(computeExitCode('warn', false)).toBe(0)
    expect(computeExitCode('warn', true)).toBe(1)
  })
  it('ok exits 0', () => {
    expect(computeExitCode('ok', false)).toBe(0)
    expect(computeExitCode('ok', true)).toBe(0)
  })
})

describe('runChecks', () => {
  it('aggregates overall + exitCode and preserves order', async () => {
    const report = await runChecks([fixedCheck('a', 'ok'), fixedCheck('b', 'warn')])
    expect(report.overall).toBe('warn')
    expect(report.exitCode).toBe(0)
    expect(report.results.map(result => result.id)).toEqual(['a', 'b'])
  })

  it('error overall exits 1', async () => {
    const report = await runChecks([fixedCheck('a', 'ok'), fixedCheck('b', 'error')])
    expect(report.overall).toBe('error')
    expect(report.exitCode).toBe(1)
  })

  it('strict makes a warn-only report exit 1', async () => {
    const report = await runChecks([fixedCheck('a', 'warn')], { strict: true })
    expect(report.exitCode).toBe(1)
  })

  it('a throwing check becomes an error result, never a crash', async () => {
    const boom: Check = {
      category: 'service',
      id: 'boom',
      label: 'boom',
      run: () => {
        throw new Error('kaboom')
      },
    }
    const report = await runChecks([boom])
    expect(report.results[0]?.severity).toBe('error')
    expect(report.results[0]?.detail).toContain('kaboom')
    expect(report.exitCode).toBe(1)
  })

  it('passes the probe flag through to checks', async () => {
    let seen = false
    const probeCheck: Check = {
      category: 'runtime',
      id: 'p',
      label: 'p',
      run: (ctx) => {
        seen = ctx.probe
        return { category: 'runtime', detail: '', id: 'p', label: 'p', probed: ctx.probe, severity: 'ok' }
      },
    }
    await runChecks([probeCheck], { probe: true })
    expect(seen).toBe(true)
  })
})
