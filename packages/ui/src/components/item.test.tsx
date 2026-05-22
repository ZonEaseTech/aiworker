// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Item, ItemDescription, ItemGroup, ItemTitle } from './item'

afterEach(() => cleanup())

describe('shadcn item', () => {
  it('keeps the default item surface visually thin', () => {
    render(<Item>Profile section</Item>)

    const item = screen.getByText('Profile section')
    expect(item.getAttribute('data-slot')).toBe('item')
    expect(item.className).not.toContain('cursor-pointer')
    expect(item.className).not.toMatch(/\bborder\b/)
    expect(item.className).not.toContain('border-transparent')
  })

  it('keeps an explicit outline variant available for framed rows', () => {
    render(<Item variant="outline">Outlined row</Item>)

    const item = screen.getByText('Outlined row')
    expect(item.className).toContain('border')
    expect(item.className).toContain('border-border')
  })

  it('keeps title scale and description tone in the shadcn item primitive', () => {
    render(
      <Item>
        <ItemTitle size="base">Readable title</ItemTitle>
        <ItemDescription tone="destructive">Problem detail</ItemDescription>
      </Item>,
    )

    const title = screen.getByText('Readable title')
    expect(title.getAttribute('data-size')).toBe('base')
    expect(title.className).toContain('text-base')
    const description = screen.getByText('Problem detail')
    expect(description.getAttribute('data-tone')).toBe('destructive')
    expect(description.className).toContain('text-destructive')
  })

  it('can render an item group through a semantic shell element', () => {
    render(
      <ItemGroup asChild role="region" className="gap-0">
        <section aria-label="Workbench surface">Content</section>
      </ItemGroup>,
    )

    const region = screen.getByRole('region', { name: 'Workbench surface' })
    expect(region.getAttribute('data-slot')).toBe('item-group')
    expect(region.className).toContain('gap-0')
  })
})
