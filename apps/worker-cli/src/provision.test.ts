import { describe, expect, it } from 'bun:test'

import {
  buildProvisionEnv,
  redactProvisionCommandForLog,
} from './aiworker'

describe('aiworker provision command helpers', () => {
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

  // The end-to-end provision behavior (env set + foreground + no token leak) is exercised by the
  // first-provision bootstrap integration test in provision-bootstrap.test.ts, which isolates the
  // home/DB and injects check-in. This file keeps only the pure helper contracts.
})
