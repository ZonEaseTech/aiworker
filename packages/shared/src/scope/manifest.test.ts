import { describe, expect, it } from 'bun:test'

import {
  buildScopeManifest,
  parseOptionalScopeManifestJson,
  parseScopeManifestJson,
  scopeManifestSchema,
} from './manifest'

describe('scope manifest schema', () => {
  it('parses a minimal manifest with only kind + primarySoul', () => {
    const result = scopeManifestSchema.safeParse({
      kind: 'developer-repo',
      primarySoul: 'developer',
      schemaVersion: 1,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.kind).toBe('developer-repo')
      expect(result.data.primarySoul).toBe('developer')
      expect(result.data.privacy).toBeUndefined()
    }
  })

  it('parses a richer HR manifest with artifactRoots and privacy', () => {
    const result = scopeManifestSchema.safeParse({
      approval: 'manual-approval',
      artifactRoots: [
        { description: 'Resume PDFs', path: 'candidates/resumes/' },
        { path: 'candidates/screening/' },
      ],
      id: 'backend-hire-q3',
      kind: 'hiring-pool',
      labels: ['backend', 'q3-2026'],
      primarySoul: 'hr-recruiting',
      privacy: 'private',
      retention: '24mo',
      schemaVersion: 1,
      subject: 'Backend Engineer Q3 2026',
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown schemaVersion', () => {
    const result = scopeManifestSchema.safeParse({
      kind: 'developer-repo',
      primarySoul: 'developer',
      schemaVersion: 2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty kind', () => {
    const result = scopeManifestSchema.safeParse({
      kind: '',
      primarySoul: 'developer',
      schemaVersion: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects malformed kebab-case for kind / primarySoul', () => {
    expect(scopeManifestSchema.safeParse({
      kind: 'Developer Repo',
      primarySoul: 'developer',
      schemaVersion: 1,
    }).success).toBe(false)
    expect(scopeManifestSchema.safeParse({
      kind: 'developer-repo',
      primarySoul: 'HR-Recruiting',
      schemaVersion: 1,
    }).success).toBe(false)
  })

  it('rejects unknown privacy / approval values', () => {
    expect(scopeManifestSchema.safeParse({
      kind: 'developer-repo',
      primarySoul: 'developer',
      privacy: 'classified',
      schemaVersion: 1,
    }).success).toBe(false)
    expect(scopeManifestSchema.safeParse({
      approval: 'auto-everything',
      kind: 'developer-repo',
      primarySoul: 'developer',
      schemaVersion: 1,
    }).success).toBe(false)
  })
})

describe('parseScopeManifestJson', () => {
  it('returns ok with parsed manifest for valid JSON', () => {
    const result = parseScopeManifestJson(JSON.stringify({
      kind: 'hiring-pool',
      primarySoul: 'hr-recruiting',
      schemaVersion: 1,
    }))
    expect(result.status).toBe('ok')
    if (result.status === 'ok')
      expect(result.manifest.primarySoul).toBe('hr-recruiting')
  })

  it('returns malformed with parse error message for non-JSON', () => {
    const result = parseScopeManifestJson('{ not json')
    expect(result.status).toBe('malformed')
    if (result.status === 'malformed')
      expect(result.error).toContain('not valid JSON')
  })

  it('returns malformed with field-level message for schema violations', () => {
    const result = parseScopeManifestJson(JSON.stringify({
      kind: '',
      primarySoul: 'developer',
      schemaVersion: 1,
    }))
    expect(result.status).toBe('malformed')
    if (result.status === 'malformed')
      expect(result.error).toContain('kind')
  })
})

describe('parseOptionalScopeManifestJson', () => {
  it('returns missing for null and undefined', () => {
    expect(parseOptionalScopeManifestJson(null).status).toBe('missing')
    expect(parseOptionalScopeManifestJson(undefined).status).toBe('missing')
  })

  it('delegates to parseScopeManifestJson for present content', () => {
    const result = parseOptionalScopeManifestJson(JSON.stringify({
      kind: 'developer-repo',
      primarySoul: 'developer',
      schemaVersion: 1,
    }))
    expect(result.status).toBe('ok')
  })
})

describe('buildScopeManifest', () => {
  it('emits a minimal manifest for the bootstrap path', () => {
    const manifest = buildScopeManifest({
      kind: 'developer-repo',
      primarySoul: 'developer',
    })
    expect(manifest).toEqual({
      kind: 'developer-repo',
      primarySoul: 'developer',
      schemaVersion: 1,
    })
  })

  it('omits empty labels and artifactRoots arrays', () => {
    const manifest = buildScopeManifest({
      artifactRoots: [],
      kind: 'developer-repo',
      labels: [],
      primarySoul: 'developer',
    })
    expect(manifest.labels).toBeUndefined()
    expect(manifest.artifactRoots).toBeUndefined()
  })

  it('passes through privacy / approval / retention when provided', () => {
    const manifest = buildScopeManifest({
      approval: 'manual-approval',
      kind: 'hiring-pool',
      primarySoul: 'hr-recruiting',
      privacy: 'private',
      retention: '24mo',
    })
    expect(manifest.approval).toBe('manual-approval')
    expect(manifest.privacy).toBe('private')
    expect(manifest.retention).toBe('24mo')
  })
})
