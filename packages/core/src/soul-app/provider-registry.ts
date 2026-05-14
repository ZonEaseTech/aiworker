import type {
  SoulAppBrokerProvider,
  SoulAppBrokerProviderRegistry,
  SoulAppBrokerProviderStatus,
} from '@zonease/aiworker-shared'

export interface SoulAppConnectorProviderConfig {
  enabled: boolean
  id: string
  name: string
  status: 'configured' | 'not_configured'
}

export interface SoulAppBrokerProviderRegistryContext {
  connectors?: readonly SoulAppConnectorProviderConfig[]
}

export function listSoulAppBrokerProviders(context: SoulAppBrokerProviderRegistryContext = {}): SoulAppBrokerProviderRegistry {
  const providers: SoulAppBrokerProvider[] = [
    {
      appScoped: true,
      capabilities: ['storage.read', 'storage.write', 'storage.list'],
      configured: true,
      description: 'Local app-scoped Soul App storage backed by worker.db metadata records.',
      enabled: true,
      id: 'storage.local-sqlite',
      kind: 'storage',
      label: 'Local SQLite storage',
      local: true,
      status: 'active',
    },
    {
      appScoped: true,
      capabilities: ['storage.read', 'storage.write', 'storage.list'],
      configured: false,
      description: 'Future app-scoped object storage provider for S3-compatible buckets.',
      enabled: false,
      id: 'storage.s3',
      kind: 'storage',
      label: 'S3 bucket storage',
      local: false,
      notes: ['Planned provider metadata only; no cloud SDK is loaded by the local Host.'],
      status: 'planned',
    },
    {
      appScoped: true,
      capabilities: ['storage.read', 'storage.write', 'storage.list'],
      configured: false,
      description: 'Future app-scoped object storage provider for Google Cloud Storage buckets.',
      enabled: false,
      id: 'storage.gcp-bucket',
      kind: 'storage',
      label: 'GCP bucket storage',
      local: false,
      notes: ['Planned provider metadata only; no cloud SDK is loaded by the local Host.'],
      status: 'planned',
    },
    {
      appScoped: true,
      capabilities: ['audit.read', 'audit.write'],
      configured: true,
      description: 'Local Host audit ledger for broker decisions and platform actions.',
      enabled: true,
      id: 'audit.local-sqlite',
      kind: 'audit',
      label: 'Local SQLite audit ledger',
      local: true,
      status: 'active',
    },
    {
      appScoped: true,
      capabilities: ['secret.reference'],
      configured: false,
      description: 'Future secret reference resolver for app-scoped broker grants.',
      enabled: false,
      id: 'secret.vault-ref',
      kind: 'secret',
      label: 'Vault secret references',
      local: false,
      notes: ['Planned provider metadata only; registry never returns raw secret values.'],
      status: 'planned',
    },
    ...(context.connectors ?? []).map(connectorProvider),
  ]

  return {
    providers,
    summary: {
      activeCount: providers.filter(provider => provider.status === 'active').length,
      configuredCount: providers.filter(provider => provider.configured).length,
      plannedCount: providers.filter(provider => provider.status === 'planned').length,
      providerCount: providers.length,
    },
  }
}

function connectorProvider(connector: SoulAppConnectorProviderConfig): SoulAppBrokerProvider {
  const configured = connector.status === 'configured'
  const status: SoulAppBrokerProviderStatus = configured
    ? connector.enabled ? 'active' : 'disabled'
    : 'not_configured'
  return {
    appScoped: true,
    capabilities: ['connector.read'],
    configured,
    description: `Host connector broker metadata for ${connector.name}.`,
    enabled: connector.enabled,
    id: `connector.${connector.id}`,
    kind: 'connector',
    label: connector.name,
    local: false,
    status,
  }
}
