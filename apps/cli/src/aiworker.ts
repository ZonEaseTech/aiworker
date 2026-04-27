#!/usr/bin/env bun
import process from 'node:process'

// FEAT-030: 必须在任何业务模块（含 packages/core 的 zod schema）import 之前
// 跑 dotenv bootstrap——schema 在 import 期就 parse process.env，必须先注入。
import { bootstrapDotenv } from './lib/dotenv-bootstrap'

bootstrapDotenv()

// FEAT-030: cli.version 动态读 package.json，与发布版本始终一致。
// Bun 支持 JSON imports 直接拿 package.json。
import packageJson from '../package.json' with { type: 'json' }

import cac from 'cac'
import consola from 'consola'

import {
  runApprovalsGrant as runApprovalsGrantRemote,
  runApprovalsList as runApprovalsListRemote,
} from './aim/commands/approvals'
import { runChat } from './aim/commands/chat'
import {
  runConfigGet,
  runConfigSet as runConfigSetRemote,
} from './aim/commands/config'
import { runEnrollApprove, runEnrollList, runEnrollReject } from './aim/commands/enroll'
import { runGatewayStart, runGatewayStatus, runGatewayStop } from './aim/commands/gateway'
import { runInstallSystemd } from './aim/commands/install'
import { runLogs } from './aim/commands/logs'
import { runPair } from './aim/commands/pair'
import {
  runScheduleAdd as runScheduleAddRemote,
  runScheduleList as runScheduleListRemote,
  runScheduleRemove as runScheduleRemoveRemote,
} from './aim/commands/schedule'
import { runTokenRotate as runTokenRotateRemote } from './aim/commands/token'
import {
  runWorkersInfo,
  runWorkersLaunch,
  runWorkersList,
  runWorkersRemove,
  runWorkersStop,
} from './aim/commands/workers'
import {
  runApprovalsGrant as runApprovalsGrantLocal,
  runApprovalsList as runApprovalsListLocal,
} from './commands/approvals'
import {
  runConfigSet as runConfigSetLocal,
  runConfigShow,
} from './commands/config'
import { runInit } from './commands/init'
import { runRun } from './commands/run'
import {
  runScheduleAdd as runScheduleAddLocal,
  runScheduleList as runScheduleListLocal,
  runScheduleRemove as runScheduleRemoveLocal,
} from './commands/schedule'
import { runServe } from './commands/serve'
import { runTokenRotate as runTokenRotateLocal } from './commands/token'

/**
 * aiworker —— 单二进制 CLI（PLAN-020 / FEAT-028）。
 *
 * 命名约定：
 *   - worker-local（直接读写本地 worker.db）使用 dash 形：
 *     init / run / serve / config-show / config-set / token-rotate /
 *     approvals-list / approvals-grant / schedule-list / schedule-add /
 *     schedule-remove
 *   - operator-remote（通过 WS 与 gateway / 远端 worker 对话）使用空格形：
 *     fleet ... / gateway ... / pair / chat / config get|set / token rotate /
 *     approvals list|grant / schedule list|add|remove / enroll list|approve|reject /
 *     logs / install systemd
 *
 * 退出码（详见 aim/commands/common.ts errorToExitCode）：
 *   0 成功；1 泛型错误；2 参数非法 / 未知方法；3 超时；4 连接断开。
 */
const cli = cac('aiworker')

// ============================================================
// worker-local（dash 形）
// ============================================================

cli.command('init', 'Bootstrap worker.db, mint identity + token, seed config').action(async () => {
  await runInit()
})

cli
  .command('run', 'Feed one message into the orchestrator without binding HTTP')
  .option('--message <text>', 'User message to ingest (required)')
  .option('--chat-id <id>', 'Synthetic chat id (defaults to "cli:stdin")')
  .option('--dry-run', 'Bootstrap everything but skip ingesting the envelope')
  .option('--timeout-ms <n>', 'Max wait for a terminal event, in ms (default 120000)', { type: [Number] })
  .action(async (opts: { message?: string, chatId?: string, dryRun?: boolean, timeoutMs?: number[] }) => {
    const code = await runRun({
      message: opts.message,
      chatId: opts.chatId,
      dryRun: opts.dryRun,
      timeoutMs: opts.timeoutMs?.[0],
    })
    process.exit(code)
  })

