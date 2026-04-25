#!/usr/bin/env bun
import process from 'node:process'

import cac from 'cac'
import consola from 'consola'

import { runConfigSet, runConfigShow } from './commands/config'
import { runInit } from './commands/init'
import { runRun } from './commands/run'
import { runScheduleAdd, runScheduleList, runScheduleRemove } from './commands/schedule'
import { runServe } from './commands/serve'
import { runTokenRotate } from './commands/token'

const cli = cac('aiw')

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
  const code = await runConfigShow()
  process.exit(code)
})

cli
  .command('config-set <json>', 'Replace the stored worker config')
  .option('--if-match <version>', 'Optimistic-concurrency guard (reject unless stored version matches)', { type: [Number] })
  .action(async (json: string, opts: { ifMatch?: number[] }) => {
    const code = await runConfigSet({ json, ifMatch: opts.ifMatch?.[0] })
    process.exit(code)
  })

cli.command('token-rotate', 'Mint a fresh bearer token; prints the new plaintext once').action(async () => {
  const code = await runTokenRotate()
  process.exit(code)
})

// --- schedule (cron) ---
cli
  .command('schedule-list', 'List all cron jobs persisted in the local worker.db')
  .action(async () => {
    process.exit(await runScheduleList())
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
      consola.error('[aiw schedule-add] requires --expression, --prompt, --channel, --chat-id')
      process.exit(2)
    }
    const code = await runScheduleAdd({
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
    process.exit(await runScheduleRemove(jobId))
  })

cli.help()
cli.version('0.2.0')

try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}
catch (err) {
  consola.error(err)
  process.exit(1)
}
