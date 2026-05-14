import type {
  HostedSoulApp,
  SoulAppConnectorAccess,
  SoulAppConnectorNeed,
  SoulAppPermission,
  SoulAppRegistryStatus,
  SoulAppRequiredPermission,
} from '@zonease/aiworker-shared'
import type { SoulAppRegistryContext } from './registry'

export type SoulAppSecurityReviewDescriptorSurface
  = 'shell.action'
    | 'shell.primaryAction'
    | 'shell.search'
    | 'shell.settings'
    | 'ui.artifactPreview'
    | 'ui.panel'
    | 'ui.reviewPanel'
    | 'ui.route'
    | 'ui.workspaceWidget'

export interface SoulAppSecurityReviewConnector {
  access: readonly SoulAppConnectorAccess[]
  available: boolean
  enabled: boolean
  id: string
  reason: string
  required: boolean
  scopes: readonly string[]
}

export interface SoulAppSecurityReviewDescriptor {
  id: string
  label: string
  requiredPermissions: readonly SoulAppRequiredPermission[]
  surface: SoulAppSecurityReviewDescriptorSurface
}

export interface SoulAppSecurityReviewSummary {
  canEnable: boolean
  descriptorPermissionCount: number
  disabledRequiredConnectorIds: string[]
  manifestPermissionCount: number
  missingRequiredConnectorIds: string[]
  optionalConnectorCount: number
  requiredConnectorCount: number
  warnings: string[]
}

export interface SoulAppSecurityReview {
  appId: string
  connectors: {
    optional: SoulAppSecurityReviewConnector[]
    required: SoulAppSecurityReviewConnector[]
  }
  descriptorPermissions: SoulAppSecurityReviewDescriptor[]
  healthStatus: HostedSoulApp['healthStatus']
  manifestPermissions: readonly SoulAppPermission[]
  status: SoulAppRegistryStatus
  summary: SoulAppSecurityReviewSummary
}

export function reviewSoulAppSecurity(app: HostedSoulApp, context: SoulAppRegistryContext = {}): SoulAppSecurityReview {
  const availableConnectorIds = context.availableConnectorIds ? new Set(context.availableConnectorIds) : null
  const enabledConnectorIds = context.enabledConnectorIds ? new Set(context.enabledConnectorIds) : null
  const requiredConnectors = app.manifest.connectors.required.map(connector =>
    reviewConnector(connector, true, availableConnectorIds, enabledConnectorIds),
  )
  const optionalConnectors = app.manifest.connectors.optional.map(connector =>
    reviewConnector(connector, false, availableConnectorIds, enabledConnectorIds),
  )
  const descriptorPermissions = collectDescriptorPermissions(app)
  const missingRequiredConnectorIds = requiredConnectors
    .filter(connector => !connector.available)
    .map(connector => connector.id)
  const disabledRequiredConnectorIds = requiredConnectors
    .filter(connector => connector.available && !connector.enabled)
    .map(connector => connector.id)
  const warnings: string[] = []
  if (missingRequiredConnectorIds.length > 0) {
    warnings.push(`Required connectors are not available: ${missingRequiredConnectorIds.join(', ')}`)
  }
  if (disabledRequiredConnectorIds.length > 0) {
    warnings.push(`Required connectors are not enabled: ${disabledRequiredConnectorIds.join(', ')}`)
  }

  return {
    appId: app.appId,
    connectors: {
      optional: optionalConnectors,
      required: requiredConnectors,
    },
    descriptorPermissions,
    healthStatus: app.healthStatus,
    manifestPermissions: app.manifest.permissions,
    status: app.status,
    summary: {
      canEnable: app.status !== 'error' && missingRequiredConnectorIds.length === 0,
      descriptorPermissionCount: descriptorPermissions.reduce((count, descriptor) => count + descriptor.requiredPermissions.length, 0),
      disabledRequiredConnectorIds,
      manifestPermissionCount: app.manifest.permissions.length,
      missingRequiredConnectorIds,
      optionalConnectorCount: optionalConnectors.length,
      requiredConnectorCount: requiredConnectors.length,
      warnings,
    },
  }
}

function reviewConnector(
  connector: SoulAppConnectorNeed,
  required: boolean,
  availableConnectorIds: ReadonlySet<string> | null,
  enabledConnectorIds: ReadonlySet<string> | null,
): SoulAppSecurityReviewConnector {
  return {
    access: connector.access,
    available: availableConnectorIds ? availableConnectorIds.has(connector.id) : true,
    enabled: enabledConnectorIds ? enabledConnectorIds.has(connector.id) : false,
    id: connector.id,
    reason: connector.reason,
    required,
    scopes: connector.scopes,
  }
}

function collectDescriptorPermissions(app: HostedSoulApp): SoulAppSecurityReviewDescriptor[] {
  const shell = app.manifest.ui.shell
  const descriptors: SoulAppSecurityReviewDescriptor[] = []
  if (shell?.primaryAction?.requiredPermissions?.length) {
    descriptors.push({
      id: shell.primaryAction.id,
      label: shell.primaryAction.label,
      requiredPermissions: shell.primaryAction.requiredPermissions,
      surface: 'shell.primaryAction',
    })
  }
  for (const action of shell?.actions ?? []) {
    if (action.requiredPermissions?.length) {
      descriptors.push({
        id: action.id,
        label: action.label,
        requiredPermissions: action.requiredPermissions,
        surface: 'shell.action',
      })
    }
  }
  if (shell?.search?.requiredPermissions?.length) {
    descriptors.push({
      id: shell.search.id,
      label: shell.search.label,
      requiredPermissions: shell.search.requiredPermissions,
      surface: 'shell.search',
    })
  }
  if (shell?.settings?.requiredPermissions?.length) {
    descriptors.push({
      id: shell.settings.id,
      label: shell.settings.label,
      requiredPermissions: shell.settings.requiredPermissions,
      surface: 'shell.settings',
    })
  }

  for (const route of app.manifest.ui.routes) {
    if (route.surface?.requiredPermissions?.length) {
      descriptors.push({
        id: route.id,
        label: route.label,
        requiredPermissions: route.surface.requiredPermissions,
        surface: 'ui.route',
      })
    }
  }
  for (const contribution of app.manifest.ui.panels) {
    if (contribution.surface?.requiredPermissions?.length) {
      descriptors.push({
        id: contribution.id,
        label: contribution.label,
        requiredPermissions: contribution.surface.requiredPermissions,
        surface: 'ui.panel',
      })
    }
  }
  for (const contribution of app.manifest.ui.artifactPreviews) {
    if (contribution.surface?.requiredPermissions?.length) {
      descriptors.push({
        id: contribution.id,
        label: contribution.label,
        requiredPermissions: contribution.surface.requiredPermissions,
        surface: 'ui.artifactPreview',
      })
    }
  }
  for (const contribution of app.manifest.ui.reviewPanels) {
    if (contribution.surface?.requiredPermissions?.length) {
      descriptors.push({
        id: contribution.id,
        label: contribution.label,
        requiredPermissions: contribution.surface.requiredPermissions,
        surface: 'ui.reviewPanel',
      })
    }
  }
  for (const contribution of app.manifest.ui.workspaceWidgets ?? []) {
    if (contribution.surface?.requiredPermissions?.length) {
      descriptors.push({
        id: contribution.id,
        label: contribution.label,
        requiredPermissions: contribution.surface.requiredPermissions,
        surface: 'ui.workspaceWidget',
      })
    }
  }
  return descriptors
}
