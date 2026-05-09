import { describe, expect, it } from 'bun:test'

import { shouldBootstrapDotenv } from './bootstrap'

function argv(...args: string[]): string[] {
  return ['/usr/bin/bun', '/path/to/aiworker.ts', ...args]
}

describe('shouldBootstrapDotenv', () => {
  it('does not bootstrap setup or diagnostic commands', () => {
    for (const args of [
      ['init'],
      ['worker', 'init'],
      ['up'],
      ['worker', 'up'],
      ['doctor'],
      ['worker', 'doctor'],
      ['commands'],
      ['scope'],
      ['worker', 'scope'],
      ['env', 'gateway-url'],
      ['env', 'display-name'],
      ['worker', 'env', 'gateway-url'],
      ['worker', 'env', 'display-name'],
      ['executor', 'mcp', 'sync'],
      ['worker', 'executor', 'doctor'],
      ['soul', 'list'],
      ['worker', 'soul', 'show'],
      ['pack', 'list'],
      ['worker', 'pack', 'show'],
      ['gateway', 'install', 'systemd'],
    ])
      expect(shouldBootstrapDotenv(argv(...args))).toBe(false)
  })

  it('bootstraps commands that need worker runtime state', () => {
    for (const args of [
      ['run'],
      ['serve'],
      ['worker', 'serve'],
      ['config', 'show'],
      ['fleet', 'list'],
    ])
      expect(shouldBootstrapDotenv(argv(...args))).toBe(true)
  })
})
