import { describe, expect, it } from 'bun:test'

import { redactBodySecrets, scanBodyForSecrets } from './scan-body'

describe('scanBodyForSecrets', () => {
  it('returns no hits on empty / whitespace input', () => {
    expect(scanBodyForSecrets('').hits).toEqual([])
    expect(scanBodyForSecrets('   \n   ').hits).toEqual([])
  })

  it('catches sk- style tokens', () => {
    const { hits } = scanBodyForSecrets('apiKey=sk-LIVE-abcdefghijklmnopqrstuv')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.rule).toBe('sk-token')
    expect(hits[0]?.preview).toContain('…')
  })

  it('catches JWT-like tokens', () => {
    const { hits } = scanBodyForSecrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvZSIsImlhdCI6MTUxNjIzOTAyMn0.x')
    const ruleIds = hits.map(h => h.rule)
    expect(ruleIds).toContain('jwt')
    expect(ruleIds).toContain('bearer-token')
  })

  it('catches AWS access key ids and GitHub-style tokens', () => {
    const aws = scanBodyForSecrets('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')
    const gh = scanBodyForSecrets('token=ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD')
    expect(aws.hits.find(h => h.rule === 'aws-access-key')).toBeDefined()
    expect(gh.hits.find(h => h.rule === 'github-token')).toBeDefined()
  })

  it('flags random-bytes-as-base64 via high entropy fallback', () => {
    const random = 'q9vR3Lp7xT2KaQwErTyUiOpAsDfGhJkLZxCvBnMq1234'
    const { hits } = scanBodyForSecrets(`note: ${random}`)
    expect(hits.find(h => h.rule === 'high-entropy')).toBeDefined()
  })

  it('does not flag normal English prose with high frequency repeats', () => {
    const prose = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const { hits } = scanBodyForSecrets(prose)
    expect(hits).toHaveLength(0)
  })

  it('preserves order of multiple hits', () => {
    const body = 'AKIAIOSFODNN7EXAMPLE-and-then-sk-LIVE-abcdefghijklmnopqrstuv'
    const { hits } = scanBodyForSecrets(body)
    expect(hits).toHaveLength(2)
    expect(hits[0]?.rule).toBe('aws-access-key')
    expect(hits[1]?.rule).toBe('sk-token')
  })
})

describe('redactBodySecrets', () => {
  it('replaces hits with [REDACTED:<rule>] markers', () => {
    const { body, hits } = redactBodySecrets('apiKey=sk-LIVE-abcdefghijklmnopqrstuv\nbearer eyJabcdefghijklmnopqrstuv\n')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(body).toContain('[REDACTED:sk-token]')
    expect(body).toContain('[REDACTED:jwt]')
    expect(body).not.toContain('sk-LIVE-')
    expect(body).not.toContain('eyJabc')
  })

  it('returns the original body unchanged when no secrets are present', () => {
    const { body, hits } = redactBodySecrets('plain prose with no secrets')
    expect(hits).toEqual([])
    expect(body).toBe('plain prose with no secrets')
  })
})
