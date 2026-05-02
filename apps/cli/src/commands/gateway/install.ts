import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import consola from 'consola'

/**
 * `aiworker gateway install systemd` renders a hardened systemd unit and optionally
 * registers it with `systemctl daemon-reload + enable --now`.
 */

export type SystemdScope = 'user' | 'system'

export interface RenderSystemdUnitOptions {
  scope: SystemdScope
  /** Full systemd ExecStart command, already escaped for systemd syntax. */
  execStart?: string
}

const SERVICE_NAME = 'aiworker-gateway.service'
const SYSTEM_DATA_DIR = '/var/lib/aiworker'
const SYSTEM_ENV_FILE = '/etc/aiworker/gateway.env'
const USER_ENV_FILE = '%h/.config/aiworker/gateway.env'
const USER_DATA_DIR = '%S/aiworker'
const DOCUMENTATION_URL = 'https://github.com/ZonEaseTech/aiworker/blob/main/docs/deployment.md'
const DEFAULT_GATEWAY_ARGS = ['gateway', 'start'] as const

export interface ResolveCurrentExecStartOptions {
  execPath?: string
  argv?: string[]
  env?: NodeJS.ProcessEnv
  cwd?: string
  pathExists?: (candidate: string) => boolean
}

export function renderSystemdUnit(opts: RenderSystemdUnitOptions): string {
  const execStart = normalizeExecStart(opts.execStart ?? resolveCurrentExecStart())
  if (opts.scope === 'user') {
    return [
      '[Unit]',
      'Description=AIWorker gateway daemon (user instance)',
      `Documentation=${DOCUMENTATION_URL}`,
      'After=network-online.target',
      'Wants=network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `Environment=AIWORKER_HOME=${USER_DATA_DIR}`,
      `EnvironmentFile=-${USER_ENV_FILE}`,
      `ExecStart=${execStart}`,
      'Restart=on-failure',
      'RestartSec=5',
      'StateDirectory=aiworker',
      'StateDirectoryMode=0700',
      'PrivateTmp=true',
      'ProtectSystem=strict',
      `ReadWritePaths=${USER_DATA_DIR}`,
      'NoNewPrivileges=true',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n')
  }
  return [
    '[Unit]',
    'Description=AIWorker gateway daemon (PLAN-016 systemd path)',
    `Documentation=${DOCUMENTATION_URL}`,
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `Environment=AIWORKER_HOME=${SYSTEM_DATA_DIR}`,
    `EnvironmentFile=-${SYSTEM_ENV_FILE}`,
    `ExecStart=${execStart}`,
    'Restart=on-failure',
    'RestartSec=5',
    'User=root',
    'Group=root',
    'StateDirectory=aiworker',
    'StateDirectoryMode=0700',
    'PrivateTmp=true',
    'ProtectSystem=strict',
    `ReadWritePaths=${SYSTEM_DATA_DIR}`,
    'NoNewPrivileges=true',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n')
}

export function resolveCurrentExecStart(opts: ResolveCurrentExecStartOptions = {}): string {
  const env = opts.env ?? process.env
  const execPath = opts.execPath ?? process.execPath
  const argv = opts.argv ?? process.argv
  const cwd = opts.cwd ?? process.cwd()
  const pathExists = opts.pathExists ?? existsSync
  const scriptPath = resolveExistingPath(argv[1], cwd, pathExists)

  if (isBunRuntime(execPath) && scriptPath !== undefined)
    return renderExecStartCommand(execPath, [scriptPath, ...DEFAULT_GATEWAY_ARGS])

  if (isLikelyAiworkerExecutable(execPath))
    return renderExecStartCommand(execPath, [...DEFAULT_GATEWAY_ARGS])

  const pathCommand = findOnPath('aiworker', env.PATH, pathExists)
  if (pathCommand !== undefined)
    return renderExecStartCommand(pathCommand, [...DEFAULT_GATEWAY_ARGS])

  if (scriptPath !== undefined)
    return renderExecStartCommand(scriptPath, [...DEFAULT_GATEWAY_ARGS])

  throw new Error('gateway install systemd: unable to locate the current aiworker executable; re-run via the installed aiworker command or pass --exec-start')
}

export function renderExecStartCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteSystemdArg).join(' ')
}

