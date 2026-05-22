// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Tabs, TabsList, TabsTrigger } from './tabs'

afterEach(() => cleanup())

describe('shadcn tabs', () => {
  it('keeps vertical triggers content-sized while global CSS owns pointer cursors', () => {
    render(
      <Tabs orientation="vertical" defaultValue="execution">
        <TabsList>
          <TabsTrigger value="execution">Execution</TabsTrigger>
        </TabsList>
      </Tabs>,
    )

    const trigger = screen.getByRole('tab', { name: 'Execution' })
    expect(trigger.className).toContain('group-data-vertical/tabs:flex-none')
    expect(trigger.className).toContain('group-data-horizontal/tabs:flex-1')
    expect(trigger.className).not.toContain('cursor-pointer')
    expect(trigger.className).not.toMatch(/(?:^|\s)flex-1(?:\s|$)/)
  })
})
