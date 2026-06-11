import { afterEach, describe, expect, it } from 'bun:test'

import { resolveApiKey } from './executor'

// 切片 2 Phase 1（P1-T2a）：消除 BYOK apiKeyRef 写守卫（SECRET_REFERENCE_PREFIXES = $/env:/secretref:，
// worker-daemon settings.ts isSafeSecretReference）与运行时解析器 resolveApiKey 的前缀发散。
// 旧 bug：$NAME / secretref:NAME 通过写守卫，却在运行时被 resolveApiKey 当非法 NAME 抛误导性错误。

const TEST_ENV_KEY = 'AIWORKER_BYOK_TEST_KEY'

describe('resolveApiKey BYOK 前缀一致性', () => {
  afterEach(() => {
    delete process.env[TEST_ENV_KEY]
  })

  it('解析 env:NAME 形态', () => {
    process.env[TEST_ENV_KEY] = 'sk-from-env-prefix'
    expect(resolveApiKey(`env:${TEST_ENV_KEY}`)).toBe('sk-from-env-prefix')
  })

  it('解析 $NAME 形态（旧解析器不支持，写守卫却接受）', () => {
    process.env[TEST_ENV_KEY] = 'sk-from-dollar-prefix'
    expect(resolveApiKey(`$${TEST_ENV_KEY}`)).toBe('sk-from-dollar-prefix')
  })

  it('解析裸 NAME 形态（向后兼容）', () => {
    process.env[TEST_ENV_KEY] = 'sk-from-bare-name'
    expect(resolveApiKey(TEST_ENV_KEY)).toBe('sk-from-bare-name')
  })

  it('secretref: 诚实报「暂不支持」而非误导性 must-be-env 错误', () => {
    // secretref: 通过写守卫，但 v1 无 secret manager 后端 → 不能假装能解，须诚实失败。
    expect(() => resolveApiKey('secretref:VAULT_OPENAI')).toThrow(/secretref/)
    expect(() => resolveApiKey('secretref:VAULT_OPENAI')).not.toThrow(/must be env:NAME or NAME/)
  })

  it('空引用报错', () => {
    expect(() => resolveApiKey('   ')).toThrow(/requires an API key reference/)
  })

  it('环境变量未设置时诚实报缺失（不返回空）', () => {
    delete process.env[TEST_ENV_KEY]
    expect(() => resolveApiKey(`env:${TEST_ENV_KEY}`)).toThrow(/is not set/)
  })
})
