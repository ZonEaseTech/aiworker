import { describe, expect, test } from 'vitest'
import { en } from '../i18n/locales'
import { projectNamePlaceholder } from './model'

describe('projectNamePlaceholder 不再按 soul id 分支', () => {
  test('任意 soul id 都返回 default 占位', () => {
    const def = en.create.projectPlaceholders.default
    expect(projectNamePlaceholder('aiworker-hr', en)).toBe(def)
    expect(projectNamePlaceholder('aiworker-qa', en)).toBe(def)
    expect(projectNamePlaceholder('whatever-soul', en)).toBe(def)
  })
})