function normalizeExecStart(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0)
    throw new Error('gateway install systemd: ExecStart must not be empty')
  if (/[\r\n]/.test(trimmed))
    throw new Error('gateway install systemd: ExecStart must be a single line')
  return trimmed
}

function quoteSystemdArg(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value))
    return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function resolveExistingPath(candidate: string | undefined, cwd: string, pathExists: (candidate: string) => boolean): string | undefined {
  if (candidate === undefined || candidate.length === 0)
    return undefined
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate)
  return pathExists(absolute) ? absolute : undefined
}

function isBunRuntime(candidate: string): boolean {
  const base = path.basename(candidate)
  return base === 'bun' || base.startsWith('bun-')
}

function isLikelyAiworkerExecutable(candidate: string): boolean {
  return path.basename(candidate).startsWith('aiworker')
}

function findOnPath(command: string, pathValue: string | undefined, pathExists: (candidate: string) => boolean): string | undefined {
  if (pathValue === undefined || pathValue.length === 0)
    return undefined
  for (const dir of pathValue.split(path.delimiter)) {
    if (dir.length === 0)
      continue
    const candidate = path.join(dir, command)
    if (pathExists(candidate))
      return candidate
  }
  return undefined
}

export interface InstallSystemdOptions {
  /** `--system` → 'system'；缺省或 `--user` → 'user'。 */
  scope?: SystemdScope
  /** `--dry-run`：只往 stdout 打 unit 内容，不写盘也不 systemctl。 */
  dryRun?: boolean
  /** `--out <path>`：覆盖目标路径（异常布局/测试用）。自动隐含 noEnable。 */
  out?: string
  /** `--no-enable`：写文件后跳过 `systemctl daemon-reload + enable --now`。 */
  noEnable?: boolean
  /** Advanced override for the rendered ExecStart command. */
  execStart?: string
}

export interface InstallSystemdResult {
  scope: SystemdScope
  content: string
  execStart: string
  /** dryRun 时为 undefined。 */
  written?: { path: string, unchanged: boolean }
  /** 实际跑了 systemctl 时为 true；--dry-run/--out/--no-enable 时为 false。 */
  enabled: boolean
  /**
   * true when unit content changed and systemctl was run. `enable --now` starts
   * inactive units, but an already-active unit needs an explicit restart to run
   * with the new template.
   */
  restartRequired: boolean
}

/** 渲染默认目标路径。`--out` 优先级高于此函数。 */
export function canonicalUnitPath(scope: SystemdScope, home: string = homedir()): string {
  if (scope === 'user')
    return path.join(home, '.config', 'systemd', 'user', SERVICE_NAME)
  return `/etc/systemd/system/${SERVICE_NAME}`
}

/**
 * 纯函数式入口（含写盘但不写日志，可被测试直接调用）。
 * runInstallSystemd 在此之上包一层 consola 输出 + 错误码映射。
 */
export function installSystemd(opts: InstallSystemdOptions = {}): InstallSystemdResult {
  const scope: SystemdScope = opts.scope ?? 'user'
  const execStart = normalizeExecStart(opts.execStart ?? resolveCurrentExecStart())
  const content = renderSystemdUnit({
    scope,
    execStart,
  })

  if (opts.dryRun)
    return { scope, content, execStart, enabled: false, restartRequired: false }

  const target = opts.out ?? canonicalUnitPath(scope)
  mkdirSync(path.dirname(target), { recursive: true })
  let unchanged = false
  if (existsSync(target)) {
    const existing = readFileSync(target, 'utf8')
    if (existing === content)
      unchanged = true
  }
  if (!unchanged)
    writeFileSync(target, content, { encoding: 'utf8', mode: 0o644 })

  // `--out` 时不跑 systemctl：写到非标准位置 systemctl 也不会自动加载，强行 reload 反而误导。
  const shouldEnable = !opts.noEnable && opts.out === undefined
  if (!shouldEnable)
    return { scope, content, execStart, written: { path: target, unchanged }, enabled: false, restartRequired: false }

  runSystemctlEnable(scope)
  return { scope, content, execStart, written: { path: target, unchanged }, enabled: true, restartRequired: !unchanged }
}

