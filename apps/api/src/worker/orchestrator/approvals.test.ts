import { describe, expect, it } from 'bun:test'
import { ApprovalStore } from './approvals'

describe('ApprovalStore', () => {
  it('grant resolves the matching pending wait', async () => {
    const store = new ApprovalStore()
    const p = store.wait({ taskId: 't1', toolCallId: 'c1', toolName: 'Read', params: {}, timeoutMs: 5_000 })
    expect(store.size()).toBe(1)
    const granted = store.grant('t1', 'c1', 'allow')
    expect(granted).toBe(true)
    await expect(p).resolves.toBe('allow')
    expect(store.size()).toBe(0)
  })

  it('grant with deny resolves to deny', async () => {
    const store = new ApprovalStore()
    const p = store.wait({ taskId: 't1', toolCallId: 'c1', toolName: 'Read', params: {}, timeoutMs: 5_000 })
    store.grant('t1', 'c1', 'deny')
    await expect(p).resolves.toBe('deny')
  })

  it('grant returns false when key does not exist', () => {
    const store = new ApprovalStore()
    expect(store.grant('missing', 'missing', 'allow')).toBe(false)
  })

  it('timeout resolves to deny without explicit grant', async () => {
    const store = new ApprovalStore()
    const p = store.wait({ taskId: 't1', toolCallId: 'c1', toolName: 'Read', params: {}, timeoutMs: 20 })
    await expect(p).resolves.toBe('deny')
    expect(store.size()).toBe(0)
  })

  it('list reports pending entries with metadata', () => {
    const store = new ApprovalStore()
    void store.wait({ taskId: 't1', toolCallId: 'c1', toolName: 'Read', params: { path: '/etc/x' }, timeoutMs: 5_000 })
    void store.wait({ taskId: 't2', toolCallId: 'c2', toolName: 'Write', params: {}, timeoutMs: 5_000 })
    const pending = store.list()
    expect(pending).toHaveLength(2)
    const t1 = pending.find(p => p.taskId === 't1')!
    expect(t1.toolName).toBe('Read')
    expect(t1.params).toEqual({ path: '/etc/x' })
    expect(t1.expiresAt).toBeGreaterThan(Date.now())
    store.dispose()
  })

  it('dispose rejects all pending with deny and blocks future waits', async () => {
    const store = new ApprovalStore()
    const p1 = store.wait({ taskId: 't1', toolCallId: 'c1', toolName: 'Read', params: {}, timeoutMs: 60_000 })
    const p2 = store.wait({ taskId: 't1', toolCallId: 'c2', toolName: 'Write', params: {}, timeoutMs: 60_000 })
    store.dispose()
    await expect(p1).resolves.toBe('deny')
    await expect(p2).resolves.toBe('deny')
    expect(store.size()).toBe(0)
    await expect(store.wait({ taskId: 't1', toolCallId: 'c3', toolName: 'X', params: {}, timeoutMs: 50 }))
      .rejects
      .toMatchObject({ name: 'ApprovalDisposedError' })
  })
})
