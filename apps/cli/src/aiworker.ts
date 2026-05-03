#!/usr/bin/env bun
import process from 'node:process'

import cac from 'cac'
import consola from 'consola'

// FEAT-030: cli.version 动态读 package.json，与发布版本始终一致。
// Bun 支持 JSON imports 直接拿 package.json。
import packageJson from '../package.json' with { type: 'json' }

import {
  runApprovalsGrant as runApprovalsGrantRemote,
  runApprovalsList as runApprovalsListRemote,
} from './commands/fleet/approvals'

import { runChat } from './commands/fleet/chat'
import {
  runConfigGet,
  runConfigSet as runConfigSetRemote,
} from './commands/fleet/config'
import { runEnrollApprove, runEnrollList, runEnrollReject } from './commands/fleet/enroll'
import { runLogs } from './commands/fleet/logs'
import { runPair } from './commands/fleet/pair'
import {
  runScheduleAdd as runScheduleAddRemote,
  runScheduleList as runScheduleListRemote,
  runScheduleRemove as runScheduleRemoveRemote,
} from './commands/fleet/schedule'
import { runTokenRotate as runTokenRotateRemote } from './commands/fleet/token'
import {
  runWorkersInfo,
  runWorkersLaunch,
  runWorkersList,
  runWorkersRemove,
  runWorkersStop,
} from './commands/fleet/workers'
import { runGatewayStart, runGatewayStatus, runGatewayStop } from './commands/gateway/gateway'
import { runInstallSystemd } from './commands/gateway/install'
import {
  runApprovalsGrant as runApprovalsGrantLocal,
  runApprovalsList as runApprovalsListLocal,
} from './commands/worker/approvals'
import {
  runConfigSet as runConfigSetLocal,
  runConfigShow,
} from './commands/worker/config'
import { runDoctor } from './commands/worker/doctor'
import {
  runExecutorDoctor,
  runExecutorMcpAdd,
  runExecutorMcpSync,
} from './commands/worker/executor'
import { runInit } from './commands/worker/init'
import { runRun } from './commands/worker/run'
import {
  runScheduleAdd as runScheduleAddLocal,
  runScheduleList as runScheduleListLocal,
  runScheduleRemove as runScheduleRemoveLocal,
} from './commands/worker/schedule'
import { runScope } from './commands/worker/scope'
import { runServe } from './commands/worker/serve'
import {
  runSessionsList,
  runSessionsMaintenance,
  runSessionsShow,
} from './commands/worker/sessions'
import { runSoulList, runSoulShow } from './commands/worker/soul'
import { runTokenRotate as runTokenRotateLocal } from './commands/worker/token'
import { runUp } from './commands/worker/up'
import { configureCliHelp, localizeGlobalOptions } from './help'
import { bootstrapCliDotenv } from './lib/bootstrap'

/**
 * aiworker —— 单二进制 CLI（PLAN-020 / FEAT-028）。
 *
 * 命名约定：
 *   - `aiworker ...` 等价于 `aiworker worker ...`，直接读写本地 worker.db。
 *   - `aiworker worker ...` 是本地 worker 的 canonical tree。
 *   - `aiworker fleet ...` 通过 gateway WS 操作 fleet 和远端 worker。
 *   - `aiworker gateway ...` 管理 gateway 生命周期和安装。
 *
 * 退出码（详见 operator commands/common.ts errorToExitCode）：
 *   0 成功；1 泛型错误；2 参数非法 / 未知方法；3 超时；4 连接断开。
 */
const cli = cac('aiworker')

function readServeOpenOption(argv: string[] = process.argv): boolean | undefined {
  const args = argv.slice(2)
  if (args.includes('--no-open'))
    return false
  if (args.includes('--open'))
    return true
  return undefined
}

function optionalNumber(values: number[] | undefined): number | undefined {
  const value = values?.[0]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// ============================================================
// worker-local（root shortcuts）
// ============================================================

cli
  .command('init', '初始化 worker.db、身份、token 和默认配置（默认当前项目 `<cwd>/.aiworker/`；--global 使用旧版 ~/.aiworker）')
  .option('--global', '初始化旧版用户级 `~/.aiworker/`（单主机全局 worker）')
  .option('--force', '兼容旧脚本；项目初始化允许在非 git 目录运行，且仍不会覆盖现有文件')
  .option('--dry-run', '只打印初始化预检和计划写入，不创建或修改文件')
  .option('--soul <preset>', '项目级初始化使用的 Soul 预设；非交互 brand-new init 必填，可选 developer/project-manager/devops-sre/product-designer/qa-reviewer/support-operator/finance-ops/hr-recruiting/general-assistant/customize')
  .action(async (opts: { dryRun?: boolean, global?: boolean, force?: boolean, soul?: string }) => {
    process.exit(await runInit({
      ...(opts.global === true ? { global: true } : {}),
      ...(opts.force === true ? { force: true } : {}),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.soul === undefined ? {} : { soul: opts.soul }),
    }))
  })

