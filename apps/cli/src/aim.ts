#!/usr/bin/env bun
import process from 'node:process'

import cac from 'cac'
import consola from 'consola'

import { runChat } from './aim/commands/chat'
import { runConfigGet, runConfigSet } from './aim/commands/config'
import { runGatewayStart, runGatewayStatus, runGatewayStop } from './aim/commands/gateway'
import { runLogs } from './aim/commands/logs'
import { runPair } from './aim/commands/pair'
import { runScheduleAdd, runScheduleList, runScheduleRemove } from './aim/commands/schedule'
import { runTokenRotate } from './aim/commands/token'
import {
  runWorkersInfo,
  runWorkersLaunch,
  runWorkersList,
  runWorkersRemove,
  runWorkersStop,
} from './aim/commands/workers'

/**
 * aim — operator-side CLI。
 *
 * 与 `aiw` 并列：`aiw` 服务 worker 节点（init / run / serve / config / token），
 * `aim` 服务 operator（通过 WS 协议与 gateway 对话，管理 fleet 内的 worker）。
 *
 * 退出码约定（见 commands/common.ts errorToExitCode）：
 *   0 成功；1 泛型错误；2 参数非法 / 未知方法；3 超时；4 连接断开。
 */
const cli = cac('aim')

// --- gateway 子命令（本地 daemon）---
cli
  .command('gateway start', '拉起本地 gateway daemon 进程')
  .option('--port <n>', '监听端口，默认 3000', { type: [Number] })
  .option('--entry <path>', '显式指定 gateway 入口文件（默认读 AIWORKER_GATEWAY_ENTRY env）')
  .action(async (opts: { port?: number[], entry?: string }) => {
    const code = await runGatewayStart({
      ...(opts.port?.[0] === undefined ? {} : { port: opts.port[0] }),
      ...(opts.entry === undefined ? {} : { entry: opts.entry }),
    })
    process.exit(code)
  })

cli.command('gateway status', '显示 gateway daemon 是否运行').action(() => {
  process.exit(runGatewayStatus())
})

cli
  .command('gateway stop', '停止 gateway daemon (SIGTERM, 超时后 SIGKILL)')
  .option('--timeout-ms <n>', 'SIGTERM 超时，默认 5000ms', { type: [Number] })
  .action(async (opts: { timeoutMs?: number[] }) => {
    const code = await runGatewayStop(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] })
    process.exit(code)
  })

// --- pair ---
cli
  .command('pair', '通过 bootstrap token 把一个已启动的 worker 注册到 gateway')
  .option('--url <wsUrl>', 'gateway WS URL（默认使用 aim.json 里的 gatewayUrl）')
  .option('--worker-url <httpUrl>', 'worker HTTP base URL（必填）')
  .option('--bootstrap-token <token>', 'worker 打印的一次性 bootstrap token（必填）')
  .option('--display-name <name>', '可选 worker 展示名')
  .action(async (opts: { url?: string, workerUrl?: string, bootstrapToken?: string, displayName?: string }) => {
    if (!opts.workerUrl || !opts.bootstrapToken) {
      consola.error('pair 必须同时提供 --worker-url 和 --bootstrap-token')
      process.exit(2)
    }
    const code = await runPair({
      ...(opts.url === undefined ? {} : { url: opts.url }),
      workerUrl: opts.workerUrl,
      bootstrapToken: opts.bootstrapToken,
      ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
    })
    process.exit(code)
  })

// --- workers.* ---
cli.command('workers list', '列出 fleet 内所有 worker').action(async () => {
  process.exit(await runWorkersList())
})

cli
  .command('workers info <workerId>', '查看某个 worker 的运行时信息')
  .action(async (workerId: string) => {
    process.exit(await runWorkersInfo(workerId))
  })

cli
  .command('workers launch', '让 gateway 在本机拉起一个新的 worker 容器并完成配对')
  .option('--display-name <name>', 'worker 展示名')
  .option('--image <image>', '容器镜像（默认由 gateway 决定）')
  .option('--force-id <id>', '强制使用给定 workerId（用于备份恢复）')
  .action(async (opts: { displayName?: string, image?: string, forceId?: string }) => {
    const code = await runWorkersLaunch({
      ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
      ...(opts.image === undefined ? {} : { image: opts.image }),
      ...(opts.forceId === undefined ? {} : { forceId: opts.forceId }),
    })
    process.exit(code)
  })

cli
  .command('workers stop <workerId>', '向目标 worker 下发停止指令（不摘除注册）')
  .action(async (workerId: string) => {
    process.exit(await runWorkersStop(workerId))
  })

cli
  .command('workers remove <workerId>', '把 worker 从 fleet 中摘除（deviceToken 作废）')
  .action(async (workerId: string) => {
    process.exit(await runWorkersRemove(workerId))
  })

// --- chat ---
cli
  .command('chat <workerId> <text>', '向某 worker 发一条消息并阻塞到 agent.done (NDJSON 输出)')
  .option('--conversation-id <id>', '显式指定会话 id；不传则由 worker 新建')
  .option('--timeout-ms <n>', '等 agent.done 的总超时，默认 120000', { type: [Number] })
  .action(async (workerId: string, text: string, opts: { conversationId?: string, timeoutMs?: number[] }) => {
    const code = await runChat({
      workerId,
      content: text,
      ...(opts.conversationId === undefined ? {} : { conversationId: opts.conversationId }),
      ...(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] }),
    })
    process.exit(code)
  })

