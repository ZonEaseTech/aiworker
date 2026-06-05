import { describe, expect, it } from 'bun:test'

import { buildProvisionEnv, redactProvisionCommandForLog } from './aiworker'

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
      'aiworker',
      'provision',
      '--host',
      'https://host.example',
      '--token',
      'awp_secret',
    ])).toBe('aiworker provision --host https://host.example --token [REDACTED]')
  })

  it('redacts provision token passed with equals syntax', () => {
    expect(redactProvisionCommandForLog([
      'aiworker',
      'provision',
      '--host=https://host.example',
      '--token=awp_secret',
    ])).toBe('aiworker provision --host=https://host.example --token=[REDACTED]')
  })
})
