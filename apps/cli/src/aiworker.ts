#!/usr/bin/env bun
import process from 'node:process'

import cac from 'cac'
import consola from 'consola'

import packageJson from '../package.json' with { type: 'json' }

import {
  runWorkerDaemonCheck,
  runWorkerDaemonInspect,
  runWorkerDaemonLogs,
  runWorkerDaemonStatus,
  startWorkerDaemon,
  stopWorkerDaemon,
} from './commands/worker/daemon'
import { runDoctor } from './commands/worker/doctor'
import {
  runExecutorCapabilityList,
  runExecutorCapabilityShow,
  runExecutorDoctor,
  runExecutorMcpAdd,
  runExecutorMcpSync,
  runExecutorSelect,
} from './commands/worker/executor'
import { runInit } from './commands/worker/init'
import { runPackList, runPackShow } from './commands/worker/pack'
import {
  runReviewList,
  runReviewPromoteLessons,
  runReviewRerun,
  runReviewShow,
} from './commands/worker/review'
import { runRun } from './commands/worker/run'
import { runServe } from './commands/worker/serve'
import {
  runArtifactsList,
  runArtifactsShow,
  runRunsCancel,
  runRunsList,
  runRunsShow,
} from './commands/worker/workbench'
import {
  configureCliHelp,
  findCommandGroupHelpArg,
  localizeGlobalOptions,
  renderCommandGroupHelp,
  renderFullCommandIndex,
} from './help'
import { bootstrapCliDotenv } from './lib/bootstrap'

