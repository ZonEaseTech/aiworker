import type { VerticalSoul, WorkspaceCapability } from '../local-workspace/model-types'
import { describe, expect, it } from 'vitest'
import { displayCapability, displaySoul, formatStatus, messagesFor } from './index'

describe('displaySoul/displayCapability 泛化消费 manifest', () => {
  it('displaySoul 返回 descriptor identity 投影值，不暴露 Host domain 字段', () => {
    const soul: VerticalSoul = {
      id: 'aiworker-demo-source',
      name: 'Manifest Demo Name',
      description: 'Manifest desc',
      status: 'available',
      defaultCapabilities: [],
    }
    const copy = displaySoul(soul, 'en')
    expect(copy.name).toBe('Manifest Demo Name')
    expect(copy.description).toBe('Manifest desc')
    expect('domain' in copy).toBe(false)
  })

  it('displayCapability 返回 manifest 投影值且不暴露 Host 不消费的内部字段', () => {
    const capability: WorkspaceCapability = {
      id: 'aiworker-demo-source.context-capture',
      name: 'Manifest Capability',
      description: 'Manifest tdesc',
      soulId: 'aiworker-demo-source',
      outputKind: 'workspace-note',
      inputHints: ['a'],
      promptRef: './product/capabilities/context-capture/prompt.md',
    }
    const copy = displayCapability(capability, 'en')
    expect(copy.name).toBe('Manifest Capability')
    expect(copy.description).toBe('Manifest tdesc')
    expect('promptRef' in copy).toBe(false)
  })

  it('formatStatus 覆盖 engine invocation 状态而不是继承 turn 状态集合', () => {
    expect(messagesFor('en').statuses).toHaveProperty('starting')
    expect(messagesFor('en').statuses).toHaveProperty('lost')
    expect(formatStatus('starting', 'zh-CN')).toBe('启动中')
    expect(formatStatus('lost', 'zh-CN')).toBe('失联')
    expect(formatStatus('starting', 'ja')).toBe('開始中')
    expect(formatStatus('lost', 'ja')).toBe('ロスト')
    expect(formatStatus('starting', 'de')).toBe('Startet')
    expect(formatStatus('lost', 'de')).toBe('Verloren')
  })
})
