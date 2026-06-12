// T2.1-extract 单元守卫 — deriveByokExecutionMetadata
// 一个 builder，一个 shape 断言。非两个独立实现的对比测试。
// TDD: RED 先行 — 函数尚不存在时此测试 fail，实现后 GREEN。

import type { LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import { describe, expect, it } from 'bun:test'

import { deriveByokExecutionMetadata } from './settings'

function makeByokSettings(overrides: Partial<LocalSettingsConfig['byok']> = {}): LocalSettingsConfig {
  return {
    appearance: 'system',
    byok: {
      apiKeyRef: 'env:DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      provider: 'openai-compatible',
      ...overrides,
    },
    connectors: [],
    engineId: 'codex',
    engines: [],
    executionMode: 'byok',
    externalMcpServers: [],
    language: 'en',
    localMcpServer: { enabled: false, url: 'http://127.0.0.1:4319/mcp' },
    updatedAt: '2026-06-12T00:00:00.000Z',
  } as unknown as LocalSettingsConfig
}

describe('deriveByokExecutionMetadata', () => {
  it('T2.1 shape: 输出包含 byok 块、engineId=provider、executionMode=byok、engineCommand/engineName 为 null', () => {
    const settings = makeByokSettings()
    const meta = deriveByokExecutionMetadata(settings)

    expect(meta.executionMode).toBe('byok')
    expect(meta.engineId).toBe(settings.byok.provider)
    expect(meta.engineCommand).toBeNull()
    expect(meta.engineName).toBeNull()
    expect(meta.byok).toEqual(settings.byok)
  })

  it('T2.1: 不同 provider 时 engineId 跟随 byok.provider', () => {
    const settings = makeByokSettings({ provider: 'azure-openai' })
    const meta = deriveByokExecutionMetadata(settings)

    expect(meta.engineId).toBe('azure-openai')
    expect(meta.executionMode).toBe('byok')
  })

  it('T2.1: byok 块原样透传（secret ref 不展开）', () => {
    const settings = makeByokSettings({ apiKeyRef: 'env:MY_SECRET_KEY' })
    const meta = deriveByokExecutionMetadata(settings)

    // 透传引用字符串，不展开 → secret 不进入 metadata
    expect((meta.byok as typeof settings.byok).apiKeyRef).toBe('env:MY_SECRET_KEY')
  })
})
