import type { SoulModule, SoulSchemaPack } from './module'
import { assertSoulModule } from './module'

/**
 * In-memory Soul module registry.
 *
 * Stays intentionally small: discovery, version-compat check, lookup. Domain
 * semantics live in each Soul module; Kernel components (artifact registry,
 * admission, brief compiler) consume the registry through this surface and
 * never reach into module internals directly.
 */
export class SoulRegistry {
  private readonly modules = new Map<string, SoulModule>()

  register(module: SoulModule): void {
    const validated = assertSoulModule(module)
    const id = validated.manifest.id
    if (this.modules.has(id))
      throw new Error(`SoulRegistry: duplicate Soul id "${id}"`)
    this.modules.set(id, validated)
  }

  has(id: string): boolean {
    return this.modules.has(id)
  }

  get(id: string): SoulModule | undefined {
    return this.modules.get(id)
  }

  require(id: string): SoulModule {
    const module = this.modules.get(id)
    if (!module)
      throw new Error(`SoulRegistry: unknown Soul id "${id}"`)
    return module
  }

  list(): readonly SoulModule[] {
    return Array.from(this.modules.values())
  }

  ids(): readonly string[] {
    return Array.from(this.modules.keys())
  }

  findByScopeKind(scopeKind: string): readonly SoulModule[] {
    return this.list().filter(module => module.supportedScopeKinds.includes(scopeKind))
  }

  /**
   * Reverse lookup: which Soul modules declare the given artifact type in
   * their `schemaPack.artifactTypes`. Brain Kernel does NOT enforce that an
   * artifact's `type` belongs to exactly one Soul — types may be shared
   * across Souls (PLAN-100). This helper is for UX hints (CLI / UI showing
   * "this artifact is owned by Soul X") and for PLAN-102 brief compiler
   * deciding which Soul context to load.
   */
  findByArtifactType(artifactType: string): readonly SoulModule[] {
    return this.list().filter(module => module.schemaPack.artifactTypes.includes(artifactType))
  }

  /** Reverse lookup by proposal type. Used by PLAN-101 admission service. */
  findByProposalType(proposalType: string): readonly SoulModule[] {
    return this.list().filter(module => module.schemaPack.proposalTypes.includes(proposalType))
  }

  /** Convenience accessor; throws if the Soul is not registered. */
  getSchemaPack(soulId: string): SoulSchemaPack {
    return this.require(soulId).schemaPack
  }

  size(): number {
    return this.modules.size
  }
}

/**
 * Build a fresh registry from an iterable of Soul modules. Convenience wrapper
 * for tests and downstream consumers that want their own registry instance.
 */
export function createSoulRegistry(modules: Iterable<SoulModule> = []): SoulRegistry {
  const registry = new SoulRegistry()
  for (const module of modules)
    registry.register(module)
  return registry
}
