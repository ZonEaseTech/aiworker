import type { CAC } from 'cac'

interface HelpSection {
  body: string
  title?: string
}

interface HelpGroup {
  commands: readonly string[]
  hint: string
  title: string
}

const UTILITY_COMMANDS = ['commands'] as const

const WORKER_LOOP_COMMANDS = [
  'init',
  'daemon start',
  'daemon status',
  'daemon stop',
  'daemon logs',
  'daemon check',
  'daemon inspect',
  'daemon foreground',
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
] as const

const PACK_AND_EXECUTOR_COMMANDS = [
  'pack list',
  'pack show',
  'doctor',
  'executor doctor',
  'executor select',
  'executor capability list',
  'executor capability show',
  'executor mcp add',
  'executor mcp sync',
] as const

const COMMAND_SUMMARIES: Record<string, string> = {
  'artifacts list': '列出本地 daemon artifact metadata',
  'artifacts show': '查看一个 artifact metadata',
  'commands': '显示当前 hard-reset CLI 命令索引',
  'daemon check': '检查后台本地 worker daemon 的 /health',
  'daemon foreground': '前台运行本地 worker daemon HTTP/Web 服务',
  'daemon inspect': '以 JSON 输出本地 worker daemon 状态与 metadata',
  'daemon logs': '打印后台本地 worker daemon 最近日志',
  'daemon start': '后台启动本地 worker daemon',
  'daemon status': '查看后台本地 worker daemon PID/log 状态',
  'daemon stop': '停止后台本地 worker daemon',
  'doctor': '验证当前 workspace 的 local worker state、pack 和 executor readiness',
  'executor capability list': '只读列出 project executor overlay 条目',
  'executor capability show': '只读查看单条 project executor overlay descriptor',
  'executor doctor': '校验 project executor overlay 与 engine CLI readiness',
  'executor mcp add': '声明一个 project executor MCP overlay hint',
  'executor mcp sync': '把 project executor overlay best-effort 投影到 engine 官方 project 配置',
  'executor select': '选择本地 worker 的 task executor',
  'init': '初始化当前 workspace 的 local worker state 和 worker pack',
  'lessons promote': '把 run review 的 lesson candidates 晋升为 durable context',
  'pack list': '列出 OD-style worker packs',
  'pack show': '查看 worker pack 的 skill/domain/work-order/artifact 信息',
  'review list': '列出本地 worker run reviews',
  'review promote': '把 review lesson candidates 晋升为 durable lesson proposals',
  'review rerun': '基于 review evidence 显式重跑一个 work order',
  'review show': '查看 run review、evidence、risk 和 lesson candidates',
  'run': '向本地 daemon 提交一条 work order',
  'runs cancel': '取消一个仍在运行的 work order',
  'runs list': '列出本地 daemon work orders',
  'runs show': '查看一个 work order run',
}

const HELP_GROUPS: readonly HelpGroup[] = [
  {
    title: 'Utility commands',
    hint: '用于发现当前命令表，不属于日常 worker 路径。',
    commands: UTILITY_COMMANDS,
  },
  {
    title: 'Worker loop',
    hint: '唯一默认产品路径：pack -> work order -> run -> artifact -> review -> lesson。',
    commands: WORKER_LOOP_COMMANDS,
  },
  {
    title: 'Packs and executor',
    hint: '用于检查 worker pack 与外部 executor readiness。',
    commands: PACK_AND_EXECUTOR_COMMANDS,
  },
]

export function configureCliHelp(cli: CAC): void {
  cli.help(sections => buildHelpSections(cli, sections))
  localizeGlobalOptions(cli)
}

export function localizeGlobalOptions(cli: Pick<CAC, 'globalCommand'>): void {
  for (const option of cli.globalCommand.options) {
    if (option.name === 'help')
      option.description = '显示帮助信息'
    if (option.name === 'version')
      option.description = '显示版本号'
  }
}

export function getUngroupedHelpCommands(cli: Pick<CAC, 'commands'>): string[] {
  const grouped = new Set(HELP_GROUPS.flatMap(group => group.commands))
  return cli.commands
    .filter(command => command.name !== '')
    .map(command => command.name)
    .filter(name => !grouped.has(name))
}

export function renderFullCommandIndex(cli: Pick<CAC, 'commands'>): string {
  return [
    'aiworker command index',
    ...HELP_GROUPS
      .filter(group => group.title !== 'Utility commands')
      .map(group => [
        `${group.title}:`,
        renderGroup(cli, group),
      ].join('\n')),
    'Run `aiworker <group> --help` for scoped command help.',
  ].join('\n\n')
}