cli
  .command('up', '一条命令初始化、验证并启动本地 worker HTTP/admin')
  .option('--soul <preset>', 'brand-new project 初始化使用的 Soul 预设；已初始化项目不会消费此参数')
  .option('--dry-run', '只打印 up 阶段和预检结果，不初始化、不启动 HTTP server、不打开浏览器')
  .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
  .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
  .option('--gateway <url>', '随 HTTP server 一起连接指定 gateway WebSocket URL')
  .option('--gateway-token <token>', '连接 gateway 时使用的 bearer token（loopback 可省略）')
  .option('--no-reconnect', '关闭 gateway-client 自动重连（smoke / 测试时使用）')
  .option('--no-serve-web', '不挂载 worker bundle 到 /admin/*（默认挂载）')
  .option('--open', '启动后打开 worker admin')
  .option('--no-open', '启动后不自动打开 worker admin')
  .action(async (opts: {
    dryRun?: boolean
    gateway?: string
    gatewayToken?: string
    host?: string
    port?: number[]
    reconnect?: boolean
    serveWeb?: boolean
    soul?: string
  }) => {
    const open = readServeOpenOption()
    const port = optionalNumber(opts.port)
    process.exit(await runUp({
      ...(opts.soul === undefined ? {} : { soul: opts.soul }),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(port === undefined ? {} : { port }),
      ...(opts.host === undefined ? {} : { host: opts.host }),
      ...(opts.gateway === undefined ? {} : { gateway: opts.gateway }),
      ...(opts.gatewayToken === undefined ? {} : { gatewayToken: opts.gatewayToken }),
      ...(opts.reconnect === false ? { gatewayReconnect: false } : {}),
      ...(opts.serveWeb === false ? { serveWeb: false } : {}),
      ...(open === undefined ? {} : { open }),
      runtimeVersion: packageJson.version,
    }))
  })

cli
  .command('scope', '打印当前 aiworker scope（user/project/explicit）和关键布局文件状态')
  .action(async () => {
    process.exitCode = await runScope()
  })

cli.command('doctor', '静态验证当前 `.aiworker/` capability manifests、Skill metadata 和 MCP descriptors').action(async () => {
  process.exit(await runDoctor())
})

cli
  .command('executor mcp add <name>', '声明一个 executor 原生 MCP server，并写入 `.aiworker/executor-capabilities.json`')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--scope <scope>', 'MCP 配置 scope；当前仅支持 project')
  .option('--transport <transport>', 'MCP transport：stdio / streamable-http / sse；未指定时按 --url 推断')
  .option('--url <url>', 'HTTP/SSE MCP server URL')
  .option('--command <command>', 'stdio MCP server command')
  .option('--arg <value>', 'stdio command 参数；可重复')
  .option('--env <key=value>', '投影到 engine CLI 的 env；secret 用 key=secretRef:<ref>；可重复')
  .option('--header <key=value>', '投影到 engine CLI 的 header；secret 用 key=secretRef:<ref>；可重复')
  .option('--description <text>', 'MCP server 描述')
  .option('--dry-run', '只预览 manifest 变更，不写文件')
  .action(async (name: string, opts: Parameters<typeof runExecutorMcpAdd>[1]) => {
    process.exit(await runExecutorMcpAdd(name, opts))
  })

cli
  .command('executor mcp sync', '把 `.aiworker/executor-capabilities.json` 投影到 engine 官方 project-scope MCP 配置')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--dry-run', '只打印将执行的 engine CLI 命令')
  .action(async (opts: Parameters<typeof runExecutorMcpSync>[0]) => {
    process.exit(await runExecutorMcpSync(opts))
  })

cli
  .command('executor doctor', '验证 executor capability manifest、engine CLI availability 和安全约束')
  .option('--engine <engine>', '只检查一个 engine：codex 或 claude-code')
  .action(async (opts: Parameters<typeof runExecutorDoctor>[0]) => {
    process.exit(await runExecutorDoctor(opts))
  })

cli.command('soul list', '列出内置 Soul 预设及其声明能力').action(async () => {
  process.exit(await runSoulList())
})

cli.command('soul show <preset>', '查看某个 Soul 预设的职责、边界、能力草案和风险策略').action(async (preset: string) => {
  process.exit(await runSoulShow(preset))
})

cli
  .command('run', '不启动 HTTP server，直接给 orchestrator 投递一条消息')
  .option('--message <text>', '要投递的用户消息（必填）')
  .option('--chat-id <id>', '合成 chat id（默认 "cli:stdin"）')
  .option('--dry-run', '完成 bootstrap，但不真正投递 envelope')
  .option('--timeout-ms <n>', '等待终态事件的最长时间，单位毫秒（默认 120000）', { type: [Number] })
  .action(async (opts: { message?: string, chatId?: string, dryRun?: boolean, timeoutMs?: number[] }) => {
    const code = await runRun({
      message: opts.message,
      chatId: opts.chatId,
      dryRun: opts.dryRun,
      timeoutMs: optionalNumber(opts.timeoutMs),
    })
    process.exit(code)
  })

cli
  .command('serve', '启动 worker HTTP server（等价于 AIWORKER_MODE=worker）')
  .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
  .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
  .option('--gateway <url>', '随 HTTP server 一起连接指定 gateway WebSocket URL')
  .option('--gateway-token <token>', '连接 gateway 时使用的 bearer token（loopback 可省略）')
  .option('--no-reconnect', '关闭 gateway-client 自动重连（smoke / 测试时使用）')
  .option('--no-serve-web', '不挂载 worker bundle 到 /admin/*（默认挂载）')
  .option('--open', '启动后打开 worker admin')
  .option('--no-open', '启动后不自动打开 worker admin')
  .action(async (opts: { port?: number[], host?: string, gateway?: string, gatewayToken?: string, reconnect?: boolean, serveWeb?: boolean }) => {
    const serveOptions: Parameters<typeof runServe>[0] = {}
    const port = optionalNumber(opts.port)
    if (port !== undefined)
      serveOptions.port = port
    if (opts.host !== undefined)
      serveOptions.host = opts.host
    if (opts.gateway !== undefined)
      serveOptions.gateway = opts.gateway
    if (opts.gatewayToken !== undefined)
      serveOptions.gatewayToken = opts.gatewayToken
    if (opts.reconnect === false)
      serveOptions.gatewayReconnect = false
    if (opts.serveWeb === false)
      serveOptions.serveWeb = false
    const open = readServeOpenOption()
    if (open !== undefined)
      serveOptions.open = open
    serveOptions.runtimeVersion = packageJson.version
    await runServe(serveOptions)
  })

