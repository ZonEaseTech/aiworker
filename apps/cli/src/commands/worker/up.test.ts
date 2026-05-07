import type { AiworkerScopeResult } from '@zonease/aiworker-fs-layout'
import type { CapabilityDoctorReport } from '../../capabilities/validation'
import type { ExecutorReadinessReport } from './executor'
import type { InitOptions } from './init'
import type { ServeOptions } from './serve'

import { describe, expect, it } from 'bun:test'

import { runUp } from './up'

const projectScope: AiworkerScopeResult = {
  home: '/repo/.aiworker/local',
  projectRoot: '/repo',
  scope: 'project',
  source: 'project-detect',
}

const userScope: AiworkerScopeResult = {
  home: '/home/user/.aiworker',
  scope: 'user',
  source: 'user-default',
}

const passCapabilityReport: CapabilityDoctorReport = {
  checks: [
    {
      id: 'policy',
      issues: [],
      label: 'policy.json',
      path: '/repo/.aiworker/policy.json',
      status: 'pass',
    },
  ],
  root: '/repo/.aiworker',
  status: 'pass',
}

const failCapabilityReport: CapabilityDoctorReport = {
  checks: [
    {
      id: 'brain-capabilities',
      issues: [{
        code: 'mcp.plaintext_secret',
        message: 'plaintext secret',
        path: 'servers.private.headers.Authorization',
        severity: 'error',
      }],
      label: 'brain-capabilities.json',
      path: '/repo/.aiworker/brain-capabilities.json',
      status: 'fail',
    },
  ],
  root: '/repo/.aiworker',
  status: 'fail',
}

const passExecutorReport: ExecutorReadinessReport = {
  configuredExecutor: {
    defaultStub: false,
    engine: 'codex',
    source: 'worker-config',
    variant: 'default',
    version: 2,
  },
  engines: [],
  file: '/repo/.aiworker/executor-capabilities.json',
  issues: [],
  manifest: {
    declaredCapabilities: 1,
    declaredEngines: 1,
    empty: false,
  },
  root: '/repo/.aiworker',
  status: 'pass',
}

function collectOutput(): { lines: string[], write: (text: string) => void } {
  const lines: string[] = []
  return {
    lines,
    write: text => lines.push(text),
  }
}

describe('runUp', () => {
  it('dry-runs a brand-new project without serving or materializing validation inputs', async () => {
    const output = collectOutput()
    let initOptions: InitOptions | undefined
    let served = false

    const code = await runUp({ dryRun: true, soul: 'developer' }, {
      cwd: () => '/tmp/new-project',
      resolveScope: () => userScope,
      runInit: async (options) => {
        initOptions = options
        return 0
      },
      runServe: async () => {
        served = true
      },
      write: output.write,
    })

    expect(code).toBe(0)
    expect(initOptions).toEqual({ dryRun: true, soul: 'developer' })
    expect(served).toBe(false)
    expect(output.lines.join('')).toContain('brand-new-project')
    expect(output.lines.join('')).toContain('dry-run: server not started')
    expect(output.lines.join('')).toContain('port         : (env/default)')
    expect(output.lines.join('')).not.toContain('NaN')
  })

  it('prints explicit dry-run port without starting serve', async () => {
    const output = collectOutput()
    let served = false

    const code = await runUp({ dryRun: true, port: 9123 }, {
      inspectExecutorReadiness: async () => ({ ok: true, report: passExecutorReport }),
      resolveScope: () => projectScope,
      runInit: async () => 0,
      runServe: async () => {
        served = true
      },
      validateCapabilityProject: async () => passCapabilityReport,
      write: output.write,
    })

    expect(code).toBe(0)
    expect(served).toBe(false)
    expect(output.lines.join('')).toContain('dry-run: server not started')
    expect(output.lines.join('')).toContain('port         : 9123')
  })

  it('does not consume --soul for an already initialized project', async () => {
    const output = collectOutput()
    let initCalled = false

    const code = await runUp({ soul: 'developer' }, {
      resolveScope: () => projectScope,
      runInit: async () => {
        initCalled = true
        return 0
      },
      write: output.write,
    })

    expect(code).toBe(2)
    expect(initCalled).toBe(false)
  })

  it('blocks serve when project capability validation fails', async () => {
    const output = collectOutput()
    let served = false

    const code = await runUp({}, {
      inspectExecutorReadiness: async () => ({ ok: true, report: passExecutorReport }),
      resolveScope: () => projectScope,
      runInit: async () => 0,
      runServe: async () => {
        served = true
      },
      validateCapabilityProject: async () => failCapabilityReport,
      write: output.write,
    })

    expect(code).toBe(1)
    expect(served).toBe(false)
    expect(output.lines.join('')).toContain('Status: FAIL')
    expect(output.lines.join('')).not.toContain('stage 5/5 serve')
  })

  it('reports executor readiness as non-blocking and forwards serve options', async () => {
    const output = collectOutput()
    let serveOptions: ServeOptions | undefined
    const executorReport: ExecutorReadinessReport = {
      configuredExecutor: {
        defaultStub: true,
        engine: 'http',
        source: 'worker-config',
        variant: 'default',
        version: 1,
      },
      engines: [{
        binary: 'codex',
        binaryFound: false,
        engine: 'codex',
        mcpCount: 1,
      }],
      file: '/repo/.aiworker/executor-capabilities.json',
      issues: [{
        code: 'executor.config_default_stub',
        message: 'default stub',
        path: 'worker_config.executor',
        severity: 'warning',
      }, {
        code: 'executor.binary_missing',
        message: 'missing codex',
        path: 'engines.codex',
        severity: 'warning',
      }],
      manifest: {
        declaredCapabilities: 1,
        declaredEngines: 1,
        empty: false,
      },
      root: '/repo/.aiworker',
      status: 'warn',
    }

    const code = await runUp({
      gateway: 'ws://127.0.0.1:9218/ws',
      gatewayReconnect: false,
      host: '127.0.0.1',
      open: false,
      port: 9123,
      runtimeVersion: 'test-version',
      serveWeb: false,
    }, {
      inspectExecutorReadiness: async () => ({ ok: true, report: executorReport }),
      resolveScope: () => projectScope,
      runInit: async () => 0,
      runServe: async (options) => {
        serveOptions = options
      },
      validateCapabilityProject: async () => passCapabilityReport,
      write: output.write,
    })

    expect(code).toBe(0)
    expect(serveOptions).toEqual({
      gateway: 'ws://127.0.0.1:9218/ws',
      gatewayReconnect: false,
      host: '127.0.0.1',
      open: false,
      port: 9123,
      runtimeVersion: 'test-version',
      serveWeb: false,
    })
    expect(output.lines.join('')).toContain('Status: WARN (non-blocking)')
    expect(output.lines.join('')).toContain('configured task executor: http/default')
    expect(output.lines.join('')).toContain('stage 5/5 serve')
  })
})