/**
 * AIWorker hard-reset CLI.
 *
 * The visible surface is intentionally local-worker only:
 *
 *   worker pack -> work order -> run -> artifact -> review -> lesson
 *
 * Pre-1.0 admin/control-plane compatibility command trees are not
 * re-registered here. Internal services may still exist while later slices
 * rename or delete them, but the CLI no longer teaches that old product model.
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

function registerDaemonCommands(): void {
  cli
    .command('daemon start', '后台启动本地 worker daemon')
    .option('--soul <preset>', 'brand-new workspace 初始化使用的 worker preset')
    .option('--pack <id>', 'brand-new workspace 初始化使用的 worker pack')
    .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
    .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
    .action(async (opts: {
      host?: string
      pack?: string
      port?: number[]
      soul?: string
    }) => {
      process.exit(await startWorkerDaemon({
        ...(opts.host === undefined ? {} : { host: opts.host }),
        ...(opts.pack === undefined ? {} : { pack: opts.pack }),
        ...(optionalNumber(opts.port) === undefined ? {} : { port: optionalNumber(opts.port) }),
        ...(opts.soul === undefined ? {} : { soul: opts.soul }),
      }))
    })

  cli.command('daemon status', '查看本地 worker daemon PID/log 状态').action(() => {
    process.exit(runWorkerDaemonStatus())
  })

  cli
    .command('daemon stop', '停止后台本地 worker daemon')
    .option('--timeout-ms <n>', 'SIGTERM 后等待毫秒数，超时则 SIGKILL（默认 5000）', { type: [Number] })
    .action(async (opts: { timeoutMs?: number[] }) => {
      process.exit(await stopWorkerDaemon({ timeoutMs: optionalNumber(opts.timeoutMs) }))
    })

  cli
    .command('daemon logs', '打印本地 worker daemon 最近日志')
    .option('--tail <n>', '打印最近 N 行（默认 80）', { type: [Number] })
    .action((opts: { tail?: number[] }) => {
      process.exit(runWorkerDaemonLogs({ tail: optionalNumber(opts.tail) }))
    })

  cli
    .command('daemon check', '检查本地 worker daemon /health')
    .option('--timeout-ms <n>', 'HTTP health check 超时毫秒数（默认 2000）', { type: [Number] })
    .action(async (opts: { timeoutMs?: number[] }) => {
      process.exit(await runWorkerDaemonCheck({ timeoutMs: optionalNumber(opts.timeoutMs) }))
    })

  cli.command('daemon inspect', '以 JSON 输出本地 worker daemon 状态与 metadata').action(() => {
    process.exit(runWorkerDaemonInspect())
  })

  cli
    .command('daemon foreground', '前台运行本地 worker daemon HTTP/Web 服务')
    .option('--port <n>', '覆盖 PORT 环境变量', { type: [Number] })
    .option('--host <host>', '覆盖 AIWORKER_WORKER_HOST（默认 127.0.0.1）')
    .option('--open', '启动后打开 worker web workbench')
    .option('--no-open', '启动后不自动打开 worker web workbench')
    .option('--pid-file <path>', 'daemon pid 写入指定路径（关闭时清理）')
    .action(async (opts: { host?: string, pidFile?: string, port?: number[] }) => {
      const open = readServeOpenOption()
      await runServe({
        ...(opts.host === undefined ? {} : { host: opts.host }),
        ...(opts.pidFile === undefined ? {} : { pidFile: opts.pidFile }),
        ...(optionalNumber(opts.port) === undefined ? {} : { port: optionalNumber(opts.port) }),
        ...(open === undefined ? {} : { open }),
        runtimeVersion: packageJson.version,
      })
    })
}

cli
  .command('init', '初始化当前 workspace 的 local worker state 和 worker pack')
  .option('--dry-run', '只打印初始化预检和计划写入，不创建或修改文件')
  .option('--soul <preset>', '初始化使用的 worker preset，例如 developer / hr-recruiting / project-manager')
  .option('--pack <id>', '初始化使用的 worker pack；默认选择与 preset 同名的内置 pack')
  .option('--token-file <path>', '首次初始化时把完整 bootstrap token 写入 chmod 600 文件')
  .option('--show-token', '首次初始化时在 stdout 高可见 warning block 中显示完整 bootstrap token')
  .action(async (opts: { dryRun?: boolean, pack?: string, showToken?: boolean, soul?: string, tokenFile?: string }) => {
    process.exit(await runInit({
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.soul === undefined ? {} : { soul: opts.soul }),
      ...(opts.pack === undefined ? {} : { pack: opts.pack }),
      ...(opts.tokenFile === undefined ? {} : { tokenFile: opts.tokenFile }),
      ...(opts.showToken === true ? { showToken: true } : {}),
    }))
  })

registerDaemonCommands()

cli.command('doctor', '验证当前 workspace 的 local worker state、pack 和 executor readiness').action(async () => {
  process.exit(await runDoctor())
})

cli
  .command('executor mcp add <name>', '声明一个 project executor MCP overlay hint')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--scope <scope>', 'MCP 配置 scope；当前仅支持 project')
  .option('--transport <transport>', 'MCP transport：stdio / streamable-http / sse；未指定时按 --url 推断')
  .option('--url <url>', 'HTTP/SSE MCP server URL')
  .option('--command <command>', 'stdio MCP server command')
  .option('--arg <value>', 'stdio command 参数；可重复')
  .option('--env <key=value>', '投影到 engine CLI 的 env；secret 用 key=secretRef:<ref>；可重复')
  .option('--header <key=value>', '投影到 engine CLI 的 header；secret 用 key=secretRef:<ref>；可重复')
  .option('--bearer-token-env-var <env>', 'Codex streamable HTTP MCP bearer token 环境变量名')
  .option('--description <text>', 'MCP server 描述')
  .option('--dry-run', '只预览 manifest 变更，不写文件')
  .action(async (name: string, opts: Parameters<typeof runExecutorMcpAdd>[1]) => {
    process.exit(await runExecutorMcpAdd(name, opts))
  })

cli
  .command('executor mcp sync', '把 project executor overlay best-effort 投影到 engine 官方 project 配置')
  .option('--engine <engine>', '目标 engine：codex 或 claude-code')
  .option('--dry-run', '只打印将执行的 engine CLI 命令')
  .action(async (opts: Parameters<typeof runExecutorMcpSync>[0]) => {
    process.exit(await runExecutorMcpSync(opts))
  })

cli
  .command('executor select', '选择本地 worker 的 task executor')
  .option('--engine <engine>', '目标 task executor engine，例如 codex / claude-code / http')
  .option('--variant <variant>', 'executor variant（默认 default）')
  .option('--model-id <model>', '可选 per-request model override')
  .option('--reasoning-id <id>', '可选 reasoning preset')
  .option('--permission-policy <policy>', '可选权限策略：auto / supervised / plan')
  .option('--timeout-ms <n>', '可选 executor 单 turn hard timeout，单位毫秒', { type: [Number] })
  .option('--if-match <version>', 'apply 时使用的乐观锁；当前 config version 不等于此值则拒绝', { type: [Number] })
  .option('--apply', '持久化 executor 选择；默认只 dry-run')
  .option('--dry-run', '只打印将更新的 executor 选择')
  .action(async (opts: { apply?: boolean, dryRun?: boolean, engine?: string, ifMatch?: number[], modelId?: string, permissionPolicy?: string, reasoningId?: string, timeoutMs?: number[], variant?: string }) => {
    process.exit(await runExecutorSelect({
      ...(opts.apply === true ? { apply: true } : {}),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
      ...(opts.engine === undefined ? {} : { engine: opts.engine }),
      ...(opts.variant === undefined ? {} : { variant: opts.variant }),
      ...(opts.modelId === undefined ? {} : { modelId: opts.modelId }),
      ...(opts.reasoningId === undefined ? {} : { reasoningId: opts.reasoningId }),
      ...(opts.permissionPolicy === undefined ? {} : { permissionPolicy: opts.permissionPolicy }),
      timeoutMs: optionalNumber(opts.timeoutMs),
      ifMatch: optionalNumber(opts.ifMatch),
    }))
  })

cli
  .command('executor doctor', '校验 project executor overlay 与 engine CLI readiness')
  .option('--engine <engine>', '只检查一个 engine：codex 或 claude-code')
  .action(async (opts: Parameters<typeof runExecutorDoctor>[0]) => {
    process.exit(await runExecutorDoctor(opts))
  })

cli
  .command('executor capability list', '只读列出 project executor overlay 条目')
  .option('--engine <engine>', '只列出一个 engine：codex 或 claude-code')
  .action(async (opts: Parameters<typeof runExecutorCapabilityList>[0]) => {
    process.exit(await runExecutorCapabilityList(opts))
  })

cli
  .command('executor capability show <ref>', '只读查看单条 project executor overlay descriptor')
  .action(async (ref: string) => {
    process.exit(await runExecutorCapabilityShow(ref))
  })

cli.command('pack list', '列出 OD-style worker packs').action(async () => {
  process.exit(await runPackList())
})

cli.command('pack show <pack>', '查看 worker pack 的 skill/domain/work-order/artifact 信息').action(async (pack: string) => {
  process.exit(await runPackShow(pack))
})

cli
  .command('run', '向本地 daemon 提交一条 work order')
  .option('--message <text>', '要投递的用户消息（必填）')
  .option('--dry-run', '完成本地状态/bootstrap 检查，但不真正提交 run')
  .option('--timeout-ms <n>', '等待终态事件的最长时间，单位毫秒（默认 120000）', { type: [Number] })
  .action(async (opts: { dryRun?: boolean, message?: string, timeoutMs?: number[] }) => {
    process.exit(await runRun({
      message: opts.message,
      dryRun: opts.dryRun,
      timeoutMs: optionalNumber(opts.timeoutMs),
    }))
  })

cli
  .command('runs list', '列出本地 daemon work orders')
  .option('--limit <n>', '最多返回 run 数量（默认由 daemon 决定）', { type: [Number] })
  .action(async (opts: { limit?: number[] }) => {
    process.exit(await runRunsList({ limit: optionalNumber(opts.limit) }))
  })

cli.command('runs show <runId>', '查看一个 work order run').action(async (runId: string) => {
  process.exit(await runRunsShow(runId))
})

cli.command('runs cancel <runId>', '取消一个仍在运行的 work order').action(async (runId: string) => {
  process.exit(await runRunsCancel(runId))
})

cli
  .command('artifacts list', '列出本地 daemon artifact metadata')
  .option('--run <id>', '按 run id 过滤')
  .option('--conversation <id>', '按 conversation id 过滤')
  .option('--status <status>', '按 artifact 状态过滤：available | missing | archived')
  .option('--limit <n>', '最多返回 artifact 数量（1-500，默认由 daemon 决定）', { type: [Number] })
  .action(async (opts: { conversation?: string, limit?: number[], run?: string, status?: string }) => {
    process.exit(await runArtifactsList({
      ...(opts.run === undefined ? {} : { runId: opts.run }),
      ...(opts.conversation === undefined ? {} : { conversationId: opts.conversation }),
      ...(opts.status === undefined ? {} : { status: opts.status }),
      ...(opts.limit === undefined ? {} : { limit: optionalNumber(opts.limit) }),
    }))
  })

cli.command('artifacts show <id>', '查看一个 artifact metadata').action(async (id: string) => {
  process.exit(await runArtifactsShow(id))
})

cli
  .command('review list', '列出本地 worker run reviews')
  .option('--limit <n>', '最多返回 review 数量（1-200，默认 50）', { type: [Number] })
  .action(async (opts: { limit?: number[] }) => {
    process.exit(await runReviewList({ limit: optionalNumber(opts.limit) }))
  })

cli
  .command('review show <runId>', '查看 run review、evidence、risk 和 lesson candidates')
  .option('--show-sensitive', '不再对 payload / message preview 做 secret-like redaction')
  .action(async (runId: string, opts: { showSensitive?: boolean }) => {
    process.exit(await runReviewShow(runId, {
      ...(opts.showSensitive === undefined ? {} : { showSensitive: opts.showSensitive }),
    }))
  })

cli
  .command('review rerun <runId>', '基于 review evidence 显式重跑一个 work order')
  .option('--prompt <text>', '覆盖 rerun prompt；默认由 daemon 构造 repair context')
  .action(async (runId: string, opts: { prompt?: string }) => {
    process.exit(await runReviewRerun(runId, {
      ...(opts.prompt === undefined ? {} : { prompt: opts.prompt }),
    }))
  })

cli
  .command('review promote <runId>', '把 review lesson candidates 晋升为 durable lesson proposals')
  .option('--soul <id>', '写入 proposal 的 worker identity id（默认 developer）')
  .option('--scope <id>', '写入 proposal 的 scope id（可选）')
  .action(async (runId: string, opts: { scope?: string, soul?: string }) => {
    process.exit(await runReviewPromoteLessons(runId, {
      ...(opts.soul === undefined ? {} : { soulId: opts.soul }),
      ...(opts.scope === undefined ? {} : { scopeId: opts.scope }),
    }))
  })

cli
  .command('lessons promote <runId>', '把某次 run review 的 lesson candidates 晋升为 durable context')
  .option('--soul <id>', '写入 proposal 的 worker identity id（默认 developer）')
  .option('--scope <id>', '写入 proposal 的 scope id（可选）')
  .action(async (runId: string, opts: { scope?: string, soul?: string }) => {
    process.exit(await runReviewPromoteLessons(runId, {
      ...(opts.soul === undefined ? {} : { soulId: opts.soul }),
      ...(opts.scope === undefined ? {} : { scopeId: opts.scope }),
    }))
  })

cli.command('commands', '显示当前 hard-reset CLI 命令索引').action(() => {
  process.stdout.write(`${renderFullCommandIndex(cli)}\n`)
})

configureCliHelp(cli)
cli.version(packageJson.version)
localizeGlobalOptions(cli)

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

  for (let depth = maxDepth; depth >= 2; depth--) {
    if (argv.length < 2 + depth)
      continue
    const combined = argv.slice(2, 2 + depth).join(' ')
    if (multiWordNames.has(combined)) {
      const out = argv.slice()
      out.splice(2, depth, combined)
      return preprocessExecutorMcpArgValues(out)
    }
  }
  return preprocessExecutorMcpArgValues(argv)
}

function preprocessExecutorMcpArgValues(argv: string[]): string[] {
  if (argv[2] !== 'executor mcp add')
    return argv
  const out = argv.slice()
  for (let i = 3; i < out.length - 1; i++) {
    if (out[i] === '--arg' && out[i + 1]?.startsWith('-') === true)
      out.splice(i, 2, `--arg=${out[i + 1]}`)
  }
  return out
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
  'artifacts list': { limit: { integer: true, min: 1, max: 500 } },
  'daemon check': { timeoutMs: { integer: true, min: 1 } },
  'daemon foreground': { port: { integer: true, min: 1, max: 65_535 } },
  'daemon logs': { tail: { integer: true, min: 0, max: 1_000 } },
  'daemon start': { port: { integer: true, min: 1, max: 65_535 } },
  'daemon stop': { timeoutMs: { integer: true, min: 0 } },
  'executor select': { ifMatch: { integer: true, min: 1 }, timeoutMs: { integer: true, min: 1 } },
  'review list': { limit: { integer: true, min: 1, max: 200 } },
  'run': { timeoutMs: { integer: true, min: 1 } },
  'runs list': { limit: { integer: true, min: 1, max: 200 } },
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
    const preparseGroupName = findCommandGroupHelpArg(preprocessed, cli)
    if (preparseGroupName !== null) {
      process.stdout.write(`${renderCommandGroupHelp(cli, preparseGroupName)}\n`)
      return 0
    }
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