cli
  .command('serve', 'Start the worker HTTP server (equivalent to AIWORKER_MODE=worker)')
  .option('--port <n>', 'Override the PORT env', { type: [Number] })
  .option('--gateway <url>', 'Dial the given gateway WS URL as a node alongside the HTTP server')
  .option('--gateway-token <token>', 'Bearer token presented to the gateway (omit for loopback)')
  .option('--no-reconnect', 'Disable gateway-client auto-reconnect (useful for smoke / tests)')
  .action(async (opts: { port?: number[], gateway?: string, gatewayToken?: string, reconnect?: boolean }) => {
    const serveOptions: Parameters<typeof runServe>[0] = {}
    if (opts.port?.[0] !== undefined)
      serveOptions.port = opts.port[0]
    if (opts.gateway !== undefined)
      serveOptions.gateway = opts.gateway
    if (opts.gatewayToken !== undefined)
      serveOptions.gatewayToken = opts.gatewayToken
    if (opts.reconnect === false)
      serveOptions.gatewayReconnect = false
    await runServe(serveOptions)
  })

cli.command('config-show', 'Print the stored worker config as JSON').action(async () => {
  process.exit(await runConfigShow())
})

cli
  .command('config-set <json>', 'Replace the stored worker config')
  .option('--if-match <version>', 'Optimistic-concurrency guard (reject unless stored version matches)', { type: [Number] })
  .action(async (json: string, opts: { ifMatch?: number[] }) => {
    process.exit(await runConfigSetLocal({ json, ifMatch: opts.ifMatch?.[0] }))
  })

cli.command('token-rotate', 'Mint a fresh bearer token; prints the new plaintext once').action(async () => {
  process.exit(await runTokenRotateLocal())
})

cli.command('approvals-list', '列出当前 worker 进程内挂起的 per-tool 审批').action(async () => {
  process.exit(await runApprovalsListLocal())
})

cli
  .command('approvals-grant <taskId> <toolCallId>', '解锁某条挂起的 tool 审批')
  .option('--deny', '下发 deny 决策；默认 allow')
  .action(async (taskId: string, toolCallId: string, opts: { deny?: boolean }) => {
    process.exit(await runApprovalsGrantLocal({
      taskId,
      toolCallId,
      ...(opts.deny === undefined ? {} : { deny: opts.deny }),
    }))
  })

cli.command('schedule-list', 'List all cron jobs persisted in the local worker.db').action(async () => {
  process.exit(await runScheduleListLocal())
})

