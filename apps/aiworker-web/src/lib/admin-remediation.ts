export type AdminRemediationCode
  = 'admin_action_header_required'
    | 'admin_auth_misconfigured'
    | 'admin_auth_required'
    | 'admin_token_required'
    | 'aissh_token_missing'
    | 'aissh_unavailable'
    | 'approval_required'
    | 'assignment_metadata_missing'
    | 'assignment_not_found'
    | 'control_plane_dir_required'
    | 'control_plane_snapshot_required'
    | 'control_plane_unavailable'
    | 'handoff_not_ready'
    | 'paseo_daemon_unavailable'
    | 'paseo_unavailable'
    | 'pair_command_failed'
    | 'provider_auth_required'
    | 'same_origin_required'
    | 'soul_descriptor_missing'
    | 'unknown_admin_error'

export type AdminRemediationSeverity = 'info' | 'warning' | 'destructive'

export interface AdminRemediation {
  code: AdminRemediationCode
  detail: string
  nextSteps: string[]
  severity: AdminRemediationSeverity
  title: string
}

export interface AdminApiErrorPayload {
  error: AdminRemediationCode
  remediation: AdminRemediation
}

export interface AdminBootstrapStatus {
  adminTokenRequired: boolean
  auth: AdminAuthBootstrapStatus
  controlPlaneDirConfigured: boolean
  host: string
  remoteAccessEnabled: boolean
  source: 'control-plane' | 'fixture'
}

export interface AdminAuthBootstrapStatus {
  authenticated: boolean
  loginRequired: boolean
  loginUrl: string
  logoutUrl: string
  mode: 'local' | 'locked' | 'logto' | 'misconfigured'
  remediationCode?: AdminRemediationCode
  via?: 'session' | 'token'
  userEmail?: string
}