// --- config.* ---
cli
  .command('config get <workerId>', '读取目标 worker 的当前配置')
  .action(async (workerId: string) => {
    process.exit(await runConfigGet(workerId))
  })

cli
  .command('config set <workerId> <json>', '更新 worker 配置（需要 --if-match 提供当前版本）')
  .option('--if-match <version>', '乐观锁；当前存储的 version 不等于此值则拒绝', { type: [Number] })
  .action(async (workerId: string, json: string, opts: { ifMatch?: number[] }) => {
    const ifMatch = opts.ifMatch?.[0]
    if (ifMatch === undefined) {
      consola.error('config set 必须显式提供 --if-match <version> 以防止误覆盖')
      process.exit(2)
    }
    process.exit(await runConfigSet({ workerId, configJson: json, ifMatch }))
  })

// --- token ---
cli
  .command('token rotate <workerId>', '为目标 worker 轮换 deviceToken（旧 token 立即失效）')
  .action(async (workerId: string) => {
    process.exit(await runTokenRotate(workerId))
  })

// --- schedule (cron) ---
cli
  .command('schedule list <workerId>', '列出某 worker 上所有 cron 任务')
  .action(async (workerId: string) => {
    process.exit(await runScheduleList(workerId))
  })

cli
  .command('schedule add <workerId>', '在某 worker 上新增一条 cron 任务')
  .option('--expression <expr>', '5-field cron 表达式（必填）')
  .option('--prompt <text>', 'cron 触发时合成的 envelope.text（必填）')
  .option('--channel <channel>', 'channel 类型：web/line/telegram/lark/whatsapp（必填）')
  .option('--chat-id <id>', '触发时使用的 chatId（必填）')
  .option('--account-id <id>', 'accountId，默认 sys:cron')
  .option('--disabled', '默认 enabled=true；带此 flag 改为 false')
  .action(async (workerId: string, opts: {
    expression?: string
    prompt?: string
    channel?: string
    chatId?: string
    accountId?: string
    disabled?: boolean
  }) => {
    if (!opts.expression || !opts.prompt || !opts.channel || !opts.chatId) {
      consola.error('schedule add 必须提供 --expression / --prompt / --channel / --chat-id')
      process.exit(2)
    }
    const code = await runScheduleAdd({
      workerId,
      expression: opts.expression,
      prompt: opts.prompt,
      channel: opts.channel,
      chatId: opts.chatId,
      ...(opts.accountId === undefined ? {} : { accountId: opts.accountId }),
      ...(opts.disabled === true ? { enabled: false } : {}),
    })
    process.exit(code)
  })

cli
  .command('schedule remove <workerId> <jobId>', '删除某 worker 上的某条 cron 任务')
  .action(async (workerId: string, jobId: string) => {
    process.exit(await runScheduleRemove(workerId, jobId))
  })

// --- logs ---
cli
  .command('logs <workerId>', '订阅某 worker 的日志尾部 (NDJSON 输出)')
  .option('--follow', '持续订阅直到超时或 Ctrl-C')
  .option('--tail <n>', '请求历史行数，上限 1000', { type: [Number] })
  .option('--timeout-ms <n>', '订阅总超时', { type: [Number] })
  .action(async (workerId: string, opts: { follow?: boolean, tail?: number[], timeoutMs?: number[] }) => {
    const code = await runLogs({
      workerId,
      ...(opts.follow === undefined ? {} : { follow: opts.follow }),
      ...(opts.tail?.[0] === undefined ? {} : { tail: opts.tail[0] }),
      ...(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] }),
    })
    process.exit(code)
  })

cli.help()
cli.version('0.1.0')

/**
 * cac 6 原生不支持多词子命令（`isMatched` 只比对 argv[0]），因此这里做一次 argv
 * 预处理：若 argv[2]+argv[3] 组成已注册的 `<group> <action>` 子命令名，合并成一个
 * 带空格的 token 喂给 cac。这样 `aim gateway start` 这种 UX 可以保留，而 cac 内部
 * 拿到的 `parsed.args[0]` 就是字面 "gateway start"，与 `.command('gateway start', ...)`
 * 注册时派生出的 name 精确匹配。
 */
function preprocessArgv(argv: string[]): string[] {
  const twoWordNames = new Set<string>()
  // 从已经注册的 cac 命令里动态收集带空格的 name，避免在此重复枚举。
  for (const cmd of cli.commands) {
    const name = cmd.name
    if (typeof name === 'string' && name.includes(' '))
      twoWordNames.add(name)
  }
  if (argv.length < 4)
    return argv
  const a = argv[2]
  const b = argv[3]
  if (typeof a !== 'string' || typeof b !== 'string')
    return argv
  const combined = `${a} ${b}`
  if (!twoWordNames.has(combined))
    return argv
  const out = argv.slice()
  out.splice(2, 2, combined)
  return out
}

try {
  cli.parse(preprocessArgv(process.argv), { run: false })
  await cli.runMatchedCommand()
}
catch (err) {
  consola.error(err)
  process.exit(1)
}