cli
  .command('schedule-add', 'Add a cron job to the local worker.db (validates expression up-front)')
  .option('--expression <expr>', 'Five-field cron expression (required)')
  .option('--prompt <text>', 'Envelope.text synthesised when the job fires (required)')
  .option('--channel <channel>', 'Channel: web/line/telegram/lark/whatsapp (required)')
  .option('--chat-id <id>', 'chatId used at fire time (required)')
  .option('--account-id <id>', 'Override accountId (defaults to sys:cron)')
  .option('--disabled', 'Persist with enabled=false (default is enabled=true)')
  .action(async (opts: {
    expression?: string
    prompt?: string
    channel?: string
    chatId?: string
    accountId?: string
    disabled?: boolean
  }) => {
    if (!opts.expression || !opts.prompt || !opts.channel || !opts.chatId) {
      consola.error('[aiworker schedule-add] requires --expression, --prompt, --channel, --chat-id')
      process.exit(2)
    }
    const code = await runScheduleAddLocal({
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
  .command('schedule-remove <jobId>', 'Remove a cron job from the local worker.db')
  .action(async (jobId: string) => {
    process.exit(await runScheduleRemoveLocal(jobId))
  })

// ============================================================
// operator-remote（空格形）
// ============================================================

// --- fleet 子命令组（原 `aim workers ...`）---
cli.command('fleet list', '列出 fleet 内所有 worker').action(async () => {
  process.exit(await runWorkersList())
})

cli
  .command('fleet info <workerId>', '查看某个 worker 的运行时信息')
  .action(async (workerId: string) => {
    process.exit(await runWorkersInfo(workerId))
  })

cli
  .command('fleet launch', '让 gateway 在本机拉起一个新的 worker 容器并完成配对')
  .option('--display-name <name>', 'worker 展示名')
  .option('--image <image>', '容器镜像（默认由 gateway 决定）')
  .option('--force-id <id>', '强制使用给定 workerId（用于备份恢复）')
  .action(async (opts: { displayName?: string, image?: string, forceId?: string }) => {
    process.exit(await runWorkersLaunch({
      ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
      ...(opts.image === undefined ? {} : { image: opts.image }),
      ...(opts.forceId === undefined ? {} : { forceId: opts.forceId }),
    }))
  })

cli
  .command('fleet stop <workerId>', '向目标 worker 下发停止指令（不摘除注册）')
  .action(async (workerId: string) => {
    process.exit(await runWorkersStop(workerId))
  })

cli
  .command('fleet remove <workerId>', '把 worker 从 fleet 中摘除（deviceToken 作废）')
  .action(async (workerId: string) => {
    process.exit(await runWorkersRemove(workerId))
  })

// --- gateway 子命令组（本地 daemon）---
cli
  .command('gateway start', '拉起 gateway server（默认 foreground，systemd 友好；--detach 走后台 daemon）')
  .option('--port <n>', '监听端口，默认 9218', { type: [Number] })
  .option('--detach', '后台 daemon 模式：spawn 自身 + PID/log 写入 ~/.aiworker/')
  .action(async (opts: { port?: number[], detach?: boolean }) => {
    // env AIWORKER_GATEWAY_INTERNAL_FOREGROUND=1 是 daemon 子进程标记；强制 foreground，
    // 即便误带 --detach（无害）。
    const internal = process.env.AIWORKER_GATEWAY_INTERNAL_FOREGROUND === '1'
    const detach = internal ? false : opts.detach === true
    process.exit(await runGatewayStart({
      ...(opts.port?.[0] === undefined ? {} : { port: opts.port[0] }),
      detach,
    }))
  })

cli.command('gateway status', '显示 gateway daemon 是否运行').action(() => {
  process.exit(runGatewayStatus())
})

cli
  .command('gateway stop', '停止 gateway daemon (SIGTERM, 超时后 SIGKILL)')
  .option('--timeout-ms <n>', 'SIGTERM 超时，默认 5000ms', { type: [Number] })
  .action(async (opts: { timeoutMs?: number[] }) => {
    process.exit(await runGatewayStop(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] }))
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
    process.exit(await runPair({
      ...(opts.url === undefined ? {} : { url: opts.url }),
      workerUrl: opts.workerUrl,
      bootstrapToken: opts.bootstrapToken,
      ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
    }))
  })

// --- chat ---
cli
  .command('chat <workerId> <text>', '向某 worker 发一条消息并阻塞到 agent.done (NDJSON 输出)')
  .option('--conversation-id <id>', '显式指定会话 id；不传则由 worker 新建')
  .option('--timeout-ms <n>', '等 agent.done 的总超时，默认 120000', { type: [Number] })
  .action(async (workerId: string, text: string, opts: { conversationId?: string, timeoutMs?: number[] }) => {
    process.exit(await runChat({
      workerId,
      content: text,
      ...(opts.conversationId === undefined ? {} : { conversationId: opts.conversationId }),
      ...(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] }),
    }))
  })

// --- config get/set（远端 worker）---
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
    process.exit(await runConfigSetRemote({ workerId, configJson: json, ifMatch }))
  })

// --- token rotate（远端 worker）---
cli
  .command('token rotate <workerId>', '为目标 worker 轮换 deviceToken（旧 token 立即失效）')
  .action(async (workerId: string) => {
    process.exit(await runTokenRotateRemote(workerId))
  })

// --- approvals list/grant（远端）---
cli
  .command('approvals list', '列出挂起的 per-tool 审批；默认覆盖所有 online worker')
  .option('--worker <id>', '只查指定 workerId（不传则聚合所有 online worker）')
  .action(async (opts: { worker?: string }) => {
    process.exit(await runApprovalsListRemote({ ...(opts.worker === undefined ? {} : { workerId: opts.worker }) }))
  })

cli
  .command('approvals grant <workerId> <taskId> <toolCallId>', '解锁某条 worker 上挂起的 tool 审批')
  .option('--deny', '下发 deny 决策；不带此 flag 默认 allow')
  .action(async (workerId: string, taskId: string, toolCallId: string, opts: { deny?: boolean }) => {
    process.exit(await runApprovalsGrantRemote({
      workerId,
      taskId,
      toolCallId,
      ...(opts.deny === undefined ? {} : { deny: opts.deny }),
    }))
  })

// --- schedule list/add/remove（远端）---
cli
  .command('schedule list <workerId>', '列出某 worker 上所有 cron 任务')
  .action(async (workerId: string) => {
    process.exit(await runScheduleListRemote(workerId))
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
    process.exit(await runScheduleAddRemote({
      workerId,
      expression: opts.expression,
      prompt: opts.prompt,
      channel: opts.channel,
      chatId: opts.chatId,
      ...(opts.accountId === undefined ? {} : { accountId: opts.accountId }),
      ...(opts.disabled === true ? { enabled: false } : {}),
    }))
  })

cli
  .command('schedule remove <workerId> <jobId>', '删除某 worker 上的某条 cron 任务')
  .action(async (workerId: string, jobId: string) => {
    process.exit(await runScheduleRemoveRemote(workerId, jobId))
  })

