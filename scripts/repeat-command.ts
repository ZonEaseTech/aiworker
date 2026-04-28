#!/usr/bin/env bun
import process from 'node:process'

const [countArg, ...command] = process.argv.slice(2)
const countText = countArg ?? ''
const count = Number.parseInt(countText, 10)

if (!/^\d+$/.test(countText) || !Number.isInteger(count) || count < 1 || count > 20 || command.length === 0) {
  console.error('usage: repeat-command <count:1-20> <command> [args...]')
  process.exit(2)
}

for (let run = 1; run <= count; run += 1) {
  console.log(`[repeat-command] ${run}/${count}: ${command.join(' ')}`)
  const result = Bun.spawnSync(command, {
    env: process.env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  })

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1)
  }
}
