import type {
  CreateHostAssignmentInput,
  HostApiClient,
  HostAssignmentSummary,
  HostOptionsSummary,
} from './host-api'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HostControlPlane } from './app'

const hostOptions: HostOptionsSummary = {
  access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
  auth: { mode: 'dev-static', status: 'deferred-logto' },
  servers: [{ host: '172.105.219.50', id: 'srv-1', name: 'aiwork', source: 'aissh' }],
  soulReleases: [{
    descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    id: 'aiworker-freeform',
    name: 'AIWorker Freeform',
    releaseRef: 'aiworker-freeform@dev',
    source: 'official',
  }],
}

const checkedInAssignment: HostAssignmentSummary = {
  assignedEmail: 'lin@example.com',
  assignmentId: 'asn_lin',
  serverRef: 'srv-1',
  soulReleaseRef: 'aiworker-freeform@dev',
  status: 'checked_in',
  workerId: 'worker-lin',
  workbenchUrl: null,
}

const readyAssignment: HostAssignmentSummary = {
  assignedEmail: 'mei@example.com',
  assignmentId: 'asn_mei',
  serverRef: 'srv-2',
  soulReleaseRef: 'support@2026.06.01',
  status: 'ready',
  workerId: 'worker-mei',
  workbenchUrl: 'https://worker.example.com/w/worker-mei',
}

function createApi(input: {
  createAssignment?: HostApiClient['createAssignment']
  getOptions?: HostApiClient['getOptions']
  listAssignments: HostApiClient['listAssignments']
}): HostApiClient {
  return {
    createAssignment: input.createAssignment ?? vi.fn(),
    getOptions: input.getOptions ?? vi.fn().mockResolvedValue(hostOptions),
    listAssignments: input.listAssignments,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function fillEmployeeEmail(email: string) {
  fireEvent.change(screen.getByLabelText('员工邮箱'), {
    target: { value: email },
  })
}

function submitCreateForm() {
  fireEvent.click(screen.getByRole('button', { name: '创建开通' }))
}

describe('host control plane', () => {
  it('renders the Phase 2 Host console shell with nav, list, and right drawer', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([checkedInAssignment]),
    })

    const { container } = render(<HostControlPlane api={api} />)

    expect(await screen.findByRole('heading', { name: 'AI Workers' })).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Host navigation' })).not.toBeNull()
    expect(screen.getByRole('complementary', { name: 'Worker assignment drawer' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: '开通 AI Worker' })).not.toBeNull()
    expect(screen.getAllByText('Logto 未接入').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Worker Access Tunnel 未接入').length).toBeGreaterThan(0)
    expect(await screen.findByText('lin@example.com')).not.toBeNull()
    expect(screen.getAllByText('Worker 已报到').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: '打开 Worker' })).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('micro-app')).toBeNull()
  })

  it('shows the empty state from the API shape', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    render(<HostControlPlane api={api} />)

    expect(await screen.findByText('暂无开通记录')).not.toBeNull()
  })

  it('uses Host options for server and Soul selection when creating an assignment', async () => {
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn().mockResolvedValue({
      aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
      assignment: createdAssignment,
      provisionCommand: 'bun aiworker provision --token awp_secret',
    })
    const listAssignments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdAssignment])
    const api = createApi({ createAssignment, listAssignments })

    render(<HostControlPlane api={api} />)

    expect((await screen.findAllByText(/aiwork/)).length).toBeGreaterThan(0)
    fillEmployeeEmail('mei@example.com')
    submitCreateForm()

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith({
        assignedEmail: 'mei@example.com',
        serverRef: 'srv-1',
        soulReleaseRef: 'aiworker-freeform@dev',
      } satisfies CreateHostAssignmentInput)
    })
    expect(await screen.findByText('mei@example.com')).not.toBeNull()
    expect(screen.getByText('Provision command')).not.toBeNull()
    expect(screen.getByText('aissh exec command')).not.toBeNull()
    expect(screen.getAllByText(/awp_secret/).length).toBeGreaterThan(0)
    expect(listAssignments).toHaveBeenCalledTimes(2)
  })

  it('clears one-time commands before a later create failure', async () => {
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn()
      .mockResolvedValueOnce({
        aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
        assignment: createdAssignment,
        provisionCommand: 'bun aiworker provision --token awp_secret',
      })
      .mockRejectedValueOnce(new Error('CREATE_FAILED'))
    const listAssignments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdAssignment])
    const api = createApi({ createAssignment, listAssignments })

    render(<HostControlPlane api={api} />)

    await screen.findAllByText(/aiwork/)
    fillEmployeeEmail('mei@example.com')
    submitCreateForm()

    expect((await screen.findAllByText(/awp_secret/)).length).toBeGreaterThan(0)

    fillEmployeeEmail('error@example.com')
    submitCreateForm()

    expect(await screen.findByText(/CREATE_FAILED/)).not.toBeNull()
    expect(screen.queryByText(/awp_secret/)).toBeNull()
    expect(screen.queryByText('Provision command')).toBeNull()
    expect(screen.queryByText('aissh exec command')).toBeNull()
  })

  it('keeps refreshed assignments when an older list request resolves late', async () => {
    const initialList = createDeferred<HostAssignmentSummary[]>()
    const refreshedList = createDeferred<HostAssignmentSummary[]>()
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn().mockResolvedValue({
      assignment: createdAssignment,
      provisionCommand: 'bun aiworker provision --token awp_secret',
    })
    const listAssignments = vi.fn()
      .mockReturnValueOnce(initialList.promise)
      .mockReturnValueOnce(refreshedList.promise)
    const api = createApi({ createAssignment, listAssignments })

    render(<HostControlPlane api={api} />)

    await screen.findAllByText(/aiwork/)
    fillEmployeeEmail('mei@example.com')
    submitCreateForm()

    await waitFor(() => {
      expect(listAssignments).toHaveBeenCalledTimes(2)
    })
    await act(async () => {
      refreshedList.resolve([createdAssignment])
      await refreshedList.promise
    })

    expect(await screen.findByText('mei@example.com')).not.toBeNull()

    await act(async () => {
      initialList.resolve([])
      await initialList.promise
    })

    expect(screen.getByText('mei@example.com')).not.toBeNull()
    expect(screen.queryByText('暂无开通记录')).toBeNull()
  })

  it('shows API errors and can retry list loading', async () => {
    const listAssignments = vi.fn()
      .mockRejectedValueOnce(new Error('FORBIDDEN'))
      .mockResolvedValueOnce([checkedInAssignment])
    const api = createApi({ listAssignments })

    render(<HostControlPlane api={api} />)

    expect(await screen.findByText(/FORBIDDEN/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('lin@example.com')).not.toBeNull()
    expect(listAssignments).toHaveBeenCalledTimes(2)
  })

  it('shows an open Worker link only for ready assignments', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([readyAssignment]),
    })

    render(<HostControlPlane api={api} />)

    expect(await screen.findByText('可打开 Worker')).not.toBeNull()
    const workerLink = screen.getByRole('link', { name: '打开 Worker' })
    expect(workerLink.getAttribute('href')).toBe('https://worker.example.com/w/worker-mei')
  })
})