// --- enroll list/approve/reject（OTP-attended enrollment）---
cli.command('enroll list', '列出 gateway 当前所有 pending OTP enrollment').action(async () => {
  process.exit(await runEnrollList())
})

cli
  .command('enroll approve <otp>', '批准某条 pending OTP enrollment（worker 立即加入 fleet）')
  .action(async (otp: string) => {
    process.exit(await runEnrollApprove(otp))
  })

cli
  .command('enroll reject <otp>', '拒绝某条 pending OTP enrollment（worker 收到 close 4403）')
  .action(async (otp: string) => {
    process.exit(await runEnrollReject(otp))
  })

// --- logs ---
cli
  .command('logs <workerId>', '订阅某 worker 的日志尾部 (NDJSON 输出)')
  .option('--follow', '持续订阅直到超时或 Ctrl-C')
  .option('--tail <n>', '请求历史行数，上限 1000', { type: [Number] })
  .option('--timeout-ms <n>', '订阅总超时', { type: [Number] })
  .action(async (workerId: string, opts: { follow?: boolean, tail?: number[], timeoutMs?: number[] }) => {
    process.exit(await runLogs({
      workerId,
      ...(opts.follow === undefined ? {} : { follow: opts.follow }),
      ...(opts.tail?.[0] === undefined ? {} : { tail: opts.tail[0] }),
      ...(opts.timeoutMs?.[0] === undefined ? {} : { timeoutMs: opts.timeoutMs[0] }),
    }))
  })

// --- install systemd ---
cli
  .command('install systemd', '渲染 aiworker-gateway.service 并（可选）注册到 systemd')
  .option('--user', 'systemd 用户实例（默认）；写到 ~/.config/systemd/user/')
  .option('--system', 'systemd 系统实例（需 root）；写到 /etc/systemd/system/')
  .option('--dry-run', '只往 stdout 打 unit 内容，不写盘也不 systemctl')
  .option('--out <path>', '覆盖目标路径（异常布局/测试用）；自动跳过 systemctl')
  .option('--no-enable', '写盘后跳过 systemctl daemon-reload + enable --now')
  .action(async (opts: { user?: boolean, system?: boolean, dryRun?: boolean, out?: string, enable?: boolean }) => {
    if (opts.user === true && opts.system === true) {
      consola.error('install systemd: 不能同时指定 --user 和 --system')
      process.exit(2)
    }
    process.exit(await runInstallSystemd({
      scope: opts.system === true ? 'system' : 'user',
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.out === undefined ? {} : { out: opts.out }),
      ...(opts.enable === false ? { noEnable: true } : {}),
    }))
  })

cli.help()
cli.version(packageJson.version)

/**
 * cac 6 原生不支持多词子命令（`isMatched` 只比对 argv[0]），因此这里做一次 argv
 * 预处理：从已注册命令里动态收集所有含空格的 name；若 argv 中接连若干 token 拼起来
 * 命中其中一个，就把它们 collapse 成一个带空格的 token 再喂给 cac。
 *
 * 当前命令树最深 2 词（`fleet list` / `enroll approve` / `install systemd` 等），但实现
 * 时按 N 词支持，避免后续扩展时再回头改预处理。
 */
export function preprocessArgv(argv: string[], cliInstance: { commands: Array<{ name: string }> } = cli): string[] {
  const multiWordNames = new Set<string>()
  let maxDepth = 1
  for (const cmd of cliInstance.commands) {
    const name = cmd.name
    if (typeof name === 'string' && name.includes(' ')) {
      multiWordNames.add(name)
      const depth = name.split(' ').length
      if (depth > maxDepth)
        maxDepth = depth
    }
  }
  if (multiWordNames.size === 0 || argv.length < 4)
    return argv
  // 按最长前缀优先匹配（`config get` 不会被错误折叠成 `config`）。
  for (let depth = maxDepth; depth >= 2; depth--) {
    if (argv.length < 2 + depth)
      continue
    const slice = argv.slice(2, 2 + depth)
    if (slice.some(t => typeof t !== 'string'))
      continue
    const combined = slice.join(' ')
    if (multiWordNames.has(combined)) {
      const out = argv.slice()
      out.splice(2, depth, combined)
      return out
    }
  }
  return argv
}

export { cli }

if (import.meta.main) {
  try {
    cli.parse(preprocessArgv(process.argv), { run: false })
    await cli.runMatchedCommand()
  }
  catch (err) {
    consola.error(err)
    process.exit(1)
  }
}
