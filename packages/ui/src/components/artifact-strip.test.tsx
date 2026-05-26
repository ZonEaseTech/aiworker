// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ArtifactStrip } from './artifact-strip'

afterEach(() => cleanup())

describe('artifact strip', () => {
  it('renders generic artifact references without nested cards', () => {
    const { container } = render(
      <ArtifactStrip
        artifacts={[
          {
            description: 'Browser evidence',
            href: '/evidence/screenshot.png',
            id: 'evidence',
            status: 'available',
            title: 'Screenshot',
          },
          { action: <button type="button">Open</button>, id: 'report', title: 'Report' },
        ]}
      />,
    )

    expect(screen.getByText('Screenshot')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Screenshot' }).getAttribute('href')).toBe('/evidence/screenshot.png')
    expect(screen.getByText('Browser evidence')).toBeTruthy()
    expect(screen.getByText('available')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(container.querySelector('[data-transcript-slot="artifact-strip"] [data-slot="card"] [data-slot="card"]')).toBeNull()
  })

  it('renders safe absolute and relative artifact links', () => {
    render(
      <ArtifactStrip
        artifacts={[
          { href: 'https://example.test/report', id: 'absolute', title: 'Absolute' },
          { href: 'report.md', id: 'file', title: 'File' },
          { href: '#section', id: 'hash', title: 'Hash' },
          { href: '../report.md', id: 'parent', title: 'Parent' },
        ]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Absolute' }).getAttribute('href')).toBe('https://example.test/report')
    expect(screen.getByRole('link', { name: 'File' }).getAttribute('href')).toBe('report.md')
    expect(screen.getByRole('link', { name: 'Hash' }).getAttribute('href')).toBe('#section')
    expect(screen.getByRole('link', { name: 'Parent' }).getAttribute('href')).toBe('../report.md')
  })

  it('renders unsafe artifact hrefs as plain title text', () => {
    render(
      <ArtifactStrip
        artifacts={[
          { href: 'javascript:alert(1)', id: 'unsafe', title: 'Unsafe' },
          { href: 'data:text/html,hello', id: 'data', title: 'Data' },
          { href: 'java\nscript:alert(1)', id: 'newline-script', title: 'Newline script' },
          { href: 'java\tscript:alert(1)', id: 'tab-script', title: 'Tab script' },
          { href: 'data\n:text/html,<svg>', id: 'newline-data', title: 'Newline data' },
        ]}
      />,
    )

    expect(screen.getByText('Unsafe')).toBeTruthy()
    expect(screen.getByText('Data')).toBeTruthy()
    expect(screen.getByText('Newline script')).toBeTruthy()
    expect(screen.getByText('Tab script')).toBeTruthy()
    expect(screen.getByText('Newline data')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Data' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Newline script' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Tab script' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Newline data' })).toBeNull()
  })

  it('returns null for empty artifact references', () => {
    const { container } = render(<ArtifactStrip artifacts={[]} />)

    expect(container.firstChild).toBeNull()
  })
})
