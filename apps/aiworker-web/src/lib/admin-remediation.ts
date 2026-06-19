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
    detail: '请从当前页面按钮重新操作，系统拒绝了不完整的操作请求。',
    nextSteps: ['刷新页面后重试。', '如果仍失败，把错误码交给技术支持。'],
    severity: 'warning',
    title: '操作请求不完整',
  },
  admin_auth_misconfigured: {
    detail: '登录系统配置不完整，因此页面不会开放管理操作。',
    nextSteps: ['请技术支持检查登录系统配置。', '配置修复后重启 AIWorker Web。'],
    severity: 'destructive',
    title: '登录配置需要技术支持处理',
  },
  admin_auth_required: {
    detail: '你需要先登录管理员账号，才能查看或修改开通信息。',
    nextSteps: ['点击登录按钮完成管理员登录。', '如果没有登录入口，请联系技术支持。'],
    severity: 'destructive',
    title: '需要管理员登录',
  },
  admin_token_required: {
    detail: '当前环境需要管理员访问口令，才能保存开通操作。',
    nextSteps: ['在“技术设置”中输入管理员口令。', '如果口令已变更，请技术支持重启服务。'],
    severity: 'destructive',
    title: '需要管理员口令',
  },
  aissh_token_missing: {
    detail: '系统还不能连接员工设备，缺少必要的后台连接凭据。',
    nextSteps: ['请技术支持补齐设备连接凭据。', '凭据更新后重启 AIWorker Web。'],
    severity: 'destructive',
    title: '员工设备连接未配置',
  },
  aissh_unavailable: {
    detail: '系统无法连接所选员工设备。',
    nextSteps: ['请技术支持检查设备连接工具是否可用。', '连接恢复后再重试开通。'],
    severity: 'destructive',
    title: '员工设备暂时无法连接',
  },
  approval_required: {
    detail: '需要先确认本次开通内容，才能继续执行。',
    nextSteps: ['检查员工、能力模板和设备信息。', '确认无误后点击“确认开通”。'],
    severity: 'warning',
    title: '请先确认开通内容',
  },
  assignment_metadata_missing: {
    detail: '这条员工开通记录缺少必要信息，无法继续。',
    nextSteps: ['刷新页面后重试。', '如果仍失败，请技术支持检查员工、设备和能力模板配置。'],
    severity: 'destructive',
    title: '开通信息不完整',
  },
  assignment_not_found: {
    detail: '系统没有找到这条员工开通记录。',
    nextSteps: ['刷新页面后重试。', '如果这位员工刚被添加，请稍后再试或联系技术支持。'],
    severity: 'warning',
    title: '员工开通记录不存在',
  },
  control_plane_dir_required: {
    detail: '当前是演示数据模式，操作只会在本页预览，不会保存。',
    nextSteps: ['需要正式使用时，请技术支持连接真实数据目录。', '演示模式可用于熟悉页面流程。'],
    severity: 'warning',
    title: '当前为演示模式',
  },
  control_plane_snapshot_required: {
    detail: '系统还没有可保存的员工开通数据。',
    nextSteps: ['请技术支持初始化管理数据。', '数据准备好后刷新页面。'],
    severity: 'warning',
    title: '管理数据尚未准备好',
  },
  control_plane_unavailable: {
    detail: '系统暂时无法读取真实管理数据。',
    nextSteps: ['刷新页面重试。', '如果仍失败，请技术支持检查服务和数据目录。'],
    severity: 'destructive',
    title: '管理数据暂时不可用',
  },
  handoff_not_ready: {
    detail: '还不能生成员工入口，需要先完成开通。',
    nextSteps: ['先点击“开始开通”。', '开通完成后再生成一次性入口。'],
    severity: 'warning',
    title: '请先完成开通',
  },
  paseo_daemon_unavailable: {
    detail: '员工设备可连接，但 Paseo 服务暂时不可用。',
    nextSteps: ['请技术支持检查员工设备上的 Paseo。', '修复后再重试开通。'],
    severity: 'destructive',
    title: '员工设备上的 Paseo 未就绪',
  },
  paseo_unavailable: {
    detail: '员工设备上还没有可用的 Paseo。',
    nextSteps: ['请技术支持安装或修复 Paseo。', 'Paseo 可用后再重试开通。'],
    severity: 'destructive',
    title: 'Paseo 未安装或不可用',
  },
  pair_command_failed: {
    detail: '一次性入口没有生成成功。',
    nextSteps: ['确认已完成开通后重试。', '如果仍失败，请技术支持检查员工设备上的 Paseo。'],
    severity: 'destructive',
    title: '生成员工入口失败',
  },
  provider_auth_required: {
    detail: '员工工作区已准备，但后台 AI 账号还需要登录或授权。',
    nextSteps: ['请技术支持在员工设备上完成 AI 账号登录。', '授权完成后再让员工开始使用。'],
    severity: 'warning',
    title: '后台 AI 账号需要授权',
  },
  same_origin_required: {
    detail: '出于安全原因，系统拒绝了来自其他页面的保存请求。',
    nextSteps: ['请从当前 AIWorker Web 页面重新操作。', '不要从其他网站或脚本提交管理操作。'],
    severity: 'destructive',
    title: '请从当前页面操作',
  },
  soul_descriptor_missing: {
    detail: '所选能力模板暂时不可用。',
    nextSteps: ['请选择已发布的能力模板。', '如果模板应该可用，请技术支持重新发布。'],
    severity: 'destructive',
    title: '能力模板不可用',
  },
  unknown_admin_error: {
    detail: '操作失败，系统没有识别出更具体的原因。',
    nextSteps: ['刷新页面后重试。', '如果仍失败，把错误码交给技术支持。'],
    severity: 'destructive',
    title: '操作失败',
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
