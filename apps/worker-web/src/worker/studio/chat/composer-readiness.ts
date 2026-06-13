import type { LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import type { messagesFor } from '../../../features/i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export type ComposerReadinessReason
  = | { kind: 'byok-needs-key' }
    | { kind: 'engine-missing', engineId: string }
    | { kind: 'engine-not-installed', engineName: string }

export interface ComposerReadiness {
  ready: boolean
  reason: ComposerReadinessReason | null
}

const READY: ComposerReadiness = { ready: true, reason: null }

/**
 * Derive whether the chat composer can submit, purely from the local settings
 * the Workbench already loads — no extra daemon round-trip. The Worker owns and
 * renders its own Workbench, so readiness is the employee-facing gate before the
 * native engine is reachable:
 *
 * - BYOK mode is ready once a provider, model, and an API key reference are set.
 * - Local-CLI mode is ready once the selected engine exists in local settings
 *   and is installed on PATH.
 *
 * Login state is not part of the settings snapshot and cannot be derived in the
 * browser; a logged-out-but-installed engine still backstops at runtime, so the
 * gate covers the no-engine / no-BYOK case the audit flagged, not "signed out".
 */
export function deriveComposerReadiness(settings: LocalSettingsConfig): ComposerReadiness {
  if (settings.executionMode === 'byok') {
    const ready = settings.byok.provider.trim().length > 0
      && settings.byok.model.trim().length > 0
      && settings.byok.apiKeyRef.trim().length > 0
    return ready ? READY : { ready: false, reason: { kind: 'byok-needs-key' } }
  }

  const engine = settings.engines.find(item => item.id === settings.engineId)
  if (!engine)
    return { ready: false, reason: { kind: 'engine-missing', engineId: settings.engineId } }
  if (!engine.installed)
    return { ready: false, reason: { kind: 'engine-not-installed', engineName: engine.name } }
  return READY
}

/**
 * Resolve a readiness reason into the already-translated, employee-facing
 * guidance string. Reuses the four-locale copy that previously had no consumer.
 */
export function composerReadinessMessage(
  reason: ComposerReadinessReason,
  copy: WorkerMessages,
): string {
  if (reason.kind === 'byok-needs-key')
    return copy.workspace.byokNeedsKey
  if (reason.kind === 'engine-missing')
    return copy.workspace.engineMissing(reason.engineId)
  return copy.workspace.engineNotInstalled(reason.engineName)
}
