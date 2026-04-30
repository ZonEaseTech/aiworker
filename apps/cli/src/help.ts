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

const COMMAND_SUMMARIES: Record<string, string> = {
  'approvals grant': '解锁远端 worker 上某条挂起的工具审批',
  'approvals list': '查看远端 worker 挂起的工具审批',
  'approvals-grant': '解锁本地 worker 进程内某条挂起的工具审批',
  'approvals-list': '查看本地 worker 进程内挂起的工具审批',
  'chat': '向已接入 fleet 的 worker 发送一条消息',
  'config get': '读取远端 worker 的当前配置',
  'config set': '更新远端 worker 配置，需要版本乐观锁',
  'config-set': '替换本地 worker 配置，需要时可带版本乐观锁',
  'config-show': '打印本地 worker 配置，缺失时会初始化本地状态',
  'enroll approve': '批准一条待处理的 OTP enrollment',
  'enroll list': '列出 gateway 当前待处理的 OTP enrollment',
  'enroll reject': '拒绝一条待处理的 OTP enrollment',
  'fleet info': '查看某个 worker 的运行时信息',
  'fleet launch': '让 gateway 在本机拉起并配对一个 worker',
  'fleet list': '列出 fleet 内所有 worker',
  'fleet remove': '从 fleet 移除 worker 并作废 deviceToken',
  'fleet stop': '向目标 worker 下发停止指令',
  'gateway start': '启动 gateway server，默认前台运行',
  'gateway status': '查看后台 gateway 守护进程状态（foreground/systemd 不由此命令跟踪）',
  'gateway stop': '停止后台 gateway 守护进程',
  'init': '初始化 worker.db、身份、token 和默认配置',
  'install systemd': '渲染并可选注册 gateway 的 systemd unit',
  'logs': '订阅某个 worker 的日志尾部',
  'pair': '用 bootstrap token 把已启动 worker 注册到 gateway',
  'run': '不启动 HTTP server，直接给 orchestrator 投递一条消息',
  'schedule add': '在远端 worker 上新增一条 cron 任务',
  'schedule list': '列出远端 worker 上的 cron 任务',
  'schedule remove': '删除远端 worker 上的一条 cron 任务',
  'schedule-add': '在本地 worker.db 中新增一条 cron 任务',
  'schedule-list': '列出本地 worker.db 中的 cron 任务',
  'schedule-remove': '删除本地 worker.db 中的一条 cron 任务',
  'scope': '诊断当前命令会使用哪个 AIWORKER_HOME',
  'serve': '启动本地 worker HTTP server，可同时接入 gateway',
  'sessions list': '列出本地 worker 会话状态',
  'sessions maintenance': '试算或执行已关闭 transcript 清理',
  'sessions show': '查看本地 worker 的单个会话状态',
  'token rotate': '为远端 worker 轮换 deviceToken',
  'token-rotate': '为本地 worker 生成新的 bearer token',
}

const HELP_GROUPS: readonly HelpGroup[] = [
  {
    title: '本地 worker（当前项目 / 当前主机）',
    hint: '用于初始化、启动和直接维护当前目录或当前主机上的 worker。',
    commands: [
      'init',
      'run',
      'serve',
      'config-show',
      'config-set',
      'token-rotate',
      'schedule-list',
      'schedule-add',
      'schedule-remove',
      'sessions list',
      'sessions show',
    ],
  },
  {
    title: 'Gateway / fleet 管理',
    hint: '用于启动控制面、注册 worker、审批 enrollment，以及查看 fleet 成员。',
    commands: [
      'gateway start',
      'gateway status',
      'gateway stop',
      'fleet list',
      'fleet info',
      'fleet launch',
      'fleet stop',
      'fleet remove',
      'pair',
      'enroll list',
      'enroll approve',
      'enroll reject',
    ],
  },
  {
    title: '远端 worker 操作',
    hint: '用于通过 gateway 操作已在线 worker，不直接读写本机 worker.db。',
    commands: [
      'chat',
      'config get',
      'config set',
      'token rotate',
      'approvals list',
      'approvals grant',
      'schedule list',
      'schedule add',
      'schedule remove',
      'logs',
    ],
  },
  {
    title: '安装、诊断、高级维护',
    hint: '首次试用通常不需要；部署、排错、清理或工具审批时再看。',
    commands: [
      'scope',
      'install systemd',
      'approvals-list',
      'approvals-grant',
      'sessions maintenance',
    ],
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
        '  新建本地 worker：aiworker init --soul developer -> aiworker serve',
        '  只试一次消息：aiworker run --message "..."',
        '  管理 fleet：aiworker gateway start -> aiworker pair 或 aiworker enroll list',
        '  已接入 fleet 后对话：aiworker chat <workerId> "..."',
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
