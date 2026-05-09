import { existsSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'bun:test'

import { cli, preprocessArgv } from './aiworker'
import { getUngroupedHelpCommands } from './help'

const EXPECTED_COMMANDS = [
  'init',
  'daemon start',
  'daemon status',
  'daemon stop',
  'daemon logs',
  'daemon check',
  'daemon inspect',
  'daemon foreground',
  'doctor',
  'executor mcp add',
  'executor mcp sync',
  'executor select',
  'executor doctor',
  'executor capability list',
  'executor capability show',
  'pack list',
  'pack show',
  'run',
  'runs list',
  'runs show',
  'runs cancel',
  'artifacts list',
  'artifacts show',
  'review list',
  'review show',
  'review rerun',
  'review promote',
  'lessons promote',
  'commands',
] as const

const REMOVED_COMMAND_PREFIXES = [
  'approvals',
  'brain',
  'case',
  'config',
  'env',
  'fleet',
  'gateway',
  'schedule',
  'scope',
  'serve',
  'sessions',
  'soul',
  'token',
  'up',
  'worker',
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
  const proc = Bun.spawnSync([process.execPath, cliEntry, ...args], {
    cwd: root,
    env: isolatedEnv(home),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(proc.stdout)
  const stderr = new TextDecoder().decode(proc.stderr)
  return {
    aiworkerHome,
    exitCode: proc.exitCode ?? 0,
    output: `${stdout}\n${stderr}`,
    root,
  }
}

function cleanup(result: { root: string }): void {
  rmSync(result.root, { recursive: true, force: true })
}

function captureRootHelp(): string {
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
  return captured.join('\n')
}

describe('aiworker hard-reset CLI registration', () => {
  it('只注册 local worker 产品闭环命令', () => {
    const explicit = cli.commands
      .filter(command => command.name !== '')
      .map(command => command.name)

    expect(explicit).toEqual([...EXPECTED_COMMANDS])
  })

  it('不再注册 pre-1.0 Brain/Case/Fleet/Gateway/worker 兼容入口', () => {
    const registered = cli.commands
      .filter(command => command.name !== '')
      .map(command => command.name)

    for (const prefix of REMOVED_COMMAND_PREFIXES) {
      expect(registered.some(name => name === prefix || name.startsWith(`${prefix} `))).toBe(false)
    }
  })

  it('root help 只呈现 work order -> run -> artifact -> review -> lesson 路径', () => {
    const help = captureRootHelp()

    for (const keyword of [
      'aiworker daemon start --soul developer --pack developer',
      'aiworker run --message "..."',
      'aiworker runs list',
      'aiworker artifacts list --run <runId>',
      'aiworker review list',
      'aiworker lessons promote <runId>',
      'aiworker commands',
      'executor doctor',
    ])
      expect(help).toContain(keyword)

    for (const removed of [
      'aiworker brain --help',
      'aiworker case',
      'aiworker fleet --help',
      'aiworker gateway --help',
      'aiworker worker --help',
      'sessions maintenance',
      'fleet config set',
      'Worker canonical 入口',
      'aiworker up',
      'aiworker serve',
    ])
      expect(help).not.toContain(removed)
  })

  it('help 分组覆盖所有显式注册命令', () => {
    expect(getUngroupedHelpCommands(cli)).toEqual([])
  })

  it('init help 只保留 workspace/pack 初始化参数', async () => {
    const result = await runCli(['init', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--soul <preset>')
      expect(result.output).toContain('--pack <id>')
      expect(result.output).toContain('worker pack')
      expect(result.output).not.toContain('--global')
      expect(result.output).not.toContain('--force')
    }
    finally {
      cleanup(result)
    }
  })

  it('daemon start help 不再暴露 gateway 或旧 serve 开关', async () => {
    const result = await runCli(['daemon', 'start', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--soul <preset>')
      expect(result.output).toContain('--pack <id>')
      expect(result.output).toContain('--port <n>')
      expect(result.output).not.toContain('--gateway')
      expect(result.output).not.toContain('--gateway-token')
      expect(result.output).not.toContain('--no-serve-web')
    }
    finally {
      cleanup(result)
    }
  })

  it('run help 只呈现 daemon work order 投递参数', async () => {
    const result = await runCli(['run', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--message <text>')
      expect(result.output).toContain('--dry-run')
      expect(result.output).not.toContain('--local')
      expect(result.output).not.toContain('--chat-id')
    }
    finally {
      cleanup(result)
    }
  })

  it('commands 输出 hard-reset 命令索引', async () => {
    const result = await runCli(['commands'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('aiworker command index')
      expect(result.output).toContain('Worker loop')
      expect(result.output).toContain('pack -> work order -> run -> artifact -> review -> lesson')
      expect(result.output).toContain('lessons promote')
      expect(result.output).not.toContain('Worker canonical 入口')
      expect(result.output).not.toContain('sessions maintenance')
      expect(result.output).not.toContain('fleet config set')
      expect(result.output).not.toContain('gateway install systemd')
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

  it('daemon foreground 被折叠为当前 daemon 前台命令', () => {
    expect(run('daemon', 'foreground', '--port', '9217')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'daemon foreground',
      '--port',
      '9217',
    ])
  })

  it('executor mcp add 折叠后保留以短横线开头的 --arg 值', () => {
    expect(run('executor', 'mcp', 'add', 'context7', '--engine', 'codex', '--arg', '-y')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'executor mcp add',
      'context7',
      '--engine',
      'codex',
      '--arg=-y',
    ])
  })

  it('runs/artifacts/review/lessons 当前命令会被折叠', () => {
    expect(run('runs', 'show', 'run-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'runs show',
      'run-001',
    ])
    expect(run('artifacts', 'list', '--run', 'run-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'artifacts list',
      '--run',
      'run-001',
    ])
    expect(run('review', 'promote', 'run-001', '--scope', 'repo:aiworker')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'review promote',
      'run-001',
      '--scope',
      'repo:aiworker',
    ])
    expect(run('lessons', 'promote', 'run-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'lessons promote',
      'run-001',
    ])
  })

  it('旧 worker/brain/case/fleet/gateway 命令不再被折叠', () => {
    expect(run('worker', 'run')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'worker',
      'run',
    ])
    expect(run('brain', 'status')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'brain',
      'status',
    ])
    expect(run('case', 'show', 'run-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'case',
      'show',
      'run-001',
    ])
    expect(run('fleet', 'list')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'fleet',
      'list',
    ])
    expect(run('gateway', 'start')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'gateway',
      'start',
    ])
  })
})

describe('aiworker hard-reset argv handling', () => {
  it('旧顶层命令明确失败且不创建状态', async () => {
    for (const args of [
      ['fleet', 'list'],
      ['brain', 'status'],
      ['case', 'show', 'run-001'],
      ['worker', 'run'],
    ]) {
      const result = await runCli(args)
      try {
        expect(result.exitCode).toBe(2)
        expect(result.output).toContain(`Unknown command: ${args[0]}`)
        expect(existsSync(result.aiworkerHome)).toBe(false)
      }
      finally {
        cleanup(result)
      }
    }
  })

  it('格式错误的 daemon port 在初始化前失败', async () => {
    const result = await runCli(['daemon', 'start', '--soul', 'developer', '--port', 'nope'])
    try {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--port must be a finite number')
      expect(result.output).not.toContain('[aiworker init] preflight')
      expect(existsSync(path.join(result.root, '.aiworker'))).toBe(false)
      expect(existsSync(result.aiworkerHome)).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })

  it('daemon group help 只列出 daemon 子命令', async () => {
    const result = await runCli(['daemon', '--help'])
    try {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[aiworker daemon] command group')
      expect(result.output).toContain('daemon start')
      expect(result.output).toContain('daemon foreground')
      expect(result.output).not.toContain('gateway start')
      expect(result.output).not.toContain('worker daemon check')
      expect(existsSync(result.aiworkerHome)).toBe(false)
    }
    finally {
      cleanup(result)
    }
  })
})
