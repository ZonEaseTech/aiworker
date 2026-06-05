// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TurnActionRail } from './turn-action-rail'

afterEach(() => cleanup())

describe('turn action rail', () => {
  it('renders quiet turn actions and invokes callbacks', () => {
    const onCopy = vi.fn()
    render(<TurnActionRail actions={[{ id: 'copy', label: 'Copy', onClick: onCopy }, { id: 'quote', label: 'Quote' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Quote' })).toBeTruthy()
  })

  it('renders safe href actions as links and disabled actions as disabled buttons', () => {
    render(<TurnActionRail actions={[{ href: 'https://example.test/source', id: 'source', label: 'Source' }, { disabled: true, id: 'quote', label: 'Quote' }]} />)

    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.test/source')
    expect((screen.getByRole('button', { name: 'Quote' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
