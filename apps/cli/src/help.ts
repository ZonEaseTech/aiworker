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

const WORKER_COMMANDS = ROOT_WORKER_COMMANDS.map(command => `worker ${command}`)

const FLEET_COMMANDS = [
  'fleet list',
  'fleet info',
  'fleet launch',
  'fleet stop',
  'fleet remove',
  'fleet pair',
  'fleet enroll list',
  'fleet enroll approve',
  'fleet enroll reject',
  'fleet chat',
  'fleet logs',
  'fleet config get',
  'fleet config set',
  'fleet token rotate',
  'fleet approvals list',
  'fleet approvals grant',
  'fleet schedule list',
  'fleet schedule add',
  'fleet schedule remove',
] as const

const GATEWAY_COMMANDS = [
  'gateway start',
  'gateway status',
  'gateway stop',
  'gateway install systemd',
] as const

const ROOT_WORKER_SUMMARIES: Record<(typeof ROOT_WORKER_COMMANDS)[number], string> = {
  'approvals grant': '解锁本地 worker 进程内某条挂起的工具审批',
  'approvals list': '查看本地 worker 进程内挂起的工具审批',
  'config set': '替换本地 worker 配置，需要时可带版本乐观锁',
  'config show': '打印本地 worker 配置，缺失时会初始化本地状态',
  'doctor': '静态验证当前 `.aiworker/` 能力配置',
  'executor capability list': '只读列出 .aiworker/executor-capabilities.json 中的 project executor overlay 条目',
  'executor capability show': '只读查看单条 project executor overlay descriptor',
  'executor doctor': '校验 project executor overlay 与 engine CLI readiness（不探测 user/host ambient capabilities）',
  'executor mcp add': '在 project executor overlay 中声明一个 MCP server hint',
  'executor mcp sync': '把 project executor overlay best-effort 投影到 engine 官方 project 配置',
  'executor select': '显式选择本地 worker 的 task executor，不写 engine project config',
  'brain memories': '只读列出或搜索 runtime brain memory',
  'brain skills': '只读列出 runtime brain skill',
  'brain status': '诊断 runtime brain source、写入目标和健康状态',
  'init': '初始化 worker.db、身份、token 和默认配置',
  'up': '一条命令初始化、验证并启动本地 worker',
  'run': '不启动 HTTP server，直接给 orchestrator 投递一条消息',
  'schedule add': '在本地 worker.db 中新增一条 cron 任务',
  'schedule list': '列出本地 worker.db 中的 cron 任务',
  'schedule remove': '删除本地 worker.db 中的一条 cron 任务',
  'scope': '诊断当前命令会使用哪个 AIWORKER_HOME',
  'serve': '启动本地 worker HTTP server，可同时接入 gateway',
  'sessions list': '列出本地 worker 会话状态',
  'sessions maintenance': '试算或执行已关闭 transcript 清理',
  'sessions show': '查看本地 worker 的单个会话状态',
  'soul list': '列出内置 Soul 预设及其声明能力',
  'soul show': '查看某个 Soul 的职责、边界和能力草案',
  'token rotate': '为本地 worker 生成新的 bearer token',
}

const WORKER_SUMMARIES = Object.fromEntries(
  Object.entries(ROOT_WORKER_SUMMARIES).map(([command, summary]) => [`worker ${command}`, summary]),
)

