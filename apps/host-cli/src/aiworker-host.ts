#!/usr/bin/env bun
import type { WorkerRegistry } from '@zonease/aiworker-host-control'

import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import cac from 'cac'

export interface HostCliDeps {
  registry?: WorkerRegistry
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

// cac 不支持多词子命令的逐 token 匹配：把 ['worker','list'] 合并成单 token
// 'worker list' 后 cac 才能匹配到命令（与 worker-cli 的 preprocessArgv 同策略）。
export function preprocessHostArgv(argv: string[], commandNames: string[]): string[] {
  const names = new Set(commandNames.filter(name => name.includes(' ')))
  const maxDepth = Math.max(1, ...[...names].map(name => name.split(' ').length))
  for (let depth = maxDepth; depth >= 2; depth--) {
    const combined = argv.slice(0, depth).join(' ')
    if (names.has(combined)) {
      const next = argv.slice()
      next.splice(0, depth, combined)
      return next
    }
  }
  return argv
}

export async function runHostCli(argv: string[], deps: HostCliDeps = {}): Promise<number> {
  const registry = deps.registry ?? createWorkerRegistry()
  const cli = cac('aiworker-host')
  cli
    .command('worker list', 'list workers registered with this Host control plane')
    .action(() => {
      printJson({ workers: registry.list() })
    })
  cli.help()

  const processed = preprocessHostArgv(argv, cli.commands.map(command => command.name))
  try {
    cli.parse(['', 'aiworker-host', ...processed], { run: false })
    if (cli.options.help === true)
      return 0
    if (!cli.matchedCommand) {
      if (processed[0])
        throw new Error(`Unknown command: ${processed[0]}`)
      cli.outputHelp()
      return 0
    }
    await cli.runMatchedCommand()
    return 0
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

if (import.meta.main)
  process.exit(await runHostCli(process.argv.slice(2)))
