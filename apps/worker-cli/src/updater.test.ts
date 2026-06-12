import type { ExecuteUpgradePlanInput, UpgradeAction, UpgradePlan } from './updater'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'bun:test'

import {
  buildUpgradePlan,
  canRestartManagedDaemon,
  detectInstallSource,
  executeUpgradePlan,
  formatUpgradeReport,
  isManagedWorkerDaemonCommand,
  parseUpdateCommandOptions,
  readDailyUpdateNoticeState,
  resolveReleaseTarget,
  verifySha256Text,
} from './updater'

describe('CLI updater core', () => {
  it('treats update and upgrade as apply-mode aliases', () => {
    const update = parseUpdateCommandOptions('update', {})
    const upgrade = parseUpdateCommandOptions('upgrade', {})

    expect(update).toMatchObject({ command: 'update', mode: 'apply' })
    expect(upgrade).toMatchObject({ command: 'upgrade', mode: 'apply' })
    expect(update).not.toHaveProperty('yes')
    expect(upgrade).not.toHaveProperty('yes')
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
      argv1: '/repo/apps/worker-cli/src/aiworker.ts',
      moduleDir: '/repo/apps/worker-cli/src',
    })).toMatchObject({
      kind: 'source-checkout',
      canAutoUpgrade: false,
    })

    expect(detectInstallSource({
      argv1: '/tmp/link-aiworker',
      moduleDir: '/repo/packages/cli/dist',
      realArgv1: '/repo/apps/worker-cli/src/aiworker.ts',
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

    expect(detectInstallSource({
      argv1: '/usr/local/lib/node_modules/@zonease/aiworker-cli/aiworker-bun.js',
      moduleDir: '/usr/local/lib/node_modules/@zonease/aiworker-cli',
      npmGlobalBinDirs: ['/usr/local/bin'],
      realArgv1: '/usr/local/lib/node_modules/@zonease/aiworker-cli/aiworker-bun.js',
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

    expect(detectInstallSource({
      argv1: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli/aiworker-bun.js',
      bunGlobalBinDirs: ['/Users/ben/.bun/bin'],
      moduleDir: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli',
      realArgv1: '/Users/ben/.bun/install/global/node_modules/@zonease/aiworker-cli/aiworker-bun.js',
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

  it('detects GitHub tarball installs from standalone executable evidence', () => {
    expect(detectInstallSource({
      argv1: '/$bunfs/root/aiworker',
      moduleDir: '/$bunfs/root',
      realArgv1: '/opt/aiworker-darwin-arm64/aiworker',
    })).toMatchObject({
      canAutoUpgrade: true,
      kind: 'github-tarball',
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
      status: 'update_available',
    })
  })

  it('builds executable apply plans without requiring a confirmation flag', () => {
    const plan = buildUpgradePlan({
      currentVersion: '1.0.0',
      options: parseUpdateCommandOptions('update', {}),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.1.0' },
    })

    expect(plan).toMatchObject({
      status: 'update_available',
    })
    expect(plan.actions.map(action => action.kind)).toEqual([
      'package-manager',
      'host-convergence',
      'daemon-restart',
    ])
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

  it('preserves hyphens inside prerelease identifiers when comparing updates', () => {
    const numberedBetaPlan = buildUpgradePlan({
      currentVersion: '1.0.0-beta-1',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.0.0-beta-2' },
    })
    const alphaBetaPlan = buildUpgradePlan({
      currentVersion: '1.0.0-alpha',
      options: parseUpdateCommandOptions('update', { check: true }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      target: { source: 'npm', version: '1.0.0-alpha-beta' },
    })

    expect(numberedBetaPlan.status).toBe('update_available')
    expect(alphaBetaPlan.status).toBe('update_available')
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

  it('resolves npm latest for stable package-manager installs', async () => {
    const seenUrls: string[] = []
    const target = await resolveReleaseTarget({
      fetch: async (url) => {
        seenUrls.push(url)
        return jsonResponse({
          'dist-tags': {
            latest: '1.2.3',
            preview: '1.3.0-beta.1',
          },
        })
      },
      options: parseUpdateCommandOptions('update', {}),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
    })

    expect(seenUrls).toEqual(['https://registry.npmjs.org/@zonease%2Faiworker-cli'])
    expect(target).toEqual({
      checksumUrl: null,
      downloadUrl: null,
      isPrerelease: false,
      source: 'npm',
      version: '1.2.3',
    })
  })

  it('resolves npm preview when pre is set and marks prerelease', async () => {
    const target = await resolveReleaseTarget({
      fetch: async () => jsonResponse({
        'dist-tags': {
          latest: '1.2.3',
          preview: '1.3.0-beta.1',
        },
      }),
      options: parseUpdateCommandOptions('update', { pre: true }),
      source: { canAutoUpgrade: true, kind: 'bun-global', packageManager: 'bun' },
    })

    expect(target).toMatchObject({
      isPrerelease: true,
      source: 'npm',
      version: '1.3.0-beta.1',
    })
  })

  it('resolves explicit targets without fetching registry metadata', async () => {
    const target = await resolveReleaseTarget({
      fetch: async () => {
        throw new Error('fetchJson should not be called for explicit targets')
      },
      options: parseUpdateCommandOptions('update', { target: '0.14.9' }),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
    })

    expect(target).toEqual({
      checksumUrl: null,
      downloadUrl: null,
      isPrerelease: false,
      source: 'npm',
      version: '0.14.9',
    })
  })

  it('rejects npm targets when the selected dist-tag is missing', async () => {
    await expect(resolveReleaseTarget({
      fetch: async () => jsonResponse({
        'dist-tags': {},
        'versions': {},
      }),
      options: parseUpdateCommandOptions('update', {}),
      source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
    })).rejects.toThrow('npm dist-tag not found: latest')
  })

  it('rejects npm targets when the selected dist-tag is empty or malformed', async () => {
    for (const payload of [
      { 'dist-tags': { latest: '' } },
      { 'dist-tags': { latest: 123 } },
      {},
    ]) {
      await expect(resolveReleaseTarget({
        fetch: async () => jsonResponse(payload),
        options: parseUpdateCommandOptions('update', {}),
        source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
      })).rejects.toThrow('npm dist-tag not found: latest')
    }
  })

  it('resolves GitHub tarball releases to platform asset and checksum URLs', async () => {
    const target = await resolveReleaseTarget({
      fetch: async url => jsonResponse({
        assets: [
          { browser_download_url: 'https://downloads.example/aiworker-darwin-arm64.tar.gz', name: 'aiworker-darwin-arm64.tar.gz' },
          { browser_download_url: 'https://downloads.example/aiworker-darwin-arm64.tar.gz.sha256', name: 'aiworker-darwin-arm64.tar.gz.sha256' },
          { browser_download_url: 'https://downloads.example/aiworker-linux-x64.tar.gz', name: 'aiworker-linux-x64.tar.gz' },
        ],
        tag_name: 'v1.2.3',
        url,
      }),
      options: parseUpdateCommandOptions('update', {}),
      platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
      source: { canAutoUpgrade: true, kind: 'github-tarball' },
    })

    expect(target).toEqual({
      checksumUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz.sha256',
      downloadUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz',
      isPrerelease: false,
      source: 'github',
      version: '1.2.3',
    })
  })

  it('keeps missing GitHub tarball asset URLs nullable', async () => {
    const target = await resolveReleaseTarget({
      fetch: async () => jsonResponse({
        assets: [
          { browser_download_url: 'https://downloads.example/aiworker-linux-x64.tar.gz', name: 'aiworker-linux-x64.tar.gz' },
        ],
        tag_name: 'v1.2.3',
      }),
      options: parseUpdateCommandOptions('update', {}),
      platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
      source: { canAutoUpgrade: true, kind: 'github-tarball' },
    })

    expect(target).toEqual({
      checksumUrl: null,
      downloadUrl: null,
      isPrerelease: false,
      source: 'github',
      version: '1.2.3',
    })
  })

  it('marks GitHub tarball apply plans without checksum URLs as unsupported', () => {
    const plan = buildUpgradePlan({
      currentVersion: '1.2.2',
      options: parseUpdateCommandOptions('update', {}),
      source: { canAutoUpgrade: true, kind: 'github-tarball' },
      target: {
        checksumUrl: null,
        downloadUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz',
        source: 'github',
        version: '1.2.3',
      },
    })

    expect(plan.actions).toEqual([])
    expect(plan.status).toBe('source_not_supported')
  })

  it('rejects GitHub tarball releases when the platform asset URL is invalid', async () => {
    for (const asset of [
      { name: 'aiworker-darwin-arm64.tar.gz' },
      { browser_download_url: '', name: 'aiworker-darwin-arm64.tar.gz' },
      { browser_download_url: 123, name: 'aiworker-darwin-arm64.tar.gz' },
    ]) {
      await expect(resolveReleaseTarget({
        fetch: async () => jsonResponse({
          assets: [asset],
          tag_name: 'v1.2.3',
        }),
        options: parseUpdateCommandOptions('update', {}),
        platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
        source: { canAutoUpgrade: true, kind: 'github-tarball' },
      })).rejects.toThrow('github release asset url invalid: aiworker-darwin-arm64.tar.gz')
    }
  })

  it('rejects GitHub tarball releases when the checksum asset URL is invalid', async () => {
    for (const checksumAsset of [
      { name: 'aiworker-darwin-arm64.tar.gz.sha256' },
      { browser_download_url: '', name: 'aiworker-darwin-arm64.tar.gz.sha256' },
      { browser_download_url: false, name: 'aiworker-darwin-arm64.tar.gz.sha256' },
    ]) {
      await expect(resolveReleaseTarget({
        fetch: async () => jsonResponse({
          assets: [
            { browser_download_url: 'https://downloads.example/aiworker-darwin-arm64.tar.gz', name: 'aiworker-darwin-arm64.tar.gz' },
            checksumAsset,
          ],
          tag_name: 'v1.2.3',
        }),
        options: parseUpdateCommandOptions('update', {}),
        platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
        source: { canAutoUpgrade: true, kind: 'github-tarball' },
      })).rejects.toThrow('github release asset url invalid: aiworker-darwin-arm64.tar.gz.sha256')
    }
  })

  it('rejects GitHub releases when tag_name is missing or malformed', async () => {
    for (const payload of [
      { assets: [], tag_name: '' },
      { assets: [], tag_name: 123 },
      { assets: [] },
    ]) {
      await expect(resolveReleaseTarget({
        fetch: async () => jsonResponse(payload),
        options: parseUpdateCommandOptions('update', {}),
        platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
        source: { canAutoUpgrade: true, kind: 'github-tarball' },
      })).rejects.toThrow('github release tag not found')
    }
  })

  it('rejects GitHub releases when assets is missing or malformed', async () => {
    for (const payload of [
      { tag_name: 'v1.2.3' },
      { assets: null, tag_name: 'v1.2.3' },
      { assets: {}, tag_name: 'v1.2.3' },
    ]) {
      await expect(resolveReleaseTarget({
        fetch: async () => jsonResponse(payload),
        options: parseUpdateCommandOptions('update', {}),
        platformAssetName: () => 'aiworker-darwin-arm64.tar.gz',
        source: { canAutoUpgrade: true, kind: 'github-tarball' },
      })).rejects.toThrow('github release assets invalid')
    }
  })

  it('does not call write hooks during dry-run execution', async () => {
    const calls: string[] = []
    const result = await executeUpgradePlan({
      downloadAndReplace: async () => {
        calls.push('downloadAndReplace')
      },
      convergeHost: async () => {
        calls.push('convergeHost')
      },
      plan: {
        actions: [
          {
            args: ['install', '-g', '@zonease/aiworker-cli@1.2.3'],
            command: 'npm',
            kind: 'package-manager',
          },
          { kind: 'host-convergence' },
          { kind: 'daemon-restart' },
        ],
        currentVersion: '1.2.2',
        mode: 'dry-run',
        source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
        status: 'update_available',
        target: { checksumUrl: null, downloadUrl: null, source: 'npm', version: '1.2.3' },
        targetVersion: '1.2.3',
      },
      restartDaemon: async () => {
        calls.push('restartDaemon')
      },
      runCommand: async () => {
        calls.push('runCommand')
      },
    })

    expect(result).toEqual({ completedActions: [], status: 'dry_run' })
    expect(calls).toEqual([])
  })

  it('skips execution for non-update plans even when actions are present', async () => {
    const calls: string[] = []
    const result = await executeUpgradePlan({
      convergeHost: async () => {
        calls.push('convergeHost')
      },
      downloadAndReplace: async () => {
        calls.push('downloadAndReplace')
      },
      plan: {
        actions: [
          {
            args: ['install', '-g', '@zonease/aiworker-cli@1.2.3'],
            command: 'npm',
            kind: 'package-manager',
          },
          { kind: 'host-convergence' },
          { kind: 'daemon-restart' },
        ],
        currentVersion: '1.2.3',
        mode: 'apply',
        source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
        status: 'already_current',
        target: { checksumUrl: null, downloadUrl: null, source: 'npm', version: '1.2.3' },
        targetVersion: '1.2.3',
      },
      restartDaemon: async () => {
        calls.push('restartDaemon')
      },
      runCommand: async () => {
        calls.push('runCommand')
      },
    })

    expect(result).toEqual({ completedActions: [], status: 'skipped' })
    expect(calls).toEqual([])
  })

  it('skips execution for update-available plans without actions', async () => {
    const calls: string[] = []
    const result = await executeUpgradePlan({
      convergeHost: async () => {
        calls.push('convergeHost')
      },
      downloadAndReplace: async () => {
        calls.push('downloadAndReplace')
      },
      plan: {
        actions: [],
        currentVersion: '1.2.2',
        mode: 'apply',
        source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
        status: 'update_available',
        target: { checksumUrl: null, downloadUrl: null, source: 'npm', version: '1.2.3' },
        targetVersion: '1.2.3',
      },
      restartDaemon: async () => {
        calls.push('restartDaemon')
      },
      runCommand: async () => {
        calls.push('runCommand')
      },
    })

    expect(result).toEqual({ completedActions: [], status: 'skipped' })
    expect(calls).toEqual([])
  })

  it('fails package-manager actions when the runCommand hook is missing', async () => {
    await expect(executeUpgradePlan({
      plan: upgradePlanWithActions([
        {
          args: ['install', '-g', '@zonease/aiworker-cli@1.2.3'],
          command: 'npm',
          kind: 'package-manager',
        },
      ]),
    } as unknown as ExecuteUpgradePlanInput)).rejects.toThrow('upgrade executor hook missing: runCommand')
  })

  it('fails github-tarball actions when the downloadAndReplace hook is missing', async () => {
    await expect(executeUpgradePlan({
      plan: upgradePlanWithActions([
        {
          checksumUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz.sha256',
          downloadUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz',
          kind: 'github-tarball',
        },
      ]),
    } as unknown as ExecuteUpgradePlanInput)).rejects.toThrow('upgrade executor hook missing: downloadAndReplace')
  })

  it('fails host-convergence actions when the convergeHost hook is missing', async () => {
    await expect(executeUpgradePlan({
      plan: upgradePlanWithActions([{ kind: 'host-convergence' }]),
    } as unknown as ExecuteUpgradePlanInput)).rejects.toThrow('upgrade executor hook missing: convergeHost')
  })

  it('fails daemon-restart actions when the restartDaemon hook is missing', async () => {
    await expect(executeUpgradePlan({
      plan: upgradePlanWithActions([{ kind: 'daemon-restart' }]),
    } as unknown as ExecuteUpgradePlanInput)).rejects.toThrow('upgrade executor hook missing: restartDaemon')
  })

  it('executes upgrade actions in order and collects completed action names', async () => {
    const calls: string[] = []
    const result = await executeUpgradePlan({
      convergeHost: async () => {
        calls.push('host-convergence')
      },
      downloadAndReplace: async () => {
        calls.push('github-tarball')
      },
      plan: {
        actions: [
          {
            args: ['install', '-g', '@zonease/aiworker-cli@1.2.3'],
            command: 'npm',
            kind: 'package-manager',
          },
          {
            checksumUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz.sha256',
            downloadUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz',
            kind: 'github-tarball',
          },
          { kind: 'host-convergence' },
          { kind: 'daemon-restart' },
        ],
        currentVersion: '1.2.2',
        mode: 'apply',
        source: { canAutoUpgrade: true, kind: 'github-tarball' },
        status: 'update_available',
        target: {
          checksumUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz.sha256',
          downloadUrl: 'https://downloads.example/aiworker-darwin-arm64.tar.gz',
          source: 'github',
          version: '1.2.3',
        },
        targetVersion: '1.2.3',
      },
      restartDaemon: async () => {
        calls.push('daemon-restart')
      },
      runCommand: async () => {
        calls.push('package-manager')
      },
    })

    expect(result).toEqual({
      completedActions: ['package-manager', 'github-tarball', 'host-convergence', 'daemon-restart'],
      status: 'completed',
    })
    expect(calls).toEqual(['package-manager', 'github-tarball', 'host-convergence', 'daemon-restart'])
  })
})

describe('CLI updater safety helpers', () => {
  it('verifies sha256 checksum lines', () => {
    const digest = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    expect(verifySha256Text('test', `${digest}  aiworker-darwin-arm64.tar.gz\n`)).toBe(true)
    expect(verifySha256Text(new Uint8Array(Buffer.from('test')), `${digest}  aiworker-darwin-arm64.tar.gz\n`)).toBe(true)
    expect(verifySha256Text('test', '0000  aiworker-darwin-arm64.tar.gz\n')).toBe(false)
  })

  it('allows restart only for the managed daemon in the same home', () => {
    expect(canRestartManagedDaemon({
      command: '/usr/local/bin/bun /usr/local/bin/aiworker daemon foreground --host 127.0.0.1 --port 9217',
      expectedHome: '/Users/ben/.aiworker',
      pid: 123,
      pidFileHome: '/Users/ben/.aiworker',
      running: true,
    })).toMatchObject({ allowed: true })

    expect(canRestartManagedDaemon({
      command: 'bun apps/worker-cli/src/aiworker.ts dev --port 9217',
      expectedHome: '/Users/ben/.aiworker',
      pid: 123,
      pidFileHome: '/Users/ben/.aiworker',
      running: true,
    })).toMatchObject({ allowed: false, reason: 'not-managed-daemon' })
  })

  it('rejects unmanaged daemon-like commands', () => {
    const baseProbe = {
      expectedHome: '/Users/ben/.aiworker',
      pid: 123,
      pidFileHome: '/Users/ben/.aiworker',
      running: true,
    }

    expect(canRestartManagedDaemon({
      ...baseProbe,
      command: 'bun apps/worker-cli/src/aiworker.ts daemon foreground --port 9217',
    })).toMatchObject({ allowed: false, reason: 'not-managed-daemon' })

    expect(canRestartManagedDaemon({
      ...baseProbe,
      command: '/usr/local/bin/aiworker dev --port 9217',
    })).toMatchObject({ allowed: false, reason: 'not-managed-daemon' })

    expect(canRestartManagedDaemon({
      ...baseProbe,
      command: '/usr/local/bin/aiworker foreground daemon --port 9217',
    })).toMatchObject({ allowed: false, reason: 'not-managed-daemon' })
  })

  it('recognizes every shipped managed worker daemon command form', () => {
    // npm bin: sh wrapper exec bun <bundle> daemon foreground
    expect(isManagedWorkerDaemonCommand('bun /usr/local/lib/node_modules/@zonease/aiworker-cli/dist/aiworker-bun.js daemon foreground --host 127.0.0.1 --port 9217')).toBe(true)
    // legacy bare-aiworker bin form (kept compatible)
    expect(isManagedWorkerDaemonCommand('/usr/local/bin/bun /usr/local/bin/aiworker daemon foreground')).toBe(true)
    // compiled standalone binaries (4 release targets)
    expect(isManagedWorkerDaemonCommand('/opt/aiworker/aiworker-linux-x64 daemon foreground')).toBe(true)
    expect(isManagedWorkerDaemonCommand('/opt/aiworker/aiworker-linux-arm64 daemon foreground')).toBe(true)
    expect(isManagedWorkerDaemonCommand('/opt/aiworker/aiworker-darwin-x64 daemon foreground')).toBe(true)
    expect(isManagedWorkerDaemonCommand('/opt/aiworker/aiworker-darwin-arm64 daemon foreground')).toBe(true)
  })

  it('never mistakes the host daemon or dev-source for a managed worker daemon', () => {
    // Host daemon bundle: identical shape, different bundle — must NOT match.
    expect(isManagedWorkerDaemonCommand('bun /usr/local/lib/node_modules/@zonease/aiworker-host-cli/dist/aiworker-host-bun.js daemon foreground')).toBe(false)
    // dev/source checkout is never a managed daemon.
    expect(isManagedWorkerDaemonCommand('bun apps/worker-cli/src/aiworker.ts daemon foreground --port 9217')).toBe(false)
    expect(isManagedWorkerDaemonCommand('bun apps/worker-cli/src/aiworker.ts dev --port 9217')).toBe(false)
    // wrong subcommand order or missing foreground.
    expect(isManagedWorkerDaemonCommand('/opt/aiworker/aiworker-linux-x64 foreground daemon')).toBe(false)
    expect(isManagedWorkerDaemonCommand('/usr/local/bin/aiworker dev')).toBe(false)
    expect(isManagedWorkerDaemonCommand(null)).toBe(false)
    expect(isManagedWorkerDaemonCommand('')).toBe(false)
  })

  it('reads absent daily notice state as ready for a check', () => {
    expect(readDailyUpdateNoticeState(null, new Date('2026-05-15T00:00:00.000Z'))).toMatchObject({
      canCheck: true,
      latestSeenVersion: null,
    })
  })

  it('reads invalid, future and expired daily notice state as ready for a check', () => {
    const now = new Date('2026-05-15T00:00:00.000Z')

    expect(readDailyUpdateNoticeState({ checkedAt: 'not-a-date' }, now)).toMatchObject({ canCheck: true })
    expect(readDailyUpdateNoticeState({ checkedAt: '2026-05-16T00:00:00.000Z' }, now)).toMatchObject({ canCheck: true })
    expect(readDailyUpdateNoticeState({ checkedAt: '2026-05-14T00:00:00.000Z' }, now)).toMatchObject({ canCheck: true })
    expect(readDailyUpdateNoticeState({ checkedAt: '2026-05-13T23:59:59.999Z' }, now)).toMatchObject({ canCheck: true })
  })

  it('suppresses daily notice checks only within the current 24 hour window', () => {
    const now = new Date('2026-05-15T00:00:00.000Z')

    expect(readDailyUpdateNoticeState({ checkedAt: '2026-05-14T00:00:00.001Z' }, now)).toMatchObject({ canCheck: false })
  })

  it('formats reports with source, target, actions and restart result', () => {
    const report = formatUpgradeReport({
      completedActions: ['package-manager', 'host-convergence'],
      currentVersion: '0.14.0',
      daemon: { restarted: false, reason: 'foreground daemon requires manual restart' },
      source: { canAutoUpgrade: true, detail: 'npm global', kind: 'npm-global', packageManager: 'npm' },
      status: 'completed',
      targetVersion: '0.14.1',
    })

    expect(report).toContain('0.14.0 -> 0.14.1')
    expect(report).toContain('npm global')
    expect(report).toContain('foreground daemon requires manual restart')
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function upgradePlanWithActions(actions: UpgradeAction[]): UpgradePlan {
  return {
    actions,
    currentVersion: '1.2.2',
    mode: 'apply',
    source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
    status: 'update_available',
    target: { checksumUrl: null, downloadUrl: null, source: 'npm', version: '1.2.3' },
    targetVersion: '1.2.3',
  }
}