const COMMAND_SUMMARIES: Record<string, string> = {
  ...ROOT_WORKER_SUMMARIES,
  ...WORKER_SUMMARIES,
  'fleet approvals grant': '解锁远端 worker 上某条挂起的工具审批',
  'fleet approvals list': '查看远端 worker 挂起的工具审批',
  'fleet chat': '向已接入 fleet 的 worker 发送一条消息',
  'fleet config get': '读取远端 worker 的当前配置',
  'fleet config set': '更新远端 worker 配置，需要版本乐观锁',
  'fleet enroll approve': '批准一条待处理的 OTP enrollment',
  'fleet enroll list': '列出 gateway 当前待处理的 OTP enrollment',
  'fleet enroll reject': '拒绝一条待处理的 OTP enrollment',
  'fleet info': '查看某个 worker 的运行时信息',
  'fleet launch': '让 gateway 在本机拉起并配对一个 worker',
  'fleet list': '列出 fleet 内所有 worker',
  'fleet logs': '订阅某个 worker 的日志尾部',
  'fleet pair': '用 bootstrap token 把已启动 worker 注册到 gateway',
  'fleet remove': '从 fleet 移除 worker 并作废 deviceToken',
  'fleet schedule add': '在远端 worker 上新增一条 cron 任务',
  'fleet schedule list': '列出远端 worker 上的 cron 任务',
  'fleet schedule remove': '删除远端 worker 上的一条 cron 任务',
  'fleet stop': '向目标 worker 下发停止指令',
  'fleet token rotate': '为远端 worker 轮换 deviceToken',
  'gateway install systemd': '渲染并可选注册 gateway 的 systemd unit',
  'gateway start': '启动 gateway server，默认前台运行',
  'gateway status': '查看后台 gateway 守护进程状态（foreground/systemd 不由此命令跟踪）',
  'gateway stop': '停止后台 gateway 守护进程',
}

const HELP_GROUPS: readonly HelpGroup[] = [
  {
    title: '本地 worker 快捷入口',
    hint: '`aiworker ...` 默认就是操作本地 worker，适合日常初始化、运行和维护。',
    commands: ROOT_WORKER_COMMANDS,
  },
  {
    title: 'Worker canonical 入口',
    hint: '显式写出 worker 角色，和上方快捷入口等价，适合脚本或文档强调角色边界。',
    commands: WORKER_COMMANDS,
  },
  {
    title: 'Fleet 控制面',
    hint: '用于查看 fleet、注册 worker、审批 enrollment，以及通过 gateway 操作远端 worker。',
    commands: FLEET_COMMANDS,
  },
  {
    title: 'Gateway 生命周期',
    hint: '用于启动、停止、检查或安装 gateway 控制面。',
    commands: GATEWAY_COMMANDS,
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

function buildHelpSections(cli: CAC, sections: HelpSection[]): HelpSection[] {
  if (cli.matchedCommand?.name)
    return localizeStandardSections(sections)

  const header = sections[0] ?? { body: 'aiworker' }
  const options = sections.find(section => section.title === 'Options')
  const groupedSections = HELP_GROUPS.map(group => ({
    title: group.title,
    body: renderGroup(cli, group),
  }))

  return [
    header,
    {
      title: '用法',
      body: '  $ aiworker <command> [options]',
    },
    {
      title: '使用引导',
      body: [
        '  新建本地 worker：aiworker up --soul developer',
        '  显式角色入口：aiworker worker up --soul developer',
        '  查看 Soul 能力：aiworker soul list -> aiworker soul show developer',
        '  查看 Brain 状态：aiworker brain status -> aiworker brain skills',
        '  只试一次消息：aiworker run --message "..."',
        '  管理 fleet：aiworker gateway start -> aiworker fleet pair 或 aiworker fleet enroll list',
        '  已接入 fleet 后对话：aiworker fleet chat <workerId> "..."',
        '  部署、清理、工具审批不是首次使用必需路径；需要时再看高级维护命令。',
      ].join('\n'),
    },
    ...groupedSections,
    {
      title: '更多',
      body: [
        '  aiworker <command> --help  查看某个命令的参数和选项',
        '  aiworker scope             确认当前命令会落到哪个 AIWORKER_HOME',
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
    body: section.body.replaceAll(/ \(default: ([^)]+)\)/g, '（默认：$1）'),
  }
}

function renderGroup(cli: Pick<CAC, 'commands'>, group: HelpGroup): string {
  const rows = group.commands.map((name) => {
    const command = cli.commands.find(item => item.name === name)
    return {
      name: command?.rawName ?? name,
      summary: COMMAND_SUMMARIES[name] ?? command?.description ?? '',
    }
  })
  const width = Math.max(...rows.map(row => row.name.length))
  return [
    `  ${group.hint}`,
    '',
    ...rows.map(row => `  ${row.name.padEnd(width)}  ${row.summary}`),
  ].join('\n')
}
