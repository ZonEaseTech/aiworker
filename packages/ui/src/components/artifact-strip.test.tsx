// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ArtifactStrip } from './artifact-strip'

afterEach(() => cleanup())

describe('ArtifactStrip', () => {
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

  it('returns null for empty artifact references', () => {
    const { container } = render(<ArtifactStrip artifacts={[]} />)

    expect(container.firstChild).toBeNull()
  })
})
