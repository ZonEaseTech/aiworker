import { existsSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

import { cli, preprocessArgv } from './aiworker'
import { getUngroupedHelpCommands } from './help'

/**
 * 入口构造与命令注册的快照测试。aiworker 是单 binary entry，所有子命令都注册在
 * 这一个 cac 实例上；这里只验证「形」（命令名/argv 折叠），不触发 handler。
 *
 * 业务 handler 的行为由各自 *.test.ts 守护，本文件不重复覆盖。
 */

// cac 在 `Command#name` 上保存的是去掉 `<arg>` / `[arg]` 后的命令名（参数信息存在
// `Command#args` 上），这里就用 cac 实际归一化后的形态做断言。
const ROOT_WORKER_COMMANDS = [
  'init',
  'up',
  'scope',
  'doctor',
  'executor doctor',
  'executor select',
  'executor capability list',
  'executor capability show',
  'executor mcp add',
  'executor mcp sync',
  'soul list',
  'soul show',
  'brain status',
  'brain skills',
  'brain memories',
  'brain artifacts list',
  'brain artifacts show',
  'run',
  'serve',
  'config show',
  'config set',
  'token rotate',
  'approvals list',
  'approvals grant',
  'schedule list',
  'schedule add',
  'schedule remove',
  'sessions list',
  'sessions show',
  'sessions maintenance',
] as const

const EXPECTED_COMMANDS = [
  // root worker shortcuts
  ...ROOT_WORKER_COMMANDS,
  // worker canonical
  ...ROOT_WORKER_COMMANDS.map(command => `worker ${command}`),
  // fleet / gateway
  'fleet list',
  'fleet info',
  'fleet launch',
  'fleet stop',
  'fleet remove',
  'fleet pair',
  'fleet chat',
  'fleet config get',
  'fleet config set',
  'fleet token rotate',
  'fleet approvals list',
  'fleet approvals grant',
  'fleet schedule list',
  'fleet schedule add',
  'fleet schedule remove',
  'fleet enroll list',
  'fleet enroll approve',
  'fleet enroll reject',
  'fleet logs',
  'gateway start',
  'gateway status',
  'gateway stop',
  'gateway install systemd',
] as const

const cliEntry = path.resolve(import.meta.dir, 'aiworker.ts')

function isolatedEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      env[key] = value
  }
  env.HOME = home
  env.AIWORKER_HOME = path.join(home, '.aiworker')
  env.NO_COLOR = '1'
  delete env.AIWORKER_MASTER_KEY
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  delete env.WORKER_MIGRATIONS_FOLDER
  delete env.AIWORKER_WORKER_HOST
  delete env.AIWORKER_ADMIN_EXTERNAL_AUTH
  return env
}

async function runCli(args: string[]): Promise<{
  aiworkerHome: string
  exitCode: number
  output: string
  root: string
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-args-'))
  const home = path.join(root, 'home')
  const aiworkerHome = path.join(home, '.aiworker')
  const env = isolatedEnv(home)
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd: root,
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(proc.stdout)
  const stderr = new TextDecoder().decode(proc.stderr)
  return {
    aiworkerHome,
    exitCode: proc.exitCode,
    output: `${stdout}\n${stderr}`,
    root,
  }
}

function cleanup(result: { root: string }): void {
  rmSync(result.root, { recursive: true, force: true })
}

