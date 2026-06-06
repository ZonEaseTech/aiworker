import { describe, expect, it } from 'bun:test'

import {
  assertRemoteAisshCallbackReachable,
  isLoopbackUrl,
  normalizeBaseUrl,
  resolveAdapterRuntimeControlBaseUrl,
} from './host-url-contract'

describe('Host URL contract', () => {
  it('normalizes base URLs without trailing slashes', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:9117///')).toBe('http://127.0.0.1:9117')
  })

  it('detects loopback callback URLs', () => {
    expect(isLoopbackUrl('http://localhost:9117')).toBe(true)
    expect(isLoopbackUrl('http://127.0.0.1:9117')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:9117')).toBe(true)
    expect(isLoopbackUrl('https://dev-host.example.com')).toBe(false)
  })

  it('uses docker host gateway callback when adapter type is docker', () => {
    expect(resolveAdapterRuntimeControlBaseUrl({
      adapterType: 'docker',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })).toBe('http://host.docker.internal:9117')

    expect(resolveAdapterRuntimeControlBaseUrl({
      adapterType: 'docker',
      hostControlBaseUrl: 'http://localhost:9117',
    })).toBe('http://host.docker.internal:9117')

    expect(resolveAdapterRuntimeControlBaseUrl({
      adapterType: 'docker',
      hostControlBaseUrl: 'http://[::1]:9117',
    })).toBe('http://host.docker.internal:9117')
  })

  it('requires explicit adapterRuntimeControlBaseUrl for remote aissh targets', () => {
    expect(() => resolveAdapterRuntimeControlBaseUrl({
      adapterType: 'aissh',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })).toThrow('Remote aissh target requires an explicit Host callback URL via adapterRuntimeControlBaseUrl')
  })

  it('rejects remote aissh loopback callback URL', () => {
    expect(() => assertRemoteAisshCallbackReachable({
      adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
      targetRef: 'srv-1',
    })).toThrow('Remote aissh target cannot use a loopback Host callback URL')
  })
})
