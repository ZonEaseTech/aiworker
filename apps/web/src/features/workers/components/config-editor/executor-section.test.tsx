import type { EngineAvailabilityResponse, ExecutorProfile } from '@aiworker/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutorSection } from './executor-section'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function Harness({
  initial,
  onChange,
  workerId,
}: {
  initial: ExecutorProfile
  onChange: (next: ExecutorProfile) => void
  workerId?: string
}) {
  const [profile, setProfile] = useState<ExecutorProfile>(initial)
  return (
    <QueryClientProvider client={makeClient()}>
      <ExecutorSection
        executor={profile}
        onChange={(next) => {
          setProfile(next)
          onChange(next)
        }}
        workerId={workerId}
      />
    </QueryClientProvider>
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

/** Stub `/api/workers/:id/proxy/worker/engines` for tests that mount with workerId. */
function stubEnginesFetch(response: EngineAvailabilityResponse) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/proxy/worker/engines')) {
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  })
  globalThis.fetch = mock as unknown as typeof fetch
  return mock
}

let originalFetch: typeof fetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

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

  it('exposes codex and cursor engines in the picker (FEAT-016)', () => {
    render(<Harness initial={{ engine: 'http', variant: 'default' }} onChange={() => undefined} />)

    const engineSelect = screen.getByLabelText('Engine') as HTMLSelectElement
    const options = Array.from(engineSelect.querySelectorAll('option')).map(o => o.value)
    expect(options).toContain('codex')
    expect(options).toContain('cursor')
  })

  it('switches to codex engine and renders its variant body fields (FEAT-016)', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={p => captured.push(p)}
      />,
    )

    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'codex' } })
    expect(captured.at(-1)).toEqual({ engine: 'codex', variant: 'default' })

    // Codex schema marks both fields as optional → labels render with the
    // `(optional)` suffix the form mapper injects.
    expect(screen.getByText('model (optional)')).toBeTruthy()
    expect(screen.getByText('timeoutMs (optional)')).toBeTruthy()
  })

  it('switches to cursor engine and persists model override (FEAT-016)', () => {
    const captured: ExecutorProfile[] = []
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={p => captured.push(p)}
      />,
    )

    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'cursor' } })
    expect(captured.at(-1)).toEqual({ engine: 'cursor', variant: 'default' })

    const modelInput = inputForLabel('model (optional)')
    fireEvent.change(modelInput, { target: { value: 'gpt-5' } })

    const last = captured.at(-1)!
    expect(last.engine).toBe('cursor')
    expect((last.overrides as { model?: string } | undefined)?.model).toBe('gpt-5')
  })
})

