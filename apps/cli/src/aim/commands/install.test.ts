import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  canonicalUnitPath,
  installSystemd,
  renderSystemdUnit,
  resolveCurrentExecStart,
  runInstallSystemd,
} from './install'

/**
 * 测试约束：
 *   - 不允许触发 systemctl（CI/容器/macOS 没这玩意）。所有写盘 case 必须走 `--out` 或 `--no-enable`，
 *     dry-run case 直接跑 runInstallSystemd 即可。
 *   - 不允许往 ~/.config/systemd/ 真实落盘——固定用 mkdtempSync(tmpdir(), ...) 隔离。
 */

let workDir: string
const TEST_EXEC_START = '/bin/true gateway start'

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'aim-install-systemd-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('renderSystemdUnit', () => {
  it('user scope renders portable ExecStart, env file, state dir, and hardening', () => {
    const text = renderSystemdUnit({ scope: 'user', execStart: TEST_EXEC_START })
    expect(text).toContain('Description=AIWorker gateway daemon (user instance)')
    expect(text).toContain('Documentation=https://github.com/ZonEaseTech/aiworker/blob/main/docs/deployment.md')
    expect(text).toContain('After=network-online.target')
    expect(text).toContain('Wants=network-online.target')
    expect(text).toContain('Environment=AIWORKER_HOME=%S/aiworker')
    expect(text).toContain('EnvironmentFile=-%h/.config/aiworker/gateway.env')
    expect(text).toContain(`ExecStart=${TEST_EXEC_START}`)
    expect(text).toContain('StateDirectory=aiworker')
    expect(text).toContain('StateDirectoryMode=0700')
    expect(text).toContain('PrivateTmp=true')
    expect(text).toContain('ProtectSystem=strict')
    expect(text).toContain('ReadWritePaths=%S/aiworker')
    expect(text).toContain('NoNewPrivileges=true')
    expect(text).toContain('WantedBy=default.target')
    expect(text).not.toContain('User=root')
    expect(text).not.toContain('Group=root')
    expect(text).not.toContain('WantedBy=multi-user.target')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('system scope renders secure production unit fields', () => {
    const text = renderSystemdUnit({ scope: 'system', execStart: TEST_EXEC_START })
    expect(text).toContain('Description=AIWorker gateway daemon (PLAN-016 systemd path)')
    expect(text).toContain('Documentation=https://github.com/ZonEaseTech/aiworker/blob/main/docs/deployment.md')
    expect(text).toContain('After=network-online.target')
    expect(text).toContain('Wants=network-online.target')
    expect(text).toContain('EnvironmentFile=-/etc/aiworker/gateway.env')
    expect(text).toContain(`ExecStart=${TEST_EXEC_START}`)
    expect(text).toContain('Environment=AIWORKER_HOME=/var/lib/aiworker')
    expect(text).toContain('User=root')
    expect(text).toContain('Group=root')
    expect(text).toContain('StateDirectory=aiworker')
    expect(text).toContain('StateDirectoryMode=0700')
    expect(text).toContain('PrivateTmp=true')
    expect(text).toContain('ProtectSystem=strict')
    expect(text).toContain('ReadWritePaths=/var/lib/aiworker')
    expect(text).toContain('NoNewPrivileges=true')
    expect(text).toContain('WantedBy=multi-user.target')
    expect(text).not.toContain('%h')
    expect(text).not.toContain('WantedBy=default.target')
  })

  it('rejects empty or multiline ExecStart overrides', () => {
    expect(() => renderSystemdUnit({ scope: 'system', execStart: '' })).toThrow(/ExecStart/)
    expect(() => renderSystemdUnit({ scope: 'system', execStart: '/bin/true\nEnvironment=BAD=1' })).toThrow(/single line/)
  })

  it('每段以 [Unit] / [Service] / [Install] 三段结构呈现', () => {
    const text = renderSystemdUnit({ scope: 'user', execStart: TEST_EXEC_START })
    const idxUnit = text.indexOf('[Unit]')
    const idxService = text.indexOf('[Service]')
    const idxInstall = text.indexOf('[Install]')
    expect(idxUnit).toBe(0)
    expect(idxService).toBeGreaterThan(idxUnit)
    expect(idxInstall).toBeGreaterThan(idxService)
  })

  it('systemd-analyze verify accepts rendered user and system units when available', () => {
    const available = spawnSync('systemd-analyze', ['--version'], { stdio: 'ignore' }).status === 0
    if (!available)
      return
    for (const scope of ['user', 'system'] as const) {
      const target = path.join(workDir, `${scope}.service`)
      writeFileSync(target, renderSystemdUnit({ scope, execStart: TEST_EXEC_START }), 'utf8')
      const verified = spawnSync('systemd-analyze', ['verify', target], { encoding: 'utf8' })
      expect(`${verified.stdout}${verified.stderr}`).toBe('')
      expect(verified.status).toBe(0)
    }
  })
})