function runSystemctlEnable(scope: SystemdScope): void {
  const scopeArgs = scope === 'user' ? ['--user'] : []
  const reload = spawnSync('systemctl', [...scopeArgs, 'daemon-reload'], { stdio: 'inherit' })
  if (reload.error)
    throw new Error(`无法执行 systemctl: ${reload.error.message}`)
  if (reload.status !== 0)
    throw new Error(`systemctl ${[...scopeArgs, 'daemon-reload'].join(' ')} 失败 (exit=${reload.status ?? 'signal'})`)
  const enable = spawnSync('systemctl', [...scopeArgs, 'enable', '--now', SERVICE_NAME], { stdio: 'inherit' })
  if (enable.error)
    throw new Error(`无法执行 systemctl: ${enable.error.message}`)
  if (enable.status !== 0)
    throw new Error(`systemctl ${[...scopeArgs, 'enable', '--now', SERVICE_NAME].join(' ')} 失败 (exit=${enable.status ?? 'signal'})`)
}

/** CLI 包装：渲染 unit / 写盘 / systemctl，把结果打印给 operator，返回 exit code。 */
export async function runInstallSystemd(opts: InstallSystemdOptions = {}): Promise<number> {
  try {
    const res = installSystemd(opts)
    if (opts.dryRun) {
      // 直接走 stdout：unit 内容要能被 `> file` 重定向，不要混 consola 前缀。
      process.stdout.write(res.content)
      return 0
    }
    const writtenPath = res.written?.path ?? '<unknown>'
    if (res.written?.unchanged)
      consola.info(`systemd unit 未变更 (${writtenPath})`)
    else
      consola.success(`systemd unit 写入 ${writtenPath}`)

    if (res.enabled) {
      consola.success(`已 enable --now ${SERVICE_NAME}（${res.scope === 'user' ? 'systemctl --user' : 'systemctl'}）`)
      if (res.restartRequired) {
        consola.warn('unit 内容已变更；systemctl enable --now 不会重启已在运行的服务。若这是重装/升级，请在维护窗口执行:')
        consola.warn(`  systemctl ${res.scope === 'user' ? '--user ' : ''}restart ${SERVICE_NAME}`)
      }
    }
    else if (opts.out !== undefined) {
      consola.info(`--out 指定了非默认路径，已跳过 systemctl；如需启用请手动:`)
      consola.info(`  systemctl ${res.scope === 'user' ? '--user ' : ''}daemon-reload`)
      consola.info(`  systemctl ${res.scope === 'user' ? '--user ' : ''}enable --now ${SERVICE_NAME}`)
    }
    else if (opts.noEnable) {
      consola.info(`--no-enable 已生效；如需启用请手动:`)
      consola.info(`  systemctl ${res.scope === 'user' ? '--user ' : ''}daemon-reload`)
      consola.info(`  systemctl ${res.scope === 'user' ? '--user ' : ''}enable --now ${SERVICE_NAME}`)
    }
    printFirstRunGuidance(res.scope)
    return 0
  }
  catch (err) {
    consola.error(`gateway install systemd 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

function printFirstRunGuidance(scope: SystemdScope): void {
  if (scope === 'system') {
    consola.box([
      'First-run secrets for aiworker-gateway:',
      `  sudo install -d -m 0700 -o root -g root ${path.dirname(SYSTEM_ENV_FILE)}`,
      `  sudo sh -c 'umask 077; printf "AIWORKER_MASTER_KEY=%s\\nINTERNAL_SHARED_SECRET=%s\\n" "$(openssl rand -hex 32)" "$(openssl rand -base64 24)" > ${SYSTEM_ENV_FILE}'`,
      `  sudo chown root:root ${SYSTEM_ENV_FILE}`,
      `  sudo chmod 600 ${SYSTEM_ENV_FILE}`,
    ].join('\n'))
    return
  }
  consola.box([
    'First-run secrets for aiworker-gateway:',
    '  install -d -m 0700 ~/.config/aiworker',
    '  sh -c \'umask 077; printf "AIWORKER_MASTER_KEY=%s\\nINTERNAL_SHARED_SECRET=%s\\n" "$(openssl rand -hex 32)" "$(openssl rand -base64 24)" > ~/.config/aiworker/gateway.env\'',
    '  chmod 600 ~/.config/aiworker/gateway.env',
  ].join('\n'))
}
