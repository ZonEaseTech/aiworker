import type { ProvisioningAdapterType } from './host-options'

export interface ResolveAdapterRuntimeControlUrlInput {
  adapterRuntimeControlBaseUrl?: string
  adapterType: ProvisioningAdapterType
  hostControlBaseUrl: string
}

export interface RemoteAisshCallbackInput {
  adapterRuntimeControlBaseUrl: string
  targetRef: string
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0)
    throw new Error('Host base URL cannot be empty')
  const url = new URL(trimmed)
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

export function isLoopbackUrl(input: string): boolean {
  const host = new URL(input).hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function resolveAdapterRuntimeControlBaseUrl(input: ResolveAdapterRuntimeControlUrlInput): string {
  if (input.adapterRuntimeControlBaseUrl)
    return normalizeBaseUrl(input.adapterRuntimeControlBaseUrl)

  const normalizedControl = normalizeBaseUrl(input.hostControlBaseUrl)
  if (input.adapterType === 'docker' && isLoopbackUrl(normalizedControl)) {
    const url = new URL(normalizedControl)
    url.hostname = 'host.docker.internal'
    return url.toString().replace(/\/+$/, '')
  }
  return normalizedControl
}

export function assertRemoteAisshCallbackReachable(input: RemoteAisshCallbackInput): void {
  if (isLoopbackUrl(input.adapterRuntimeControlBaseUrl)) {
    throw new Error(`Remote aissh target cannot use a loopback Host callback URL: ${input.targetRef}`)
  }
}

