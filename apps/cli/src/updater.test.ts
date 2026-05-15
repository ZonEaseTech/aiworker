import { describe, expect, it } from 'bun:test'

import {
  buildUpgradePlan,
  detectInstallSource,
  executeUpgradePlan,
  parseUpdateCommandOptions,
  resolveReleaseTarget,
} from './updater'
import type { ExecuteUpgradePlanInput, UpgradeAction, UpgradePlan } from './updater'

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
        versions: {},
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
        requiresConfirmation: false,
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
        requiresConfirmation: false,
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
        requiresConfirmation: false,
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
        requiresConfirmation: false,
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
    requiresConfirmation: false,
    source: { canAutoUpgrade: true, kind: 'npm-global', packageManager: 'npm' },
    status: 'update_available',
    target: { checksumUrl: null, downloadUrl: null, source: 'npm', version: '1.2.3' },
    targetVersion: '1.2.3',
  }
}