cli.command('config show', '以 JSON 打印本地 worker 配置（缺失时会初始化本地 worker 状态）').action(async () => {
  process.exit(await runConfigShow())
})

cli
  .command('config set <json>', '替换本地 worker 配置')
  .option('--if-match <version>', '乐观锁；当前存储 version 不等于此值则拒绝', { type: [Number] })
  .action(async (json: string, opts: { ifMatch?: number[] }) => {
    process.exit(await runConfigSetLocal({ json, ifMatch: optionalNumber(opts.ifMatch) }))
  })

cli.command('token rotate', '生成新的 bearer token；明文只打印一次').action(async () => {
  process.exit(await runTokenRotateLocal())
})

cli.command('approvals list', '列出当前 worker 进程内挂起的工具审批').action(async () => {
  process.exit(await runApprovalsListLocal())
})

cli
  .command('approvals grant <taskId> <toolCallId>', '解锁某条挂起的工具审批')
  .option('--deny', '下发拒绝决策；默认允许')
  .action(async (taskId: string, toolCallId: string, opts: { deny?: boolean }) => {
    process.exit(await runApprovalsGrantLocal({
      taskId,
      toolCallId,
      ...(opts.deny === undefined ? {} : { deny: opts.deny }),
    }))
  })

cli.command('schedule list', '列出本地 worker.db 中持久化的所有 cron 任务').action(async () => {
  process.exit(await runScheduleListLocal())
})

