import { describe, expect, it } from 'bun:test'

import {
  buildUpgradePlan,
  detectInstallSource,
  parseUpdateCommandOptions,
} from './updater'

describe('CLI updater core', () => {
  it('treats update and upgrade as apply-mode aliases', () => {
    expect(parseUpdateCommandOptions('update', {})).toMatchObject({ command: 'update', mode: 'apply' })
    expect(parseUpdateCommandOptions('upgrade', {})).toMatchObject({ command: 'upgrade', mode: 'apply' })
  })

  it('maps check to read-only mode before dry-run and apply', () => {
    expect(parseUpdateCommandOptions('update', { check: true })).toMatchObject({ mode: 'check' })
    expect(parseUpdateCommandOptions('upgrade', { check: true, dryRun: true })).toMatchObject({ mode: 'check' })
  })

  it('defaults to stable releases and maps prerelease input to preview', () => {
    expect(parseUpdateCommandOptions('update', {})).toMatchObject({
      channel: 'stable',
      prerelease: false,
    })
    expect(parseUpdateCommandOptions('update', { pre: true })).toMatchObject({
      channel: 'preview',
      prerelease: true,
    })
    expect(parseUpdateCommandOptions('update', { channel: 'preview' })).toMatchObject({
      channel: 'preview',
      prerelease: true,
    })
  })

  it('rejects unsupported runtime update channels', () => {
    expect(() => parseUpdateCommandOptions('update', { channel: 'canary' as any })).toThrow('unsupported update channel: canary')
  })

  it('lets pre force preview even when stable channel is provided', () => {
    expect(parseUpdateCommandOptions('update', { channel: 'stable', pre: true })).toMatchObject({
      channel: 'preview',
      prerelease: true,
    })
  })

  it('detects source checkouts and refuses self modification', () => {
    expect(detectInstallSource({
      argv1: '/repo/apps/cli/src/aiworker.ts',
      moduleDir: '/repo/apps/cli/src',
    })).toMatchObject({
      kind: 'source-checkout',
      canAutoUpgrade: false,
    })

    expect(detectInstallSource({
      argv1: '/tmp/link-aiworker',
      moduleDir: '/repo/packages/cli/dist',
      realArgv1: '/repo/apps/cli/src/aiworker.ts',
    })).toMatchObject({
      kind: 'source-checkout',
      canAutoUpgrade: false,
    })
  })

  it('detects npm global bin shims as auto-upgradeable npm installs', () => {
    expect(detectInstallSource({
      argv1: '/usr/local/bin/aiworker',
      moduleDir: '/usr/local/lib/node_modules/@zonease/aiworker-cli/dist',
      npmGlobalBinDirs: ['/usr/local/bin'],
    })).toMatchObject({
      canAutoUpgrade: true,
      kind: 'npm-global',
      packageManager: 'npm',
    })
  })

  it('detects bun global installs as auto-upgradeable bun installs', () => {
    expect(detectInstallSource({
      argv1: '/Users/ben/.bun/bin/aiworker',
      moduleDir: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli/dist',
      bunGlobalBinDirs: ['/Users/ben/.bun/bin'],
    })).toMatchObject({
      canAutoUpgrade: true,
      kind: 'bun-global',
      packageManager: 'bun',
    })
  })

  it('detects npx and bunx ephemeral cache paths as unsupported', () => {
    expect(detectInstallSource({
      argv1: '/Users/ben/.npm/_npx/1234/node_modules/.bin/aiworker',
      moduleDir: '/Users/ben/.npm/_npx/1234/node_modules/@zonease/aiworker-cli/dist',
    })).toMatchObject({
      canAutoUpgrade: false,
      kind: 'ephemeral',
    })

    expect(detectInstallSource({
      argv1: '/Users/ben/.bun/install/cache/@zonease/aiworker-cli@1.2.3/bin/aiworker',
      moduleDir: '/Users/ben/.bun/install/cache/@zonease/aiworker-cli@1.2.3',
    })).toMatchObject({
      canAutoUpgrade: false,
      kind: 'ephemeral',
    })
  })

  it('builds read-only unsupported-source check plans without actions or confirmation', () => {
    const plan = buildUpgradePlan({
      currentVersion: '1.0.0',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: false, kind: 'ephemeral' },
      target: { source: 'npm', version: '1.1.0' },
    })

    expect(plan).toMatchObject({
      actions: [],
      requiresConfirmation: false,
      status: 'update_available',
    })
  })

  it('treats prerelease current versions as older than matching stable targets', () => {
    const plan = buildUpgradePlan({
      currentVersion: '1.0.0-beta.1',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.0.0' },
    })

    expect(plan).toMatchObject({
      actions: [],
      status: 'update_available',
    })
  })

  it('treats stable current versions as newer than matching prerelease targets', () => {
    const plan = buildUpgradePlan({
      currentVersion: '1.0.0',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.0.0-beta.1' },
    })

    expect(plan).toMatchObject({
      actions: [],
      status: 'already_current',
    })
  })

  it('keeps normal numeric version comparisons intact', () => {
    const olderPatchPlan = buildUpgradePlan({
      currentVersion: '1.0.9',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.0.10' },
    })
    const newerMinorPlan = buildUpgradePlan({
      currentVersion: '1.2.0',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.1.9' },
    })

    expect(olderPatchPlan.status).toBe('update_available')
    expect(newerMinorPlan.status).toBe('already_current')
  })
})
