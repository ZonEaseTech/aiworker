import type { ExecutorProfile } from '@aiworker/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ExecutorSection } from './executor-section'

function Harness({
  initial,
  onChange,
}: {
  initial: ExecutorProfile
  onChange: (next: ExecutorProfile) => void
}) {
  const [profile, setProfile] = useState<ExecutorProfile>(initial)
  return (
    <ExecutorSection
      executor={profile}
      onChange={(next) => {
        setProfile(next)
        onChange(next)
      }}
    />
  )
}

/**
 * Find the input rendered immediately under a label whose visible text
 * matches `text`. Existing config-editor sections wrap `<Label>{name}</Label>`
 * + `<Input/>` in a single flex column without an `htmlFor` association,
 * so `getByLabelText` doesn't resolve. We mirror that DOM structure here.
 */
function inputForLabel(text: string | RegExp): HTMLInputElement {
  const labels = screen.getAllByText(text)
  for (const label of labels) {
    const container = label.closest('div')
    const input = container?.querySelector('input')
    if (input)
      return input as HTMLInputElement
  }
  throw new Error(`no input found for label ${text}`)
}

describe('executorSection (FEAT-014 picker)', () => {
  it('renders the engine + variant pickers seeded with the current profile', () => {
    const initial: ExecutorProfile = { engine: 'http', variant: 'default' }
    render(<Harness initial={initial} onChange={() => undefined} />)

    const engineSelect = screen.getByLabelText('Engine') as HTMLSelectElement
    const variantSelect = screen.getByLabelText('Variant') as HTMLSelectElement

    expect(engineSelect.value).toBe('http')
    expect(variantSelect.value).toBe('default')

    // Variant body fields render against the Zod schema.
    expect(screen.getByText('baseUrl')).toBeTruthy()
    expect(screen.getByText('model')).toBeTruthy()
    expect(screen.getByText('timeoutMs')).toBeTruthy()
  })

  it('switches engine, defaults the variant, and clears overrides', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default', overrides: { baseUrl: 'http://x' } }}
        onChange={p => captured.push(p)}
      />,
    )

    const engineSelect = screen.getByLabelText('Engine') as HTMLSelectElement
    fireEvent.change(engineSelect, { target: { value: 'claude-code' } })

    const last = captured.at(-1)!
    expect(last.engine).toBe('claude-code')
    expect(last.variant).toBe('default')
    // overrides cleared on engine switch (variant body shapes are heterogeneous)
    expect(last.overrides).toBeUndefined()
  })

  it('switches variant within an engine and clears overrides', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default', overrides: { baseUrl: 'http://stale' } }}
        onChange={p => captured.push(p)}
      />,
    )

    const variantSelect = screen.getByLabelText('Variant') as HTMLSelectElement
    fireEvent.change(variantSelect, { target: { value: 'deepseek' } })

    const last = captured.at(-1)!
    expect(last.engine).toBe('http')
    expect(last.variant).toBe('deepseek')
    expect(last.overrides).toBeUndefined()
  })

  it('emits override fields onto the saved profile', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={p => captured.push(p)}
      />,
    )

    const baseUrlInput = inputForLabel('baseUrl')
    fireEvent.change(baseUrlInput, { target: { value: 'https://api.example.com' } })

    const last = captured.at(-1)!
    expect(last.engine).toBe('http')
    expect((last.overrides as { baseUrl?: string } | undefined)?.baseUrl).toBe('https://api.example.com')
  })

  it('renders ACP variants keyed by agent name', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'acp', variant: 'gemini' }}
        onChange={p => captured.push(p)}
      />,
    )

    const variantSelect = screen.getByLabelText('Variant') as HTMLSelectElement
    expect(variantSelect.value).toBe('gemini')
    fireEvent.change(variantSelect, { target: { value: 'qwen' } })

    const last = captured.at(-1)!
    expect(last).toEqual({ engine: 'acp', variant: 'qwen' })
  })

  it('promotes per-request modelId via the Advanced panel', () => {
    const onChange = vi.fn<(p: ExecutorProfile) => void>()
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    const modelIdInput = inputForLabel(/^modelId/)
    fireEvent.change(modelIdInput, { target: { value: 'gpt-foo' } })

    const last = onChange.mock.calls.at(-1)![0]
    expect(last.modelId).toBe('gpt-foo')
  })
})