describe('aiworker cli registration', () => {
  it('注册了预期数量的命令（漏注册即 fail）', () => {
    // cac 会内置一个 name='' 的 globalCommand；这里只数显式 .command 注册的。
    const explicit = cli.commands.filter(c => c.name !== '')
    expect(explicit.length).toBe(EXPECTED_COMMANDS.length)
  })

  it('每个预期命令都被注册', () => {
    const registered = new Set(cli.commands.map(c => c.name))
    for (const name of EXPECTED_COMMANDS)
      expect(registered.has(name)).toBe(true)
  })

  it('--help 文本包含主要顶层命令组关键字', () => {
    // cac 的 outputHelp 默认 console.log；hook 一次拿字符串来断言。
    const captured: string[] = []
    const orig = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(a => String(a)).join(' '))
    }) as typeof console.log
    try {
      cli.outputHelp()
    }
    finally {
      console.log = orig
    }
    const help = captured.join('\n')
    for (const keyword of [
      '使用引导',
      '本地 worker 快捷入口',
      'Worker canonical 入口',
      'Fleet 控制面',
      'Gateway 生命周期',
      'aiworker up --soul developer',
      'aiworker worker up --soul developer',
      'aiworker soul list -> aiworker soul show developer',
      'aiworker brain status -> aiworker brain skills',
      'brain status',
      'brain memories',
      'executor select',
      'executor capability list',
      'executor mcp add',
      'doctor',
      'up',
      'serve',
      'soul list',
      'sessions list',
      'fleet list',
      'gateway start',
      'fleet enroll approve',
      'fleet config get',
      'gateway install systemd',
    ])
      expect(help).toContain(keyword)
    expect(help).not.toContain('For more info, run any command')
  })

  it('help 分组覆盖所有显式注册命令', () => {
    expect(getUngroupedHelpCommands(cli)).toEqual([])
  })

  it('serve help 暴露浏览器打开控制参数', async () => {
    const result = await runCli(['serve', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--open')
      expect(result.output).toContain('--no-open')
      expect(result.output).toContain('打开 worker admin')
    }
    finally {
      cleanup(result)
    }
  })

  it('up help 暴露快速启动和 serve 透传参数', async () => {
    const result = await runCli(['up', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--soul <preset>')
      expect(result.output).toContain('--dry-run')
      expect(result.output).toContain('--port <n>')
      expect(result.output).toContain('--gateway <url>')
      expect(result.output).toContain('--no-open')
      expect(result.output).toContain('brand-new project 初始化')
      expect(result.output).toContain('不初始化、不启动 HTTP server')
    }
    finally {
      cleanup(result)
    }
  })
})

describe('preprocessArgv', () => {
  function run(...rest: string[]): string[] {
    return preprocessArgv(['/usr/bin/bun', '/path/to/aiworker.ts', ...rest])
  }

  it('两词命令 fleet list 被折叠为单 token', () => {
    expect(run('fleet', 'list')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'fleet list',
    ])
  })

  it('两词命令 fleet launch 折叠后保留 --image 选项', () => {
    expect(run('fleet', 'launch', '--image', 'foo')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'fleet launch',
      '--image',
      'foo',
    ])
  })

  it('fleet enroll approve <otp> 折叠后位置参完整保留', () => {
    expect(run('fleet', 'enroll', 'approve', 'XXXX-YYYY')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'fleet enroll approve',
      'XXXX-YYYY',
    ])
  })

  it('fleet config get <workerId> 折叠（前缀长度优先于 fleet config 单 token）', () => {
    expect(run('fleet', 'config', 'get', 'wkr-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'fleet config get',
      'wkr-001',
    ])
  })

  it('config set <json> 折叠为本地 worker 快捷入口', () => {
    const argv = run('config', 'set', '{"a":1}', '--if-match', '3')
    expect(argv).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'config set',
      '{"a":1}',
      '--if-match',
      '3',
    ])
  })

  it('gateway install systemd 被折叠', () => {
    expect(run('gateway', 'install', 'systemd', '--dry-run')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'gateway install systemd',
      '--dry-run',
    ])
  })

  it('sessions list 被折叠', () => {
    expect(run('sessions', 'list', '--limit', '2')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'sessions list',
      '--limit',
      '2',
    ])
  })

  it('soul show 被折叠', () => {
    expect(run('soul', 'show', 'developer')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'soul show',
      'developer',
    ])
  })

  it('executor mcp add 被折叠', () => {
    expect(run('executor', 'mcp', 'add', 'context7', '--engine', 'codex')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'executor mcp add',
      'context7',
      '--engine',
      'codex',
    ])
  })

  it('executor capability show 被折叠', () => {
    expect(run('executor', 'capability', 'show', 'codex.mcp.context7')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'executor capability show',
      'codex.mcp.context7',
    ])
  })

  it('worker up 被折叠为 canonical command', () => {
    expect(run('worker', 'up', '--dry-run')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'worker up',
      '--dry-run',
    ])
  })

  it('worker executor mcp add 被折叠', () => {
    expect(run('worker', 'executor', 'mcp', 'add', 'context7', '--engine', 'codex')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'worker executor mcp add',
      'context7',
      '--engine',
      'codex',
    ])
  })

  it('worker executor select 被折叠', () => {
    expect(run('worker', 'executor', 'select', '--engine', 'codex')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'worker executor select',
      '--engine',
      'codex',
    ])
  })

  it('不命中任何多词命令时原样返回', () => {
    expect(run('init')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'init',
    ])
  })
})

