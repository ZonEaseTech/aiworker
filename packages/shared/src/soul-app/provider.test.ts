import { describe, expect, it } from 'bun:test'

import { soulAppBrokerProviderRegistrySchema } from './provider'

describe('Soul App broker provider registry contract', () => {
  it('accepts secret-safe provider metadata for current and future Host providers', () => {
    const registry = soulAppBrokerProviderRegistrySchema.parse({
      providers: [
        {
          appScoped: true,
          capabilities: ['storage.read', 'storage.write'],
          configured: true,
          description: 'Local app-scoped metadata storage.',
          enabled: true,
          id: 'storage.local-sqlite',
          kind: 'storage',
          label: 'Local SQLite storage',
          local: true,
          status: 'active',
        },
        {
          appScoped: true,
          capabilities: ['storage.read', 'storage.write'],
          configured: false,
          description: 'Future app-scoped object storage provider.',
          enabled: false,
          id: 'storage.s3',
          kind: 'storage',
          label: 'S3 bucket storage',
          local: false,
          status: 'planned',
        },
        {
          appScoped: true,
          capabilities: ['secret.reference'],
          configured: false,
          description: 'Future secret reference resolver.',
          enabled: false,
          id: 'secret.vault-ref',
          kind: 'secret',
          label: 'Vault secret references',
          local: false,
          status: 'planned',
        },
      ],
      summary: {
        activeCount: 1,
        configuredCount: 1,
        plannedCount: 2,
        providerCount: 3,
      },
    })

    expect(registry.providers.map(provider => provider.id)).toEqual([
      'storage.local-sqlite',
      'storage.s3',
      'secret.vault-ref',
    ])
    expect(JSON.stringify(registry)).not.toContain('sk-')
    expect(JSON.stringify(registry)).not.toContain('token')
  })
})
