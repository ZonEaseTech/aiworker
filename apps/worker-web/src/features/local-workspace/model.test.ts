import { describe, expect, it } from 'vitest'
import { en } from '../i18n/locales'
import { projectNamePlaceholder } from './model'

describe('projectNamePlaceholder 不再按 soul id 分支', () => {
  it('任意 soul id 都返回 default 占位', () => {
    const def = en.create.projectPlaceholders.default
    expect(projectNamePlaceholder('custom-soul-alpha', en)).toBe(def)
    expect(projectNamePlaceholder('custom-soul-beta', en)).toBe(def)
    expect(projectNamePlaceholder('whatever-soul', en)).toBe(def)
  })
})
