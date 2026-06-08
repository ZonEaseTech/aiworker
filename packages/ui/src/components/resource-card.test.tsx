// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ResourceCard } from './resource-card'

afterEach(() => cleanup())

describe('resource card', () => {
  it('renders a typed web resource with location, status and open action', () => {
    render(
      <ResourceCard
        resource={{
          href: 'http://localhost:54393',
          id: 'resource-1',
          kind: 'web',
          location: 'localhost:54393',
          status: 'available',
          title: '网页预览',
        }}
      />,
    )

    expect(screen.getByText('网页预览')).toBeTruthy()
    expect(screen.getByText('网站')).toBeTruthy()
    expect(screen.getByText('localhost:54393')).toBeTruthy()
    expect(screen.getByText('available')).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开 网页预览' }).getAttribute('href')).toBe('http://localhost:54393')
  })

  it('renders unsafe hrefs as text without an open link', () => {
    render(
      <ResourceCard
        resource={{
          href: 'javascript:alert(1)',
          id: 'resource-1',
          kind: 'document',
          title: 'Unsafe doc',
        }}
      />,
    )

    expect(screen.getByText('Unsafe doc')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '打开 Unsafe doc' })).toBeNull()
  })
})
