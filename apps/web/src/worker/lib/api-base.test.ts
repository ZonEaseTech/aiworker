import { describe, expect, it } from 'vitest'
import { isFleetHostedWorkerPath, resolveWorkerApiBasePath, workerApiUrl } from './api-base'

describe('worker API base path', () => {
  it('keeps self-hosted and dev worker paths on /api/worker', () => {
    expect(resolveWorkerApiBasePath('/admin/config')).toBe('/api/worker')
    expect(resolveWorkerApiBasePath('/worker/config')).toBe('/api/worker')
    expect(isFleetHostedWorkerPath('/admin/')).toBe(false)
  })

  it('derives the gateway bridge base from /w/:workerId', () => {
    expect(resolveWorkerApiBasePath('/w/w_aaaabbbbcccd/config')).toBe('/w/w_aaaabbbbcccd/api/worker')
    expect(isFleetHostedWorkerPath('/w/w_aaaabbbbcccd/')).toBe(true)
  })

  it('ignores malformed fleet-hosted worker ids', () => {
    expect(resolveWorkerApiBasePath('/w/not-a-worker/config')).toBe('/api/worker')
  })

  it('does not double-prefix existing /api/worker paths', () => {
    expect(workerApiUrl('/api/worker/info')).toBe('/api/worker/info')
  })
})
