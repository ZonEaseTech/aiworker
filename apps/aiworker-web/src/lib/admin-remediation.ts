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
    detail: '该操作必须来自 AIWorker 管理控制台的变更路径。',
    nextSteps: ['重新加载管理控制台，并从页面按钮重试该操作。', '不要在缺少管理操作请求头的情况下直接调用变更端点。'],
    severity: 'warning',
    title: '缺少管理操作确认',
  },
  admin_auth_misconfigured: {
    detail: 'Logto 运行时变量只配置了一部分，因此 AIWorker Web 拒绝暴露管理界面。',
    nextSteps: ['运行 bun scripts/setup-logto.mjs 创建或刷新 Logto 应用。', '在生成的 .env 值就位后重启 AIWorker Web。'],
    severity: 'destructive',
    title: '管理认证配置有误',
  },
  admin_auth_required: {
    detail: '该 AIWorker Web 界面需要 Logto 管理会话或有效的自动化管理 token。',
    nextSteps: ['通过 Logto 登录页登录。', '若用于自动化，请将配置的 AIWORKER_WEB_ADMIN_TOKEN 作为 bearer token 发送。'],
    severity: 'destructive',
    title: '需要管理认证',
  },
  admin_token_required: {
    detail: '该 Web 服务在变更 control-plane 记录前需要配置的管理 token。',
    nextSteps: ['在控制台 bootstrap 面板中输入当前的 AIWORKER_WEB_ADMIN_TOKEN。', '若环境中的 token 已变更，请重启服务。'],
    severity: 'destructive',
    title: '需要管理 token',
  },
  aissh_token_missing: {
    detail: '真实的 aissh 执行需要服务环境中的 AISSH_TOKEN。',
    nextSteps: ['在忽略的运行时环境或密钥管理器中设置 AISSH_TOKEN。', '更新服务环境后重启 AIWorker Web。'],
    severity: 'destructive',
    title: 'aissh token 未配置',
  },
  aissh_unavailable: {
    detail: 'AIWorker 无法为所选目标解析或执行 aissh CLI。',
    nextSteps: ['安装可选的 aissh-cli 依赖或设置 AISSH_BIN。', '重试 apply 前先在本地运行 aiworker doctor 验证 aissh 解析。'],
    severity: 'destructive',
    title: 'aissh 不可用',
  },
  approval_required: {
    detail: '在该 Assignment 的审批被记录为已批准之前，apply 与配对都会被阻断。',
    nextSteps: ['在 Approval gate 中批准该 Assignment。', '若处于 fixture 模式，请先绑定 AIWORKER_CONTROL_PLANE_DIR 再期望持久化。'],
    severity: 'warning',
    title: '需先完成审批',
  },
  assignment_metadata_missing: {
    detail: '该 Assignment 无法执行，因为 Paseo environment、Provider profile 或 Soul 元数据不完整。',
    nextSteps: ['刷新 control-plane 快照。', '确认该 Assignment 引用了已存在的 Paseo environment、Provider profile 和 Soul release。'],
    severity: 'destructive',
    title: 'Assignment 元数据不完整',
  },
  assignment_not_found: {
    detail: '所选的 Assignment id 不在已绑定的 control-plane 快照中。',
    nextSteps: ['重新加载管理控制台。', '重新生成或重新绑定包含该 Assignment 的 control-plane 快照。'],
    severity: 'warning',
    title: '未找到该 Assignment',
  },
  control_plane_dir_required: {
    detail: '持久化的审批 / apply / 配对操作需要 Web 服务上设置 AIWORKER_CONTROL_PLANE_DIR。',
    nextSteps: ['以 AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane 启动 Web。', 'fixture 模式仅用于预览界面，不要用于真实审批。'],
    severity: 'warning',
    title: '未绑定 control-plane 目录',
  },
  control_plane_snapshot_required: {
    detail: 'Web API 在执行 Assignment 变更前需要一个 control-plane 快照。',
    nextSteps: ['运行带 --control-plane-dir 的 aiworker plan/apply 以创建快照。', '快照存在后重启或重新加载 Web。'],
    severity: 'warning',
    title: '缺少 control-plane 快照',
  },
  control_plane_unavailable: {
    detail: 'AIWorker Web 无法加载已绑定的 control-plane 数据。这是真实数据加载失败，而非 fixture 预览模式。',
    nextSteps: ['检查 AIWORKER_CONTROL_PLANE_DIR 是否指向可读的 AIWorker control-plane 目录。', '修复快照或服务错误后，在执行真实审批 / apply / 配对前重新加载。'],
    severity: 'destructive',
    title: 'control-plane 不可用',
  },
  handoff_not_ready: {
    detail: '在 apply 生成 applied receipt 与 handoff-ready 的 Assignment 元数据之前，配对会被阻断。',
    nextSteps: ['先运行已批准的 apply 操作。', '确认 control-plane 快照中包含同一 Assignment 组合的 applied receipt。'],
    severity: 'warning',
    title: '配对前必须先完成 apply',
  },
  paseo_daemon_unavailable: {
    detail: '目标已响应，但无法为已准备好的 HOME/PASEO_HOME 连接到 Paseo daemon。',
    nextSteps: ['确认 Paseo 已安装在目标用户 HOME 下。', '以相同的 aissh 身份启动或修复 Paseo daemon，然后重试 apply。'],
    severity: 'destructive',
    title: 'Paseo daemon 无法连接',
  },
  paseo_unavailable: {
    detail: '目标上似乎没有可用的 Paseo CLI 安装。',
    nextSteps: ['为目标用户安装或修复 @getpaseo/cli。', '在 Paseo CLI 出现在 PATH 上后重试 apply。'],
    severity: 'destructive',
    title: 'Paseo CLI 不可用',
  },
  pair_command_failed: {
    detail: '临时配对请求在 AIWorker 能展示当前配对响应之前就失败了。',
    nextSteps: ['先运行 apply 并验证 handoff-ready 的 receipt。', '以相同的 aissh 身份检查目标 Paseo daemon 状态。'],
    severity: 'destructive',
    title: '配对请求失败',
  },
  provider_auth_required: {
    detail: 'workspace 投影可能已完成，但所选 Provider CLI 在员工使用前仍需在目标侧登录或设置。',
    nextSteps: ['以目标用户身份登录该 Provider CLI。', '在该 Provider 在 Paseo 中可用后重试 Provider 就绪检查。'],
    severity: 'warning',
    title: 'Provider 需要在目标侧设置',
  },
  same_origin_required: {
    detail: '变更请求的来源与 AIWorker Web 服务来源不匹配。',
    nextSteps: ['使用从同一 host 和端口提供的管理控制台。', '不要从其他站点发送会改变状态的请求。'],
    severity: 'destructive',
    title: '变更请求必须同源',
  },
  soul_descriptor_missing: {
    detail: '所选 Soul release 的 descriptorRef 没有指向可读的本地 descriptor 文件。',
    nextSteps: ['构建该 Soul release，使 dist/soul.descriptor.json 存在。', '若 release 已移动，请更新 control-plane 快照中的 descriptorRef。'],
    severity: 'destructive',
    title: '缺少 Soul descriptor',
  },
  unknown_admin_error: {
    detail: '管理操作在 AIWorker 能归类出更安全、更具体的原因之前就失败了。',
    nextSteps: ['重新加载管理控制台后重试。', '在终端中运行等价的 aiworker CLI 命令进行本地诊断。'],
    severity: 'destructive',
    title: '管理操作失败',
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
