import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('shared ui globals', () => {
  it('defines a no-scrollbar utility that hides scrollbar chrome without removing scrolling', async () => {
    const css = await readFile(new URL('./globals.css', import.meta.url), 'utf8')

    expect(css).toContain('@utility no-scrollbar')
    expect(css).toContain('scrollbar-width: none')
    expect(css).toContain('-ms-overflow-style: none')
    expect(css).toContain('&::-webkit-scrollbar')
    expect(css).toContain('display: none')
  })
})