describe('aiworker malformed argv handling', () => {
  it('soul list shows declared capabilities without bootstrapping state', async () => {
    const result = await runCli(['soul', 'list'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[aiworker soul] built-in presets')
      expect(result.output).toContain('developer')
      expect(result.output).toContain('packs=code, repo-maintenance, review')
      expect(result.output).toContain('aiworker doctor')
      expect(existsSync(result.aiworkerHome)).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('soul show renders one preset capability profile', async () => {
    const result = await runCli(['soul', 'show', 'developer'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[aiworker soul] developer (Developer)')
      expect(result.output).toContain('Responsibilities:')
      expect(result.output).toContain('Capability packs: code, repo-maintenance, review')
      expect(result.output).toContain('Toolsets: filesystem-read, filesystem-write, shell, git, test')
      expect(result.output).toContain('project validation via aiworker doctor')
      expect(existsSync(result.aiworkerHome)).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('soul show rejects unknown presets', async () => {
    const result = await runCli(['soul', 'show', 'nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('unknown Soul preset "nope"')
      expect(result.output).toContain('developer')
      expect(existsSync(result.aiworkerHome)).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('missing command args fail without a raw CAC stack trace or bootstrap side effects', async () => {
    const result = await runCli(['fleet', 'info'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('missing required args for command')
      expect(result.output).not.toContain('node_modules/.bun/cac')
      expect(result.output).not.toContain('at checkRequiredArgs')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('unknown options fail without a raw CAC stack trace or bootstrap side effects', async () => {
    const result = await runCli(['fleet', 'list', '--bad'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('Unknown option')
      expect(result.output).not.toContain('node_modules/.bun/cac')
      expect(result.output).not.toContain('at checkUnknownOptions')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('unknown commands fail explicitly', async () => {
    const result = await runCli(['__nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('Unknown command: __nope')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('rejects malformed numeric options before remote gateway calls', async () => {
    const result = await runCli(['fleet', 'chat', 'w_test', 'hello', '--timeout-ms', 'nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--timeout-ms must be a finite number')
      expect(result.output).not.toContain('WS 连接错误')
      expect(result.output).not.toContain('Failed to connect')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('rejects malformed port options before worker server bootstrap', async () => {
    const result = await runCli(['serve', '--port', 'nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--port must be a finite number')
      expect(result.output).not.toContain('worker.db ready')
      expect(result.output).not.toContain('listening on :NaN')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('rejects malformed up port options before init or serve side effects', async () => {
    const result = await runCli(['up', '--soul', 'developer', '--port', 'nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--port must be a finite number')
      expect(result.output).not.toContain('[aiworker up] stage')
      expect(existsSync(path.join(result.root, '.aiworker'))).toBe(false)
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('documents serve host override in command help', async () => {
    const result = await runCli(['serve', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--host <host>')
      expect(result.output).toContain('AIWORKER_WORKER_HOST')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('documents config show bootstrap behavior in command help', async () => {
    const result = await runCli(['--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('缺失时会初始化本地状态')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('rejects removed pre-1.0 legacy command spellings', async () => {
    const result = await runCli(['config-show'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('Unknown command: config-show')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('clarifies gateway status is detached-daemon only in command help', async () => {
    const result = await runCli(['--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('后台 gateway 守护进程')
      expect(result.output).toContain('foreground/systemd')
      expect(existsSync(path.join(result.aiworkerHome, '.env'))).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })
})