export function renderCommandGroupHelp(cli: Pick<CAC, 'commands'>, groupName: string): string | null {
  const prefix = groupName.trim()
  if (!prefix)
    return null
  const rows = cli.commands
    .filter(command => command.name.startsWith(`${prefix} `))
    .map(command => ({
      name: command.rawName ?? command.name,
      summary: COMMAND_SUMMARIES[command.name] ?? command.description ?? '',
    }))
  if (rows.length === 0)
    return null

  const width = Math.max(...rows.map(row => row.name.length))
  return [
    `[aiworker ${prefix}] command group`,
    '',
    '这是命令组，不是可直接执行的命令。可用子命令：',
    '',
    ...rows.map(row => `  ${row.name.padEnd(width)}  ${row.summary}`),
    '',
    `Run \`aiworker ${rows[0]?.name ?? prefix} --help\` for command options.`,
  ].join('\n')
}

export function findCommandGroupHelpArg(argv: string[], cli: Pick<CAC, 'commands'>): string | null {
  const args = argv.slice(2)
  const helpIndex = args.findIndex(arg => arg === '--help' || arg === '-h')
  if (helpIndex < 0)
    return null
  const prefixTokens = args.slice(0, helpIndex).filter(arg => !arg.startsWith('-'))
  for (let depth = prefixTokens.length; depth >= 1; depth--) {
    const prefix = prefixTokens.slice(0, depth).join(' ')
    if (renderCommandGroupHelp(cli, prefix) !== null)
      return prefix
  }
  return null
}

function buildHelpSections(cli: CAC, sections: HelpSection[]): HelpSection[] {
  if (cli.matchedCommand?.name)
    return localizeStandardSections(sections)

  const header = sections[0] ?? { body: 'aiworker' }
  const options = sections.find(section => section.title === 'Options')

  return [
    header,
    {
      title: '用法',
      body: '  $ aiworker daemon start --soul developer --pack developer',
    },
    {
      title: '开始',
      body: [
        '  aiworker init --soul developer --pack developer  初始化 worker pack 和本地状态',
        '  aiworker daemon start --soul developer --pack developer  后台启动本地 worker daemon',
        '  aiworker daemon check                    检查本地 daemon /health',
        '  aiworker run --message "..."             提交一次 work order',
        '  aiworker review list                     查看 run reviews',
        '  aiworker lessons promote <runId>         晋升可复用 lessons',
      ].join('\n'),
    },
    {
      title: '查看',
      body: [
        '  aiworker runs list                       查看 work order runs',
        '  aiworker runs show <runId>               查看单个 run',
        '  aiworker artifacts list --run <runId>    查看 run 产物 metadata',
        '  aiworker artifacts show <id>             查看单个 artifact metadata',
        '  aiworker daemon status                   查看后台 daemon PID/log',
        '  aiworker daemon logs                     查看后台 daemon 日志',
        '  aiworker pack show developer             查看 worker pack 资产',
        '  aiworker executor doctor                 查看外部 executor readiness',
      ].join('\n'),
    },
    {
      title: '更多',
      body: [
        '  aiworker commands                        当前命令索引',
        '  aiworker <command> --help                查看单个命令参数',
      ].join('\n'),
    },
    ...(options ? [{ ...localizeStandardSection(options), title: '选项' }] : []),
  ]
}

function localizeStandardSections(sections: HelpSection[]): HelpSection[] {
  return sections.map(localizeStandardSection)
}

function localizeStandardSection(section: HelpSection): HelpSection {
  const titles: Record<string, string> = {
    Examples: '示例',
    Options: '选项',
    Usage: '用法',
  }
  return {
    ...section,
    ...(section.title ? { title: titles[section.title] ?? section.title } : {}),
    body: section.body
      .replaceAll(/ \(default: (true|false)\)/g, '')
      .replaceAll(/ \(default: ([^)]+)\)/g, '（默认：$1）'),
  }
}

function renderGroup(cli: Pick<CAC, 'commands'>, group: HelpGroup): string {
  return [
    `  ${group.hint}`,
    '',
    renderGroupRows(cli, group),
  ].join('\n')
}

function renderGroupRows(cli: Pick<CAC, 'commands'>, group: HelpGroup): string {
  const rows = group.commands.map((name) => {
    const command = cli.commands.find(item => item.name === name)
    return {
      name: command?.rawName ?? name,
      summary: COMMAND_SUMMARIES[name] ?? command?.description ?? '',
    }
  })
  const width = Math.max(...rows.map(row => row.name.length))
  return rows.map(row => `  ${row.name.padEnd(width)}  ${row.summary}`).join('\n')
}
