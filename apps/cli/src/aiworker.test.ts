import { describe, expect, it } from 'bun:test'

import { cli, preprocessArgv } from './aiworker'

/**
 * 入口构造与命令注册的快照测试。aiworker 是单 binary entry，所有子命令都注册在
 * 这一个 cac 实例上；这里只验证「形」（命令名/argv 折叠），不触发 handler。
 *
 * 业务 handler 的行为由各自 *.test.ts 守护，本文件不重复覆盖。
 */

// cac 在 `Command#name` 上保存的是去掉 `<arg>` / `[arg]` 后的命令名（参数信息存在
// `Command#args` 上），这里就用 cac 实际归一化后的形态做断言。
const EXPECTED_COMMANDS = [
  // worker-local（dash 形）
  'init',
  'run',
  'scope',
  'serve',
  'config-show',
  'config-set',
  'token-rotate',
  'approvals-list',
  'approvals-grant',
  'schedule-list',
  'schedule-add',
  'schedule-remove',
  // operator-remote（空格形）
  'fleet list',
  'fleet info',
  'fleet launch',
  'fleet stop',
  'fleet remove',
  'gateway start',
  'gateway status',
  'gateway stop',
  'pair',
  'chat',
  'config get',
  'config set',
  'token rotate',
  'approvals list',
  'approvals grant',
  'schedule list',
  'schedule add',
  'schedule remove',
  'enroll list',
  'enroll approve',
  'enroll reject',
  'logs',
  'install systemd',
] as const

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
    for (const keyword of ['serve', 'fleet list', 'gateway start', 'enroll approve', 'config get', 'install systemd'])
      expect(help).toContain(keyword)
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

  it('enroll approve <otp> 折叠后位置参完整保留', () => {
    expect(run('enroll', 'approve', 'XXXX-YYYY')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'enroll approve',
      'XXXX-YYYY',
    ])
  })

  it('config get <workerId> 折叠（前缀长度优先于 config 单 token）', () => {
    expect(run('config', 'get', 'wkr-001')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'config get',
      'wkr-001',
    ])
  })

  it('config-set <json>（dash 形）保持不被折叠', () => {
    const argv = run('config-set', '{"a":1}', '--if-match', '3')
    expect(argv).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'config-set',
      '{"a":1}',
      '--if-match',
      '3',
    ])
  })

  it('install systemd 被折叠', () => {
    expect(run('install', 'systemd', '--dry-run')).toEqual([
      '/usr/bin/bun',
      '/path/to/aiworker.ts',
      'install systemd',
      '--dry-run',
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
