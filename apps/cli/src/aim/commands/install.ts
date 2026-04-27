import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import consola from 'consola'

/**
 * `aim install systemd` —— 渲染 systemd unit 并（可选）注册为 `enable --now`。
 *
 * 设计目标：
 * - **零新依赖**：unit 内容是模板字符串渲染；systemctl 调用走 `child_process.spawnSync`。
 * - **副作用可控**：`--dry-run` 只 stdout，`--out` 改写盘目标且跳过 systemctl，`--no-enable` 写盘后停手。
 *   合在一起足以让单测在不接触真实 `~/.config/systemd` 与 systemctl 的前提下覆盖渲染 + 写盘 + 幂等。
 * - **形态分叉**：`--user`（默认）走 systemd 用户实例；`--system` 写 `/etc/systemd/system/`，
 *   ExecStart 中的 `%h` 在渲染期就替换为操作员 home（systemd 系统单元不展开 `%h`）。
 *
 * unit 模板假设了 `aiworker` 由 bun 安装在 `~/.bun/bin/`，这是 PLAN-016 明确的形态前提
 * （binary 形态见 PLAN-017）。改路径时模板需要同步更新。
 */

export type SystemdScope = 'user' | 'system'

export interface RenderSystemdUnitOptions {
  scope: SystemdScope
  /**
   * 仅 `scope === 'system'` 时使用：替换 ExecStart 中的 `%h`。
   * 系统单元里 `%h` 不会被 systemd 展开，所以必须在渲染期固化为绝对路径。
   */
  operatorHome?: string
}

const SERVICE_NAME = 'aiworker-gateway.service'
const SYSTEM_DATA_DIR = '/var/lib/aiworker'

export function renderSystemdUnit(opts: RenderSystemdUnitOptions): string {
  if (opts.scope === 'user') {
    return [
      '[Unit]',
      'Description=AIWorker gateway daemon (user instance)',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'ExecStart=%h/.bun/bin/aiworker gateway start',
      'Restart=on-failure',
      'RestartSec=5',
      'Environment=AIWORKER_HOME=%h/.aiworker',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n')
  }
  if (!opts.operatorHome || opts.operatorHome.length === 0)
    throw new Error('renderSystemdUnit: scope=system 必须提供 operatorHome（systemd 系统单元不展开 %h）')
  return [
    '[Unit]',
    'Description=AIWorker gateway daemon (system instance)',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${opts.operatorHome}/.bun/bin/aiworker gateway start`,
    'Restart=on-failure',
    'RestartSec=5',
    `Environment=AIWORKER_HOME=${SYSTEM_DATA_DIR}`,
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n')
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
}

export interface InstallSystemdResult {
  scope: SystemdScope
  content: string
  /** dryRun 时为 undefined。 */
  written?: { path: string, unchanged: boolean }
  /** 实际跑了 systemctl 时为 true；--dry-run/--out/--no-enable 时为 false。 */
  enabled: boolean
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
  const content = renderSystemdUnit({
    scope,
    ...(scope === 'system' ? { operatorHome: homedir() } : {}),
  })

  if (opts.dryRun)
    return { scope, content, enabled: false }

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
    return { scope, content, written: { path: target, unchanged }, enabled: false }

  runSystemctlEnable(scope)
  return { scope, content, written: { path: target, unchanged }, enabled: true }
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
    return 0
  }
  catch (err) {
    consola.error(`install systemd 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