describe('resolveCurrentExecStart', () => {
  it('uses the current Bun runtime plus current aiworker script', () => {
    const text = resolveCurrentExecStart({
      execPath: '/opt/bun/bin/bun',
      argv: ['bun', '/srv/aiworker/dist/aiworker.js', 'install', 'systemd'],
      pathExists: candidate => candidate === '/srv/aiworker/dist/aiworker.js',
    })
    expect(text).toBe('/opt/bun/bin/bun /srv/aiworker/dist/aiworker.js gateway start')
  })

  it('quotes ExecStart arguments that contain spaces', () => {
    const text = resolveCurrentExecStart({
      execPath: '/opt/Bun Runtime/bin/bun',
      argv: ['bun', '/srv/AI Worker/dist/aiworker.js', 'install', 'systemd'],
      pathExists: candidate => candidate === '/srv/AI Worker/dist/aiworker.js',
    })
    expect(text).toBe('"/opt/Bun Runtime/bin/bun" "/srv/AI Worker/dist/aiworker.js" gateway start')
  })

  it('uses a standalone aiworker executable directly', () => {
    const text = resolveCurrentExecStart({
      execPath: '/usr/local/bin/aiworker',
      argv: ['/usr/local/bin/aiworker', 'install', 'systemd'],
      pathExists: () => false,
    })
    expect(text).toBe('/usr/local/bin/aiworker gateway start')
  })

  it('falls back to an absolute aiworker found on PATH', () => {
    const text = resolveCurrentExecStart({
      execPath: '/usr/bin/node',
      argv: ['node', 'missing.js', 'install', 'systemd'],
      env: { PATH: '/usr/bin:/opt/aiworker/bin' },
      pathExists: candidate => candidate === '/opt/aiworker/bin/aiworker',
    })
    expect(text).toBe('/opt/aiworker/bin/aiworker gateway start')
  })
})

describe('canonicalUnitPath', () => {
  it('user scope 路径在 ~/.config/systemd/user/aiworker-gateway.service', () => {
    expect(canonicalUnitPath('user', '/home/op')).toBe('/home/op/.config/systemd/user/aiworker-gateway.service')
  })

  it('system scope 固定 /etc/systemd/system/aiworker-gateway.service', () => {
    expect(canonicalUnitPath('system', '/home/op')).toBe('/etc/systemd/system/aiworker-gateway.service')
  })
})

describe('installSystemd', () => {
  it('--dry-run 返回 content 但不写盘、不 enable', () => {
    const target = path.join(workDir, 'aiworker-gateway.service')
    const res = installSystemd({ dryRun: true, out: target, execStart: TEST_EXEC_START })
    expect(res.content).toContain(`ExecStart=${TEST_EXEC_START}`)
    expect(res.written).toBeUndefined()
    expect(res.enabled).toBe(false)
    expect(res.restartRequired).toBe(false)
    // dry-run 即便给了 --out 也不应实际落盘。
    expect(() => readFileSync(target, 'utf8')).toThrow()
  })

  it('--out 写盘到指定路径并自动跳过 systemctl', () => {
    const target = path.join(workDir, 'sub', 'aiworker-gateway.service')
    const res = installSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    expect(res.written?.path).toBe(target)
    expect(res.written?.unchanged).toBe(false)
    expect(res.enabled).toBe(false) // --out 强制跳 systemctl
    expect(res.restartRequired).toBe(false)
    const persisted = readFileSync(target, 'utf8')
    expect(persisted).toBe(res.content)
    expect(persisted).toContain('WantedBy=default.target')
  })

  it('--out 二次执行幂等：内容一致时 unchanged=true 且文件未被重写', () => {
    const target = path.join(workDir, 'aiworker-gateway.service')
    const first = installSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    expect(first.written?.unchanged).toBe(false)
    // 第二次：完全相同的入参；installSystemd 应识别已存在且 byte-equal，标 unchanged。
    const second = installSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    expect(second.written?.path).toBe(target)
    expect(second.written?.unchanged).toBe(true)
    expect(second.content).toBe(first.content)
    // 落盘内容不变。
    expect(readFileSync(target, 'utf8')).toBe(first.content)
  })

  it('--out 内容漂移时第二次会重写并恢复模板内容', () => {
    const target = path.join(workDir, 'aiworker-gateway.service')
    installSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    // 模拟手工篡改。
    writeFileSync(target, 'tampered\n', 'utf8')
    const res = installSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    expect(res.written?.unchanged).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe(res.content)
    expect(readFileSync(target, 'utf8')).not.toBe('tampered\n')
  })

  it('--no-enable 写盘但跳过 systemctl', () => {
    const target = path.join(workDir, 'aiworker-gateway.service')
    const res = installSystemd({ scope: 'user', out: target, noEnable: true, execStart: TEST_EXEC_START })
    expect(res.written?.path).toBe(target)
    expect(res.enabled).toBe(false)
    expect(res.restartRequired).toBe(false)
  })
})

describe('runInstallSystemd (CLI 包装)', () => {
  it('--dry-run 写到 stdout 且 exit 0', async () => {
    const captured: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    // 仅在该 case 内 hook stdout.write，结束后恢复。
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    }) as typeof process.stdout.write
    try {
      const code = await runInstallSystemd({ dryRun: true, execStart: TEST_EXEC_START })
      expect(code).toBe(0)
    }
    finally {
      process.stdout.write = orig
    }
    const joined = captured.join('')
    expect(joined).toContain('[Unit]')
    expect(joined).toContain(`ExecStart=${TEST_EXEC_START}`)
    expect(joined).toContain('WantedBy=default.target')
  })

  it('--out 写盘成功返回 exit 0，文件内容与渲染一致', async () => {
    const target = path.join(workDir, 'aiworker-gateway.service')
    const code = await runInstallSystemd({ scope: 'user', out: target, execStart: TEST_EXEC_START })
    expect(code).toBe(0)
    const persisted = readFileSync(target, 'utf8')
    expect(persisted).toContain(`ExecStart=${TEST_EXEC_START}`)
  })
})
