// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dialog, Field, Input, Select, Switch, Textarea } from '.'

afterEach(() => cleanup())

describe('shared primitives', () => {
  it('renders input and textarea invalid state', () => {
    render(
      <>
        <Input aria-label="Name" invalid />
        <Textarea aria-label="Notes" invalid />
      </>,
    )

    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Notes').getAttribute('aria-invalid')).toBe('true')
  })

  it('renders field description and validation error slots', () => {
    render(
      <Field label="Display name" htmlFor="display-name" description="Shown in the shell" error="Required">
        <Input id="display-name" />
      </Field>,
    )

    expect(screen.getByLabelText('Display name').id).toBe('display-name')
    expect(screen.getByText('Shown in the shell')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Required')
  })

  it('opens and closes dialog with an accessible title', () => {
    const onClose = vi.fn()

    render(
      <Dialog open closeLabel="Close" onClose={onClose} title="Settings" titleId="settings-title">
        Body
      </Dialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('changes select value', () => {
    const onChange = vi.fn()

    render(
      <Select
        ariaLabel="Mode"
        label="Mode"
        value="a"
        onChange={onChange}
        options={[
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Mode' }))
    fireEvent.click(screen.getByRole('option', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('toggles switch', () => {
    const onCheckedChange = vi.fn()

    render(<Switch label="Enabled" onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