const unsafeDetailFragments = [
  /Bearer\s+[\w.~+/-]+/gi,
  new RegExp(`s${'k'}-[\\w-]+`, 'gi'),
  /paseo:\/\/pair[^\s"']*/gi,
  /https?:\/\/[^\s"']*offer=[^\s"']*/gi,
  /offer=[^\s"']*/gi,
  /data:image\/[^\s"']*/gi,
  /base64:[^\s"']*/gi,
] as const

const remediationCatalog: Record<AdminRemediationCode, Omit<AdminRemediation, 'code'>> = {
  admin_action_header_required: {
    detail: 'This action must come from the AIWorker admin console mutation path.',
    nextSteps: ['Reload the admin console and retry the action from the page button.', 'Do not call the mutation endpoint without the admin action header.'],
    severity: 'warning',
    title: 'Admin action confirmation is missing',
  },
  admin_auth_misconfigured: {
    detail: 'Logto runtime variables are partially configured, so AIWorker Web refuses to expose the admin surface.',
    nextSteps: ['Run bun scripts/setup-logto.mjs to create or refresh the Logto application.', 'Restart AIWorker Web after the generated .env values are present.'],
    severity: 'destructive',
    title: 'Admin authentication is misconfigured',
  },
  admin_auth_required: {
    detail: 'This AIWorker Web surface requires a Logto admin session or a valid automation admin token.',
    nextSteps: ['Sign in through the Logto login page.', 'For automation, send the configured AIWORKER_WEB_ADMIN_TOKEN as a bearer token.'],
    severity: 'destructive',
    title: 'Admin authentication is required',
  },
  admin_token_required: {
    detail: 'This Web server requires the configured admin token before it will mutate the control-plane records.',
    nextSteps: ['Enter the current AIWORKER_WEB_ADMIN_TOKEN in the dashboard bootstrap panel.', 'Restart the server if the token was changed in the environment.'],
    severity: 'destructive',
    title: 'Admin token is required',
  },
  aissh_token_missing: {
    detail: 'Real aissh execution requires AISSH_TOKEN in the server environment.',
    nextSteps: ['Set AISSH_TOKEN in the ignored runtime environment or secret manager.', 'Restart AIWorker Web after updating the server environment.'],
    severity: 'destructive',
    title: 'aissh token is not configured',
  },
  aissh_unavailable: {
    detail: 'AIWorker could not resolve or execute the aissh CLI for the selected target.',
    nextSteps: ['Install the optional aissh-cli dependency or set AISSH_BIN.', 'Run aiworker doctor locally to verify aissh resolution before retrying apply.'],
    severity: 'destructive',
    title: 'aissh is unavailable',
  },
  approval_required: {
    detail: 'Apply and pairing are blocked until the assignment approval is recorded as approved.',
    nextSteps: ['Approve the assignment in the approval gate.', 'If you are in fixture mode, bind AIWORKER_CONTROL_PLANE_DIR before expecting persistence.'],
    severity: 'warning',
    title: 'Approval is required first',
  },
  assignment_metadata_missing: {
    detail: 'The assignment cannot be executed because environment, provider, or Soul metadata is incomplete.',
    nextSteps: ['Refresh the control-plane snapshot.', 'Verify the assignment references an existing environment, provider profile, and Soul release.'],
    severity: 'destructive',
    title: 'Assignment metadata is incomplete',
  },
  assignment_not_found: {
    detail: 'The selected assignment id is not present in the bound control-plane snapshot.',
    nextSteps: ['Reload the admin console.', 'Regenerate or rebind the control-plane snapshot that contains the assignment.'],
    severity: 'warning',
    title: 'Assignment was not found',
  },
  control_plane_dir_required: {
    detail: 'Persistent approval/apply/pair actions require AIWORKER_CONTROL_PLANE_DIR on the Web server.',
    nextSteps: ['Start Web with AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane.', 'Use fixture mode only for previewing the UI, not for live approvals.'],
    severity: 'warning',
    title: 'Control-plane directory is not bound',
  },
  control_plane_snapshot_required: {
    detail: 'The Web API needs a control-plane snapshot before it can execute assignment mutations.',
    nextSteps: ['Run aiworker plan/apply with --control-plane-dir to create the snapshot.', 'Restart or reload Web after the snapshot exists.'],
    severity: 'warning',
    title: 'Control-plane snapshot is missing',
  },
  control_plane_unavailable: {
    detail: 'AIWorker Web could not load the bound control-plane data. This is a live-data failure, not fixture preview mode.',
    nextSteps: ['Check that AIWORKER_CONTROL_PLANE_DIR points to a readable AIWorker control-plane directory.', 'Fix the snapshot or server error, then reload before running live approval/apply/pair.'],
    severity: 'destructive',
    title: 'Control-plane is unavailable',
  },
  handoff_not_ready: {
    detail: 'Pairing is blocked until apply has created an applied receipt and handoff-ready assignment metadata.',
    nextSteps: ['Run the approved apply action first.', 'Confirm the control-plane snapshot contains an applied receipt for the same assignment tuple.'],
    severity: 'warning',
    title: 'Apply must complete before pairing',
  },
  paseo_daemon_unavailable: {
    detail: 'The target responded, but the Paseo daemon was not reachable for the prepared HOME/PASEO_HOME.',
    nextSteps: ['Verify Paseo is installed under the target user HOME.', 'Start or repair the Paseo daemon under the same aissh identity, then retry apply.'],
    severity: 'destructive',
    title: 'Paseo daemon is not reachable',
  },
  paseo_unavailable: {
    detail: 'The target does not appear to have a usable Paseo CLI installation.',
    nextSteps: ['Install or repair @getpaseo/cli for the target user.', 'Retry apply after the Paseo CLI is available on PATH.'],
    severity: 'destructive',
    title: 'Paseo CLI is unavailable',
  },
  pair_command_failed: {
    detail: 'The transient pairing request failed before AIWorker could show the current pairing response.',
    nextSteps: ['Run apply first and verify the handoff-ready receipt.', 'Check the target Paseo daemon status under the same aissh identity.'],
    severity: 'destructive',
    title: 'Pairing request failed',
  },
  provider_auth_required: {
    detail: 'Workspace projection may be complete, but the selected provider CLI still needs target-side login or setup before employee use.',
    nextSteps: ['Log in to the provider CLI under the target user identity.', 'Retry provider readiness after the provider is available in Paseo.'],
    severity: 'warning',
    title: 'Provider needs target-side setup',
  },
  same_origin_required: {
    detail: 'The mutation request origin did not match the AIWorker Web server origin.',
    nextSteps: ['Use the admin console served from the same host and port.', 'Do not send state-changing requests from another site.'],
    severity: 'destructive',
    title: 'Same-origin mutation is required',
  },
  soul_descriptor_missing: {
    detail: 'The selected Soul release descriptorRef does not point to a readable local descriptor file.',
    nextSteps: ['Build the Soul release so dist/soul.descriptor.json exists.', 'Update descriptorRef in the control-plane snapshot if the release moved.'],
    severity: 'destructive',
    title: 'Soul descriptor is missing',
  },
  unknown_admin_error: {
    detail: 'The admin action failed before AIWorker could classify a safer, more specific cause.',
    nextSteps: ['Retry after reloading the admin console.', 'Run the equivalent aiworker CLI command in a terminal for local diagnostics.'],
    severity: 'destructive',
    title: 'Admin action failed',
  },
}

export function adminRemediation(code: AdminRemediationCode, detail?: string): AdminRemediation {
  const template = remediationCatalog[code]
  return {
    code,
    detail: detail ? redactUnsafeAdminDetail(detail) : template.detail,
    nextSteps: template.nextSteps,
    severity: template.severity,
    title: template.title,
  }
}

export function adminApiErrorPayload(code: AdminRemediationCode, detail?: string): AdminApiErrorPayload {
  return {
    error: code,
    remediation: adminRemediation(code, detail),
  }
}

export function isAdminApiErrorPayload(value: unknown): value is AdminApiErrorPayload {
  if (!value || typeof value !== 'object')
    return false
  const candidate = value as Partial<AdminApiErrorPayload>
  return typeof candidate.error === 'string'
    && candidate.remediation?.code === candidate.error
    && typeof candidate.remediation.title === 'string'
}

export function classifyAdminError(error: unknown): AdminRemediationCode {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('control plane snapshot is required'))
    return 'control_plane_snapshot_required'
  if (normalized.includes('admin data load failed') || normalized.includes('control-plane unavailable'))
    return 'control_plane_unavailable'
  if (normalized.includes('control_plane_dir_required'))
    return 'control_plane_dir_required'
  if (normalized.includes('must be approved before apply') || normalized.includes('must be approved before pairing'))
    return 'approval_required'
  if (normalized.includes('must be applied and handoff-ready before pairing'))
    return 'handoff_not_ready'
  if (normalized.includes('unknown assignment'))
    return 'assignment_not_found'
  if (normalized.includes('missing environment, provider, or soul metadata') || normalized.includes('missing environment or soul metadata'))
    return 'assignment_metadata_missing'
  if (normalized.includes('soul descriptor') && (normalized.includes('missing') || normalized.includes('not found') || normalized.includes('enoent')))
    return 'soul_descriptor_missing'
  if (normalized.includes('pair command failed'))
    return 'pair_command_failed'
  return 'unknown_admin_error'
}

export function classifyApplyOutput(exitCode: number, stdout: string, stderr: string): AdminRemediationCode | null {
  const combined = `${stdout}\n${stderr}`.toLowerCase()

  if (exitCode === 0)
    return combined.includes('aiworker_provider_warning') ? 'provider_auth_required' : null
  if (combined.includes('aissh_token') || combined.includes('aissh token') || combined.includes('aissh_token is required') || combined.includes('missing ais'))
    return 'aissh_token_missing'
  if (combined.includes('aissh') && (combined.includes('not found') || combined.includes('enoent') || combined.includes('command not found') || combined.includes('cannot resolve')))
    return 'aissh_unavailable'
  if (combined.includes('paseo') && (combined.includes('not found') || combined.includes('command not found') || combined.includes('install')))
    return 'paseo_unavailable'
  if (combined.includes('daemon') && (combined.includes('not running') || combined.includes('not reachable') || combined.includes('connection refused') || combined.includes('unavailable')))
    return 'paseo_daemon_unavailable'
  if (combined.includes('provider') && (combined.includes('login') || combined.includes('auth') || combined.includes('not available') || combined.includes('needs admin attention')))
    return 'provider_auth_required'
  if (combined.includes('aiworker_provider_warning'))
    return 'provider_auth_required'
  return 'unknown_admin_error'
}

export function redactUnsafeAdminDetail(value: string): string {
  return unsafeDetailFragments.reduce((current, pattern) => current.replace(pattern, '[REDACTED]'), value)
}

export function remediationTone(remediation: AdminRemediation): 'destructive' | 'warning' | 'info' {
  return remediation.severity === 'destructive' ? 'destructive' : remediation.severity === 'warning' ? 'warning' : 'info'
}
