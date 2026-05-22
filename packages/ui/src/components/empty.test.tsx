// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Empty } from './empty'

afterEach(() => cleanup())

describe('shadcn empty', () => {
  it('uses the project radius scale instead of an oversized empty-state radius', () => {
    render(<Empty>Nothing here</Empty>)

    const empty = screen.getByText('Nothing here')
    expect(empty.getAttribute('data-slot')).toBe('empty')
    expect(empty.className).toContain('rounded-lg')
    expect(empty.className).not.toContain('rounded-xl')
  })
})
