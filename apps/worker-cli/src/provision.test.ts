import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  __setDaemonForegroundForTest,
  buildProvisionEnv,
  redactProvisionCommandForLog,
  runCli,
} from './aiworker'

describe('aiworker provision command helpers', () => {
  const originalEnv = { ...process.env }
  const originalArgv = process.argv.slice()
  const originalStderrWrite = process.stderr.write
  const originalStdoutWrite = process.stdout.write
  let stderr = ''
  let stdout = ''

  beforeEach(() => {
    stderr = ''
    stdout = ''
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    __setDaemonForegroundForTest(null)
    process.argv = originalArgv.slice()
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    process.stderr.write = originalStderrWrite
    process.stdout.write = originalStdoutWrite
    process.exitCode = 0
  })

  it('builds daemon provision environment variables', () => {
    expect(buildProvisionEnv({
      host: 'https://host.example',
      token: 'awp_secret',
    })).toEqual({
      AIWORKER_HOST_URL: 'https://host.example',
      AIWORKER_PROVISION_TOKEN: 'awp_secret',
    })
  })

  it('redacts provision token passed as the next argv item', () => {
    expect(redactProvisionCommandForLog([
      'provision',
      '--host',
      'https://host.example',
      '--token',
      'awp_secret',
    ])).toBe('provision --host https://host.example --token [REDACTED]')
  })

  it('redacts provision token passed with equals syntax', () => {
    expect(redactProvisionCommandForLog([
      'provision',
      '--host=https://host.example',
      '--token=awp_secret',
    ])).toBe('provision --host=https://host.example --token=[REDACTED]')
  })

  it('sets provision env and runs foreground daemon without leaking token', async () => {
    const foregroundCalls: Array<{ host?: string, port?: number }> = []
    __setDaemonForegroundForTest(async (opts = {}) => {
      foregroundCalls.push(opts)
    })

    const code = await runCli([
      '/usr/bin/bun',
      '/repo/apps/worker-cli/src/aiworker.ts',
      'provision',
      '--host',
      'https://host.example',
      '--token',
      'awp_secret',
    ])

    expect(code).toBe(0)
    expect(process.env.AIWORKER_HOST_URL).toBe('https://host.example')
    expect(process.env.AIWORKER_PROVISION_TOKEN).toBe('awp_secret')
    expect(foregroundCalls).toEqual([{}])
    expect(stdout).not.toContain('awp_secret')
    expect(stderr).not.toContain('awp_secret')
  })
})