describe('executorSection (FEAT-018 availability badges)', () => {
  it('renders three-state badges for each EngineKind when workerId is passed', async () => {
    stubEnginesFetch({
      engines: [
        { kind: 'http', status: 'ready', checkedAt: 'now', authHint: 'no-cli-required' },
        { kind: 'mcp', status: 'ready', checkedAt: 'now', authHint: 'no-cli-required' },
        { kind: 'cli', status: 'ready', checkedAt: 'now', authHint: 'no-cli-required' },
        { kind: 'claude-code', status: 'ready', checkedAt: 'now', binaryPath: '/usr/bin/claude', authHint: 'auth-file-present' },
        { kind: 'codex', status: 'login-required', checkedAt: 'now', binaryPath: '/usr/bin/codex', authHint: 'auth-file-missing' },
        { kind: 'cursor', status: 'not-found', checkedAt: 'now', authHint: 'binary-not-on-path' },
        { kind: 'acp', agent: 'gemini', status: 'ready', checkedAt: 'now', binaryPath: '/usr/bin/gemini', authHint: 'auth-file-present' },
        { kind: 'acp', agent: 'qwen', status: 'login-required', checkedAt: 'now', binaryPath: '/usr/bin/qwen', authHint: 'auth-file-missing' },
      ],
    })

    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={() => undefined}
        workerId="w_abc"
      />,
    )

    // The availability row is only rendered once the query returns data, so
    // waiting for the claude-code badge to get its `data-status` attribute is
    // enough to gate the rest of the assertions on the loaded state.
    await waitFor(() => {
      const b = screen.getByTestId('engine-availability-badge-claude-code')
      expect(b.getAttribute('data-status')).toBe('ready')
    })
    expect(screen.getByTestId('engine-availability-badge-codex').getAttribute('data-status')).toBe('login-required')
    expect(screen.getByTestId('engine-availability-badge-cursor').getAttribute('data-status')).toBe('not-found')
    // acp aggregates to ready because at least one agent (gemini) is ready.
    expect(screen.getByTestId('engine-availability-badge-acp').getAttribute('data-status')).toBe('ready')
  })

  it('shows install callout when the selected engine is not installed', async () => {
    stubEnginesFetch({
      engines: [
        { kind: 'cursor', status: 'not-found', checkedAt: 'now', authHint: 'binary-not-on-path' },
      ],
    })

    render(
      <Harness
        initial={{ engine: 'cursor', variant: 'default' }}
        onChange={() => undefined}
        workerId="w_abc"
      />,
    )

    const callout = await screen.findByTestId('engine-install-callout')
    expect(callout).toBeTruthy()
    const link = callout.querySelector('a')
    expect(link?.getAttribute('href')).toContain('#cursor')
  })

  it('shows login callout when the CLI is installed but auth is missing', async () => {
    stubEnginesFetch({
      engines: [
        { kind: 'claude-code', status: 'login-required', checkedAt: 'now', binaryPath: '/usr/bin/claude', authHint: 'auth-file-missing' },
      ],
    })

    render(
      <Harness
        initial={{ engine: 'claude-code', variant: 'default' }}
        onChange={() => undefined}
        workerId="w_abc"
      />,
    )

    const callout = await screen.findByTestId('engine-login-callout')
    expect(callout).toBeTruthy()
  })

  it('refresh button triggers a refetch with ?refresh=1', async () => {
    const fetchSpy = stubEnginesFetch({
      engines: [
        { kind: 'claude-code', status: 'login-required', checkedAt: 'now', binaryPath: '/usr/bin/claude', authHint: 'auth-file-missing' },
      ],
    })

    render(
      <Harness
        initial={{ engine: 'claude-code', variant: 'default' }}
        onChange={() => undefined}
        workerId="w_abc"
      />,
    )

    // Wait for the initial fetch (no `refresh=1`) to land and the login callout
    // to render — that proves the query resolved before we click Refresh.
    await screen.findByTestId('engine-login-callout')
    const initialCalls = fetchSpy.mock.calls.length
    expect(initialCalls).toBeGreaterThanOrEqual(1)
    const firstUrl = fetchSpy.mock.calls[0]![0]
    expect(String(firstUrl)).not.toContain('refresh=1')

    const refreshBtn = await screen.findByTestId('refresh-engines-btn')
    fireEvent.click(refreshBtn)

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls))
    const refreshCall = fetchSpy.mock.calls
      .slice(initialCalls)
      .find(c => String(c[0]).includes('refresh=1'))
    expect(refreshCall).toBeDefined()
  })

  it('does not render availability row or refresh button when workerId is missing', () => {
    render(
      <Harness
        initial={{ engine: 'http', variant: 'default' }}
        onChange={() => undefined}
      />,
    )
    expect(screen.queryByTestId('refresh-engines-btn')).toBeNull()
    expect(screen.queryByTestId('engine-availability-http')).toBeNull()
  })

  it('renders the acp variant selected badge for each agent', async () => {
    stubEnginesFetch({
      engines: [
        { kind: 'acp', agent: 'gemini', status: 'ready', checkedAt: 'now', binaryPath: '/x', authHint: 'auth-file-present' },
        { kind: 'acp', agent: 'qwen', status: 'not-found', checkedAt: 'now', authHint: 'binary-not-on-path' },
      ],
    })

    render(
      <Harness
        initial={{ engine: 'acp', variant: 'gemini' }}
        onChange={() => undefined}
        workerId="w_abc"
      />,
    )

    await waitFor(() => {
      const badge = screen.getByTestId('variant-selected-badge')
      expect(badge.getAttribute('data-status')).toBe('ready')
    })

    const variantSelect = screen.getByLabelText('Variant') as HTMLSelectElement
    fireEvent.change(variantSelect, { target: { value: 'qwen' } })

    await waitFor(() => {
      const b2 = screen.getByTestId('variant-selected-badge')
      expect(b2.getAttribute('data-status')).toBe('not-found')
    })
  })
})