cli
  .command('schedule add', '向本地 worker.db 新增 cron 任务（会先校验表达式）')
  .option('--expression <expr>', '五段 cron 表达式（必填）')
  .option('--prompt <text>', '任务触发时合成的 envelope.text（必填）')
  .option('--channel <channel>', 'channel 类型：web/line/telegram/lark/whatsapp（必填）')
  .option('--chat-id <id>', '任务触发时使用的 chatId（必填）')
  .option('--account-id <id>', '覆盖 accountId（默认 sys:cron）')
  .option('--disabled', '以 enabled=false 保存（默认 enabled=true）')
  .action(async (opts: {
    expression?: string
    prompt?: string
    channel?: string
    chatId?: string
    accountId?: string
    disabled?: boolean
  }) => {
    if (!opts.expression || !opts.prompt || !opts.channel || !opts.chatId) {
      consola.error('[aiworker schedule add] requires --expression, --prompt, --channel, --chat-id')
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
  .command('schedule remove <jobId>', '从本地 worker.db 删除一条 cron 任务')
  .action(async (jobId: string) => {
    process.exit(await runScheduleRemoveLocal(jobId))
  })

cli
  .command('sessions list', '从 worker.db 列出本地 worker 会话状态')
  .option('--limit <n>', '最多返回会话数（1-200，默认 50）', { type: [Number] })
  .option('--offset <n>', '分页偏移量（默认 0）', { type: [Number] })
  .option('--status <status>', '按状态过滤：active 或 closed')
  .action(async (opts: { limit?: number[], offset?: number[], status?: string }) => {
    process.exit(await runSessionsList({
      limit: optionalNumber(opts.limit),
      offset: optionalNumber(opts.offset),
      ...(opts.status === undefined ? {} : { status: opts.status }),
    }))
  })

cli
  .command('sessions show <sessionKey>', '按 session key 查看一个本地 worker 会话状态')
  .action(async (sessionKey: string) => {
    process.exit(await runSessionsShow(sessionKey))
  })

cli
  .command('sessions maintenance', '试算已关闭 transcript 清理；带 --apply 才会实际删除')
  .option('--older-than-days <n>', '已关闭 transcript 保留天数（默认 30）', { type: [Number] })
  .option('--limit <n>', '最多试算/清理 transcript 数量（1-200，默认 50）', { type: [Number] })
  .option('--apply', '实际删除计划内的已关闭 transcript，而不是 dry-run')
  .action(async (opts: { olderThanDays?: number[], limit?: number[], apply?: boolean }) => {
    process.exit(await runSessionsMaintenance({
      olderThanDays: optionalNumber(opts.olderThanDays),
      limit: optionalNumber(opts.limit),
      ...(opts.apply === undefined ? {} : { apply: opts.apply }),
    }))
  })

// ============================================================
// worker canonical tree（与 root worker shortcuts 等价）
// ============================================================

cli
  .command('worker init', '初始化 worker.db、身份、token 和默认配置（默认当前项目 `<cwd>/.aiworker/`；--global 使用旧版 ~/.aiworker）')
  .option('--global', '初始化旧版用户级 `~/.aiworker/`（单主机全局 worker）')
  .option('--force', '项目初始化允许在非 git 目录运行，且仍不会覆盖现有文件')
  .option('--dry-run', '只打印初始化预检和计划写入，不创建或修改文件')
  .option('--soul <preset>', '项目级初始化使用的 Soul 预设；非交互 brand-new init 必填，可选 developer/project-manager/devops-sre/product-designer/qa-reviewer/support-operator/finance-ops/hr-recruiting/general-assistant/customize')
  .action(async (opts: { dryRun?: boolean, global?: boolean, force?: boolean, soul?: string }) => {
    process.exit(await runInit({
      ...(opts.global === true ? { global: true } : {}),
      ...(opts.force === true ? { force: true } : {}),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.soul === undefined ? {} : { soul: opts.soul }),
    }))
  })

cli
  .command('worker up', '一条命令初始化、验证并启动本地 worker HTTP/admin')
  .option('--soul <preset>', 'brand-new project 初始化使用的 Soul 预设；已初始化项目不会消费此参数')
  .option('--dry-run', '只打印 up 阶段和预检结果，不初始化、不启动 HTTP server、不打开浏览器')
  .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
  .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
  .option('--gateway <url>', '随 HTTP server 一起连接指定 gateway WebSocket URL')
  .option('--gateway-token <token>', '连接 gateway 时使用的 bearer token（loopback 可省略）')
  .option('--no-reconnect', '关闭 gateway-client 自动重连（smoke / 测试时使用）')
  .option('--no-serve-web', '不挂载 worker bundle 到 /admin/*（默认挂载）')
  .option('--open', '启动后打开 worker admin')
  .option('--no-open', '启动后不自动打开 worker admin')
  .action(async (opts: {
    dryRun?: boolean
    gateway?: string
    gatewayToken?: string
    host?: string
    port?: number[]
    reconnect?: boolean
    serveWeb?: boolean
    soul?: string
  }) => {
    const open = readServeOpenOption()
    const port = optionalNumber(opts.port)
    process.exit(await runUp({
      ...(opts.soul === undefined ? {} : { soul: opts.soul }),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(port === undefined ? {} : { port }),
      ...(opts.host === undefined ? {} : { host: opts.host }),
      ...(opts.gateway === undefined ? {} : { gateway: opts.gateway }),
      ...(opts.gatewayToken === undefined ? {} : { gatewayToken: opts.gatewayToken }),
      ...(opts.reconnect === false ? { gatewayReconnect: false } : {}),
      ...(opts.serveWeb === false ? { serveWeb: false } : {}),
      ...(open === undefined ? {} : { open }),
      runtimeVersion: packageJson.version,
    }))
  })

cli
  .command('worker scope', '打印当前 aiworker scope（user/project/explicit）和关键布局文件状态')
  .action(async () => {
    process.exitCode = await runScope()
  })

cli.command('worker doctor', '静态验证当前 `.aiworker/` capability manifests、Skill metadata 和 MCP descriptors').action(async () => {
  process.exit(await runDoctor())
})

cli
  .command('worker executor mcp add <name>', '声明一个 executor 原生 MCP server，并写入 `.aiworker/executor-capabilities.json`')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--scope <scope>', 'MCP 配置 scope；当前仅支持 project')
  .option('--transport <transport>', 'MCP transport：stdio / streamable-http / sse；未指定时按 --url 推断')
  .option('--url <url>', 'HTTP/SSE MCP server URL')
  .option('--command <command>', 'stdio MCP server command')
  .option('--arg <value>', 'stdio command 参数；可重复')
  .option('--env <key=value>', '投影到 engine CLI 的 env；secret 用 key=secretRef:<ref>；可重复')
  .option('--header <key=value>', '投影到 engine CLI 的 header；secret 用 key=secretRef:<ref>；可重复')
  .option('--description <text>', 'MCP server 描述')
  .option('--dry-run', '只预览 manifest 变更，不写文件')
  .action(async (name: string, opts: Parameters<typeof runExecutorMcpAdd>[1]) => {
    process.exit(await runExecutorMcpAdd(name, opts))
  })

cli
  .command('worker executor mcp sync', '把 `.aiworker/executor-capabilities.json` 投影到 engine 官方 project-scope MCP 配置')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--dry-run', '只打印将执行的 engine CLI 命令')
  .action(async (opts: Parameters<typeof runExecutorMcpSync>[0]) => {
    process.exit(await runExecutorMcpSync(opts))
  })

cli
  .command('worker executor doctor', '验证 executor capability manifest、engine CLI availability 和安全约束')
  .option('--engine <engine>', '只检查一个 engine：codex 或 claude-code')
  .action(async (opts: Parameters<typeof runExecutorDoctor>[0]) => {
    process.exit(await runExecutorDoctor(opts))
  })

cli.command('worker soul list', '列出内置 Soul 预设及其声明能力').action(async () => {
  process.exit(await runSoulList())
})

cli.command('worker soul show <preset>', '查看某个 Soul 预设的职责、边界、能力草案和风险策略').action(async (preset: string) => {
  process.exit(await runSoulShow(preset))
})

cli
  .command('worker run', '不启动 HTTP server，直接给 orchestrator 投递一条消息')
  .option('--message <text>', '要投递的用户消息（必填）')
  .option('--chat-id <id>', '合成 chat id（默认 "cli:stdin"）')
  .option('--dry-run', '完成 bootstrap，但不真正投递 envelope')
  .option('--timeout-ms <n>', '等待终态事件的最长时间，单位毫秒（默认 120000）', { type: [Number] })
  .action(async (opts: { message?: string, chatId?: string, dryRun?: boolean, timeoutMs?: number[] }) => {
    const code = await runRun({
      message: opts.message,
      chatId: opts.chatId,
      dryRun: opts.dryRun,
      timeoutMs: optionalNumber(opts.timeoutMs),
    })
    process.exit(code)
  })

cli
  .command('worker serve', '启动 worker HTTP server（等价于 AIWORKER_MODE=worker）')
  .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
  .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
  .option('--gateway <url>', '随 HTTP server 一起连接指定 gateway WebSocket URL')
  .option('--gateway-token <token>', '连接 gateway 时使用的 bearer token（loopback 可省略）')
  .option('--no-reconnect', '关闭 gateway-client 自动重连（smoke / 测试时使用）')
  .option('--no-serve-web', '不挂载 worker bundle 到 /admin/*（默认挂载）')
  .option('--open', '启动后打开 worker admin')
  .option('--no-open', '启动后不自动打开 worker admin')
  .action(async (opts: { port?: number[], host?: string, gateway?: string, gatewayToken?: string, reconnect?: boolean, serveWeb?: boolean }) => {
    const serveOptions: Parameters<typeof runServe>[0] = {}
    const port = optionalNumber(opts.port)
    if (port !== undefined)
      serveOptions.port = port
    if (opts.host !== undefined)
      serveOptions.host = opts.host
    if (opts.gateway !== undefined)
      serveOptions.gateway = opts.gateway
    if (opts.gatewayToken !== undefined)
      serveOptions.gatewayToken = opts.gatewayToken
    if (opts.reconnect === false)
      serveOptions.gatewayReconnect = false
    if (opts.serveWeb === false)
      serveOptions.serveWeb = false
    const open = readServeOpenOption()
    if (open !== undefined)
      serveOptions.open = open
    serveOptions.runtimeVersion = packageJson.version
    await runServe(serveOptions)
  })

cli.command('worker config show', '以 JSON 打印本地 worker 配置（缺失时会初始化本地 worker 状态）').action(async () => {
  process.exit(await runConfigShow())
})

cli
  .command('worker config set <json>', '替换本地 worker 配置')
  .option('--if-match <version>', '乐观锁；当前存储 version 不等于此值则拒绝', { type: [Number] })
  .action(async (json: string, opts: { ifMatch?: number[] }) => {
    process.exit(await runConfigSetLocal({ json, ifMatch: optionalNumber(opts.ifMatch) }))
  })

cli.command('worker token rotate', '生成新的 bearer token；明文只打印一次').action(async () => {
  process.exit(await runTokenRotateLocal())
})

cli.command('worker approvals list', '列出当前 worker 进程内挂起的工具审批').action(async () => {
  process.exit(await runApprovalsListLocal())
})

cli
  .command('worker approvals grant <taskId> <toolCallId>', '解锁某条挂起的工具审批')
  .option('--deny', '下发拒绝决策；默认允许')
  .action(async (taskId: string, toolCallId: string, opts: { deny?: boolean }) => {
    process.exit(await runApprovalsGrantLocal({
      taskId,
      toolCallId,
      ...(opts.deny === undefined ? {} : { deny: opts.deny }),
    }))
  })

cli.command('worker schedule list', '列出本地 worker.db 中持久化的所有 cron 任务').action(async () => {
  process.exit(await runScheduleListLocal())
})

cli
  .command('worker schedule add', '向本地 worker.db 新增 cron 任务（会先校验表达式）')
  .option('--expression <expr>', '五段 cron 表达式（必填）')
  .option('--prompt <text>', '任务触发时合成的 envelope.text（必填）')
  .option('--channel <channel>', 'channel 类型：web/line/telegram/lark/whatsapp（必填）')
  .option('--chat-id <id>', '任务触发时使用的 chatId（必填）')
  .option('--account-id <id>', '覆盖 accountId（默认 sys:cron）')
  .option('--disabled', '以 enabled=false 保存（默认 enabled=true）')
  .action(async (opts: {
    expression?: string
    prompt?: string
    channel?: string
    chatId?: string
    accountId?: string
    disabled?: boolean
  }) => {
    if (!opts.expression || !opts.prompt || !opts.channel || !opts.chatId) {
      consola.error('[aiworker worker schedule add] requires --expression, --prompt, --channel, --chat-id')
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
  .command('worker schedule remove <jobId>', '从本地 worker.db 删除一条 cron 任务')
  .action(async (jobId: string) => {
    process.exit(await runScheduleRemoveLocal(jobId))
  })

cli
  .command('worker sessions list', '从 worker.db 列出本地 worker 会话状态')
  .option('--limit <n>', '最多返回会话数（1-200，默认 50）', { type: [Number] })
  .option('--offset <n>', '分页偏移量（默认 0）', { type: [Number] })
  .option('--status <status>', '按状态过滤：active 或 closed')
  .action(async (opts: { limit?: number[], offset?: number[], status?: string }) => {
    process.exit(await runSessionsList({
      limit: optionalNumber(opts.limit),
      offset: optionalNumber(opts.offset),
      ...(opts.status === undefined ? {} : { status: opts.status }),
    }))
  })

cli
  .command('worker sessions show <sessionKey>', '按 session key 查看一个本地 worker 会话状态')
  .action(async (sessionKey: string) => {
    process.exit(await runSessionsShow(sessionKey))
  })

cli
  .command('worker sessions maintenance', '试算已关闭 transcript 清理；带 --apply 才会实际删除')
  .option('--older-than-days <n>', '已关闭 transcript 保留天数（默认 30）', { type: [Number] })
  .option('--limit <n>', '最多试算/清理 transcript 数量（1-200，默认 50）', { type: [Number] })
  .option('--apply', '实际删除计划内的已关闭 transcript，而不是 dry-run')
  .action(async (opts: { olderThanDays?: number[], limit?: number[], apply?: boolean }) => {
    process.exit(await runSessionsMaintenance({
      olderThanDays: optionalNumber(opts.olderThanDays),
      limit: optionalNumber(opts.limit),
      ...(opts.apply === undefined ? {} : { apply: opts.apply }),
    }))
  })

// ============================================================
// canonical worker/fleet/gateway tree
// ============================================================

// --- fleet 子命令组（原 operator workers ...）---
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
  .command('gateway start', '启动 gateway server（默认前台运行，适合 systemd；--detach 使用后台守护进程）')
  .option('--port <n>', '监听端口（默认 9218）', { type: [Number] })
  .option('--detach', '后台守护进程模式：spawn 自身，并把 PID/log 写入 ~/.aiworker/')
  .option('--no-serve-web', '不挂载 fleet bundle 到 /admin/*（默认挂载）')
  .action(async (opts: { port?: number[], detach?: boolean, serveWeb?: boolean }) => {
    // env AIWORKER_GATEWAY_INTERNAL_FOREGROUND=1 是 daemon 子进程标记；强制 foreground，
    // 即便误带 --detach（无害）。
    const internal = process.env.AIWORKER_GATEWAY_INTERNAL_FOREGROUND === '1'
    const detach = internal ? false : opts.detach === true
    const port = optionalNumber(opts.port)
    process.exit(await runGatewayStart({
      ...(port === undefined ? {} : { port }),
      detach,
      ...(opts.serveWeb === false ? { serveWeb: false } : {}),
    }))
  })

cli.command('gateway status', '显示后台 gateway 守护进程是否运行（foreground/systemd 实例不由此命令跟踪）').action(() => {
  process.exit(runGatewayStatus())
})

cli
  .command('gateway stop', '停止后台 gateway 守护进程（foreground/systemd 实例请由其 supervisor 停止）')
  .option('--timeout-ms <n>', 'SIGTERM 超时时间（默认 5000ms）', { type: [Number] })
  .action(async (opts: { timeoutMs?: number[] }) => {
    const timeoutMs = optionalNumber(opts.timeoutMs)
    process.exit(await runGatewayStop(timeoutMs === undefined ? {} : { timeoutMs }))
  })

// --- fleet pair ---
cli
  .command('fleet pair', '通过 bootstrap token 把一个已启动的 worker 注册到 gateway')
  .option('--url <wsUrl>', 'gateway WebSocket URL（默认使用 aiworker.json 里的 gatewayUrl）')
  .option('--worker-url <httpUrl>', 'worker HTTP base URL（必填）')
  .option('--bootstrap-token <token>', 'worker 打印的一次性 bootstrap token（必填）')
  .option('--display-name <name>', '可选 worker 展示名')
  .action(async (opts: { url?: string, workerUrl?: string, bootstrapToken?: string, displayName?: string }) => {
    if (!opts.workerUrl || !opts.bootstrapToken) {
      consola.error('fleet pair 必须同时提供 --worker-url 和 --bootstrap-token')
      process.exit(2)
    }
    process.exit(await runPair({
      ...(opts.url === undefined ? {} : { url: opts.url }),
      workerUrl: opts.workerUrl,
      bootstrapToken: opts.bootstrapToken,
      ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
    }))
  })

// --- fleet chat ---
cli
  .command('fleet chat <workerId> <text>', '向某个 worker 发送一条消息，并阻塞到 agent.done（NDJSON 输出）')
  .option('--conversation-id <id>', '显式指定会话 id；不传则由 worker 新建')
  .option('--timeout-ms <n>', '等待 agent.done 的总超时时间（默认 120000）', { type: [Number] })
  .action(async (workerId: string, text: string, opts: { conversationId?: string, timeoutMs?: number[] }) => {
    const timeoutMs = optionalNumber(opts.timeoutMs)
    process.exit(await runChat({
      workerId,
      content: text,
      ...(opts.conversationId === undefined ? {} : { conversationId: opts.conversationId }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    }))
  })

// --- fleet config get/set（远端 worker）---
cli
  .command('fleet config get <workerId>', '读取目标 worker 的当前配置')
  .action(async (workerId: string) => {
    process.exit(await runConfigGet(workerId))
  })

cli
  .command('fleet config set <workerId> <json>', '更新 worker 配置（需要 --if-match 提供当前版本）')
  .option('--if-match <version>', '乐观锁；当前存储的 version 不等于此值则拒绝', { type: [Number] })
  .action(async (workerId: string, json: string, opts: { ifMatch?: number[] }) => {
    const ifMatch = optionalNumber(opts.ifMatch)
    if (ifMatch === undefined) {
      consola.error('fleet config set 必须显式提供 --if-match <version> 以防止误覆盖')
      process.exit(2)
    }
    process.exit(await runConfigSetRemote({ workerId, configJson: json, ifMatch }))
  })

// --- fleet token rotate（远端 worker）---
cli
  .command('fleet token rotate <workerId>', '为目标 worker 轮换 deviceToken（旧 token 立即失效）')
  .action(async (workerId: string) => {
    process.exit(await runTokenRotateRemote(workerId))
  })

// --- fleet approvals list/grant（远端）---
cli
  .command('fleet approvals list', '列出挂起的工具审批；默认覆盖所有在线 worker')
  .option('--worker <id>', '只查指定 workerId（不传则聚合所有在线 worker）')
  .action(async (opts: { worker?: string }) => {
    process.exit(await runApprovalsListRemote({ ...(opts.worker === undefined ? {} : { workerId: opts.worker }) }))
  })

cli
  .command('fleet approvals grant <workerId> <taskId> <toolCallId>', '解锁某条 worker 上挂起的工具审批')
  .option('--deny', '下发拒绝决策；不带此 flag 默认允许')
  .action(async (workerId: string, taskId: string, toolCallId: string, opts: { deny?: boolean }) => {
    process.exit(await runApprovalsGrantRemote({
      workerId,
      taskId,
      toolCallId,
      ...(opts.deny === undefined ? {} : { deny: opts.deny }),
    }))
  })

// --- fleet schedule list/add/remove（远端）---
cli
  .command('fleet schedule list <workerId>', '列出某 worker 上所有 cron 任务')
  .action(async (workerId: string) => {
    process.exit(await runScheduleListRemote(workerId))
  })

cli
  .command('fleet schedule add <workerId>', '在某 worker 上新增一条 cron 任务')
  .option('--expression <expr>', '五段 cron 表达式（必填）')
  .option('--prompt <text>', 'cron 触发时合成的 envelope.text（必填）')
  .option('--channel <channel>', 'channel 类型：web/line/telegram/lark/whatsapp（必填）')
  .option('--chat-id <id>', '触发时使用的 chatId（必填）')
  .option('--account-id <id>', 'accountId，默认 sys:cron')
  .option('--disabled', '默认 enabled=true；带此选项改为 false')
  .action(async (workerId: string, opts: {
    expression?: string
    prompt?: string
    channel?: string
    chatId?: string
    accountId?: string
    disabled?: boolean
  }) => {
    if (!opts.expression || !opts.prompt || !opts.channel || !opts.chatId) {
      consola.error('fleet schedule add 必须提供 --expression / --prompt / --channel / --chat-id')
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
  .command('fleet schedule remove <workerId> <jobId>', '删除某 worker 上的某条 cron 任务')
  .action(async (workerId: string, jobId: string) => {
    process.exit(await runScheduleRemoveRemote(workerId, jobId))
  })

// --- fleet enroll list/approve/reject（OTP-attended enrollment）---
cli.command('fleet enroll list', '列出 gateway 当前所有待处理的 OTP enrollment').action(async () => {
  process.exit(await runEnrollList())
})

cli
  .command('fleet enroll approve <otp>', '批准某条待处理的 OTP enrollment（worker 立即加入 fleet）')
  .action(async (otp: string) => {
    process.exit(await runEnrollApprove(otp))
  })

cli
  .command('fleet enroll reject <otp>', '拒绝某条待处理的 OTP enrollment（worker 收到 close 4403）')
  .action(async (otp: string) => {
    process.exit(await runEnrollReject(otp))
  })

// --- fleet logs ---
cli
  .command('fleet logs <workerId>', '订阅某个 worker 的日志尾部（NDJSON 输出）')
  .option('--follow', '持续订阅直到超时或 Ctrl-C')
  .option('--tail <n>', '请求历史行数，上限 1000', { type: [Number] })
  .option('--timeout-ms <n>', '订阅总超时', { type: [Number] })
  .action(async (workerId: string, opts: { follow?: boolean, tail?: number[], timeoutMs?: number[] }) => {
    const tail = optionalNumber(opts.tail)
    const timeoutMs = optionalNumber(opts.timeoutMs)
    process.exit(await runLogs({
      workerId,
      ...(opts.follow === undefined ? {} : { follow: opts.follow }),
      ...(tail === undefined ? {} : { tail }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    }))
  })

// --- gateway install systemd ---
cli
  .command('gateway install systemd', '渲染 aiworker-gateway.service 并（可选）注册到 systemd')
  .option('--user', 'systemd 用户实例（默认）；写到 ~/.config/systemd/user/')
  .option('--system', 'systemd 系统实例（需 root）；写到 /etc/systemd/system/')
  .option('--dry-run', '只往 stdout 打 unit 内容，不写盘也不 systemctl')
  .option('--out <path>', '覆盖目标路径（异常布局/测试用）；自动跳过 systemctl')
  .option('--no-enable', '写盘后跳过 systemctl daemon-reload 和 enable --now')
  .option('--exec-start <command>', '高级覆盖：手动指定完整 systemd ExecStart 命令')
  .action(async (opts: { user?: boolean, system?: boolean, dryRun?: boolean, out?: string, enable?: boolean, execStart?: string }) => {
    if (opts.user === true && opts.system === true) {
      consola.error('gateway install systemd: 不能同时指定 --user 和 --system')
      process.exit(2)
    }
    process.exit(await runInstallSystemd({
      scope: opts.system === true ? 'system' : 'user',
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.out === undefined ? {} : { out: opts.out }),
      ...(opts.enable === false ? { noEnable: true } : {}),
      ...(opts.execStart === undefined ? {} : { execStart: opts.execStart }),
    }))
  })

configureCliHelp(cli)
cli.version(packageJson.version)
localizeGlobalOptions(cli)

/**
 * cac 6 原生不支持多词子命令（`isMatched` 只比对 argv[0]），因此这里做一次 argv
 * 预处理：从已注册命令里动态收集所有含空格的 name；若 argv 中接连若干 token 拼起来
 * 命中其中一个，就把它们 collapse 成一个带空格的 token 再喂给 cac。
 *
 * 当前命令树包含 3-4 词命令（`worker executor mcp add` /
 * `gateway install systemd` 等）；这里按 N 词支持，避免后续扩展时再回头改预处理。
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

class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

interface NumericRule {
  integer?: boolean
  min?: number
  max?: number
}

interface CliOptionShape {
  config?: {
    type?: unknown[]
  }
  name: string
  rawName: string
}

interface CliCommandShape {
  checkOptionValue: () => void
  checkRequiredArgs: () => void
  checkUnknownOptions: () => void
  name: string
  options: CliOptionShape[]
}

const NUMERIC_RULES: Record<string, Record<string, NumericRule>> = {
  'config set': { ifMatch: { integer: true, min: 1 } },
  'fleet chat': { timeoutMs: { integer: true, min: 1 } },
  'fleet config set': { ifMatch: { integer: true, min: 1 } },
  'fleet logs': {
    tail: { integer: true, min: 0, max: 1_000 },
    timeoutMs: { integer: true, min: 1 },
  },
  'gateway start': { port: { integer: true, min: 0, max: 65_535 } },
  'gateway stop': { timeoutMs: { integer: true, min: 0 } },
  'run': { timeoutMs: { integer: true, min: 1 } },
  'serve': { port: { integer: true, min: 1, max: 65_535 } },
  'up': { port: { integer: true, min: 1, max: 65_535 } },
  'sessions list': {
    limit: { integer: true, min: 1, max: 200 },
    offset: { integer: true, min: 0 },
  },
  'sessions maintenance': {
    limit: { integer: true, min: 1, max: 200 },
    olderThanDays: { integer: true, min: 0, max: 3650 },
  },
  'worker config set': { ifMatch: { integer: true, min: 1 } },
  'worker run': { timeoutMs: { integer: true, min: 1 } },
  'worker serve': { port: { integer: true, min: 1, max: 65_535 } },
  'worker up': { port: { integer: true, min: 1, max: 65_535 } },
  'worker sessions list': {
    limit: { integer: true, min: 1, max: 200 },
    offset: { integer: true, min: 0 },
  },
  'worker sessions maintenance': {
    limit: { integer: true, min: 1, max: 200 },
    olderThanDays: { integer: true, min: 0, max: 3650 },
  },
}

function isCacError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'CACError'
}

function optionDisplayName(rawName: string): string {
  const match = /--[a-z0-9][\w-]*/i.exec(rawName)
  return match?.[0] ?? rawName
}

function optionFlagNames(rawName: string): string[] {
  return rawName
    .split(',')
    .map(part => /^-{1,2}[a-z0-9][\w-]*/i.exec(part.trim())?.[0])
    .filter((flag): flag is string => flag !== undefined)
}

function argvHasOption(argv: string[], option: CliOptionShape): boolean {
  const args = argv.slice(2)
  const flags = optionFlagNames(option.rawName)
  return flags.some(flag => args.some(arg => arg === flag || arg.startsWith(`${flag}=`)))
}

function validateMatchedCommand(command: CliCommandShape): void {
  command.checkUnknownOptions()
  command.checkOptionValue()
  command.checkRequiredArgs()
}

function validateNumericOptions(command: CliCommandShape, argv: string[]): void {
  const rules = NUMERIC_RULES[command.name] ?? {}
  for (const option of command.options) {
    if (!Array.isArray(option.config?.type) || option.config.type[0] !== Number)
      continue
    if (!argvHasOption(argv, option))
      continue
    const value = cli.options[option.name]
    if (value === undefined)
      continue

    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      const displayName = optionDisplayName(option.rawName)
      if (typeof item !== 'number' || !Number.isFinite(item))
        throw new CliUsageError(`${displayName} must be a finite number`)

      const rule = rules[option.name]
      if (rule?.integer === true && !Number.isInteger(item))
        throw new CliUsageError(`${displayName} must be an integer`)
      if (rule?.min !== undefined && item < rule.min)
        throw new CliUsageError(`${displayName} must be >= ${rule.min}`)
      if (rule?.max !== undefined && item > rule.max)
        throw new CliUsageError(`${displayName} must be <= ${rule.max}`)
    }
  }
}

function shouldExitAfterParse(): boolean {
  return cli.options.help === true || (cli.options.version === true && cli.matchedCommandName == null)
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  const preprocessed = preprocessArgv(argv)
  try {
    cli.unsetMatchedCommand()
    const parsed = cli.parse(preprocessed, { run: false })
    if (shouldExitAfterParse())
      return 0
    if (!cli.matchedCommand && parsed.args[0])
      throw new CliUsageError(`Unknown command: ${parsed.args[0]}`)

    const command = cli.matchedCommand as CliCommandShape | undefined
    if (command) {
      validateMatchedCommand(command)
      validateNumericOptions(command, preprocessed)
    }

    bootstrapCliDotenv(preprocessed)
    await cli.runMatchedCommand()
    return typeof process.exitCode === 'number' ? process.exitCode : 0
  }
  catch (err) {
    const usageError = err instanceof CliUsageError || isCacError(err)
    const message = err instanceof Error ? err.message : String(err)
    consola.error(message)
    return usageError ? 2 : 1
  }
}

if (import.meta.main) {
  process.exit(await runCli(process.argv))
}
