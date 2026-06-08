import type {
  CreateHostAssignmentInput,
  HostApiClient,
  HostAssignmentSummary,
  HostOperator,
  HostOptionsSummary,
} from './host-api'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HostControlPlane } from './app'
import { HostApiError } from './host-api'

const adminOperator: HostOperator = {
  email: 'admin@example.com',
  roles: ['host:admin'],
  subject: 'usr_admin',
}

const hostOptions: HostOptionsSummary = {
  access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
  auth: { mode: 'dev-static', status: 'deferred-logto' },
  provisioningTargets: [
    {
      adapterType: 'aissh',
      capabilities: ['remote-delivery'],
      displayName: 'aiwork',
      health: 'ready',
      id: 'aissh:srv-1',
      maturity: 'production',
      ref: 'srv-1',
    },
    {
      adapterType: 'docker',
      capabilities: ['clean-container'],
      displayName: 'Docker 预发布环境',
      health: 'ready',
      id: 'docker:local-default',
      maturity: 'preview',
      ref: 'docker://local/default',
    },
    {
      adapterType: 'local',
      capabilities: ['local-process'],
      displayName: '本机开发环境',
      health: 'ready',
      id: 'local:default',
      maturity: 'dev',
      ref: 'local://default',
    },
  ],
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
  provisioningAdapterType: 'aissh',
  provisioningTargetMaturity: 'production',
  provisioningTargetRef: 'srv-1',
  serverRef: 'srv-1',
  soulReleaseRef: 'aiworker-freeform@dev',
  status: 'checked_in',
  workerId: 'worker-lin',
  workbenchUrl: null,
}

const readyAssignment: HostAssignmentSummary = {
  assignedEmail: 'mei@example.com',
  assignmentId: 'asn_mei',
  provisioningAdapterType: 'aissh',
  provisioningTargetMaturity: 'production',
  provisioningTargetRef: 'srv-2',
  serverRef: 'srv-2',
  soulReleaseRef: 'support@2026.06.01',
  status: 'ready',
  workerId: 'worker-mei',
  workbenchUrl: 'http://127.0.0.1:9217',
}

function createApi(input: {
  createAssignment?: HostApiClient['createAssignment']
  getOptions?: HostApiClient['getOptions']
  getOperator?: HostApiClient['getOperator']
  listAssignments: HostApiClient['listAssignments']
}): HostApiClient {
  return {
    createAssignment: input.createAssignment ?? vi.fn(),
    getOptions: input.getOptions ?? vi.fn().mockResolvedValue(hostOptions),
    getOperator: input.getOperator ?? vi.fn().mockResolvedValue(adminOperator),
    listAssignments: input.listAssignments,
  }
}

// Polling is disabled by default in tests so list-call counts stay deterministic.
function renderPlane(api: HostApiClient, props: { pollIntervalMs?: number } = {}) {
  return render(<HostControlPlane api={api} pollIntervalMs={props.pollIntervalMs ?? 0} />)
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

// The provisioning form now lives in an on-demand right drawer (Sheet) instead
// of a permanently pinned column. The header action opens it; the empty-state
// CTA shares the label, so target the first match (header) deterministically.
async function openCreateSheet() {
  const [headerAction] = screen.getAllByRole('button', { name: '开通 AI Worker' })
  if (!headerAction)
    throw new Error('open create action not found')
  fireEvent.click(headerAction)
  return screen.findByRole('dialog', { name: '开通 AI Worker' })
}

describe('host control plane', () => {
  it('renders the Phase 2 Host console shell with nav, list, and right drawer', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([checkedInAssignment]),
    })

    const { container } = renderPlane(api)

    expect(await screen.findByRole('heading', { name: 'AI Workers' })).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Host navigation' })).not.toBeNull()
    // The provisioning surface is an on-demand drawer (Sheet), closed by default —
    // no permanently pinned column sitting empty.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '开通 AI Worker' })).not.toBeNull()
    // Real-scenario wiring replaced the hardcoded "未接入" stubs: operator
    // identity now comes from /api/auth/me, and the worker-access summary is
    // derived live from assignment statuses.
    expect(await screen.findByText('admin@example.com')).not.toBeNull()
    expect(screen.queryByText('Logto 未接入')).toBeNull()
    expect(screen.queryByText('Worker Access Tunnel 未接入')).toBeNull()
    const accessSummary = screen.getByLabelText('Worker access summary')
    // Online is the headline metric; 连接中 is the muted sub-line.
    expect(accessSummary.textContent).toContain('在线')
    expect(within(accessSummary).getByText('0')).not.toBeNull()
    expect(accessSummary.textContent).toContain('连接中 1')
    expect(await screen.findByText('lin@example.com')).not.toBeNull()
    expect(screen.getAllByText('连接中').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: '打开 Worker' })).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('micro-app')).toBeNull()

    // The header action opens the provisioning drawer on demand.
    fireEvent.click(screen.getByRole('button', { name: '开通 AI Worker' }))
    expect(await screen.findByRole('dialog', { name: '开通 AI Worker' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: '开通 AI Worker' })).not.toBeNull()
  })

  it('shows the empty state from the API shape', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    expect(await screen.findByText('暂无开通记录')).not.toBeNull()
  })

  it('uses Host options for provisioning target and Soul selection when creating an assignment', async () => {
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      provisioningAdapterType: 'aissh',
      provisioningTargetMaturity: 'production',
      provisioningTargetRef: 'srv-1',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn().mockResolvedValue({
      assignment: createdAssignment,
      deliveryReceipt: {
        adapterType: 'aissh',
        command: 'aissh exec srv-1 "bun aiworker provision --token awp_[REDACTED]" --reason=test',
        targetRef: 'srv-1',
      },
      provisionCommand: 'bun aiworker provision --token awp_[REDACTED]',
      provisionToken: 'awp_secret',
    })
    const listAssignments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdAssignment])
    const api = createApi({ createAssignment, listAssignments })

    renderPlane(api)
    await openCreateSheet()

    expect((await screen.findAllByText(/aiwork/)).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('provisioning target')).not.toBeNull()
    expect(screen.queryByLabelText('aissh server')).toBeNull()
    // Only the selected target's maturity is surfaced, not a wall of every target.
    expect(screen.getByText('aissh · production')).not.toBeNull()
    fillEmployeeEmail('mei@example.com')
    submitCreateForm()

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith({
        assignedEmail: 'mei@example.com',
        provisioningTarget: {
          adapterType: 'aissh',
          maturity: 'production',
          ref: 'srv-1',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      } satisfies CreateHostAssignmentInput)
    })
    expect(await screen.findByText('mei@example.com')).not.toBeNull()
    expect(screen.getByText('Provision command')).not.toBeNull()
    expect(screen.getByText('Delivery command')).not.toBeNull()
    expect(screen.getByText('Provision token')).not.toBeNull()
    expect(screen.getAllByText(/awp_secret/).length).toBe(1)
    expect(listAssignments).toHaveBeenCalledTimes(2)
  })

  it('sends callback URL only for aissh provisioning targets', async () => {
    const createAssignment = vi.fn().mockResolvedValue({
      assignment: checkedInAssignment,
      deliveryReceipt: {
        adapterType: 'aissh',
        command: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
        targetRef: 'srv-1',
      },
      provisionCommand: 'bun aiworker provision --token awp_secret',
      provisionToken: 'awp_secret',
    })
    const api = createApi({
      createAssignment,
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)
    await openCreateSheet()

    expect(await screen.findByLabelText('Worker callback URL')).not.toBeNull()
    fireEvent.change(screen.getByLabelText('Worker callback URL'), {
      target: { value: 'https://host.example.com' },
    })
    fillEmployeeEmail('remote@example.com')
    submitCreateForm()

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({
        adapterRuntimeControlBaseUrl: 'https://host.example.com',
        provisioningTarget: expect.objectContaining({ adapterType: 'aissh' }),
      }))
    })

    // Success replaced the form; re-open it to provision the next worker.
    fireEvent.click(screen.getByRole('button', { name: '再开通一个' }))

    fireEvent.change(screen.getByLabelText('provisioning target'), {
      target: { value: 'local:default' },
    })
    expect(screen.queryByLabelText('Worker callback URL')).toBeNull()
    fillEmployeeEmail('local@example.com')
    submitCreateForm()

    await waitFor(() => {
      expect(createAssignment).toHaveBeenLastCalledWith({
        assignedEmail: 'local@example.com',
        provisioningTarget: {
          adapterType: 'local',
          maturity: 'dev',
          ref: 'local://default',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      } satisfies CreateHostAssignmentInput)
    })

    expect(screen.getAllByText(/awp_secret/).length).toBe(1)
    expect(screen.getByText('Provision token')).not.toBeNull()
    expect(screen.getByText('Provision command').parentElement?.textContent).not.toContain('awp_secret')
    expect(screen.getByText('Delivery command').parentElement?.textContent).not.toContain('awp_secret')
  })

  it('clears one-time commands before a later create failure', async () => {
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      provisioningAdapterType: 'aissh',
      provisioningTargetMaturity: 'production',
      provisioningTargetRef: 'srv-1',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn()
      .mockResolvedValueOnce({
        assignment: createdAssignment,
        deliveryReceipt: {
          adapterType: 'aissh',
          command: 'aissh exec srv-1 "bun aiworker provision --token awp_[REDACTED]" --reason=test',
          targetRef: 'srv-1',
        },
        provisionCommand: 'bun aiworker provision --token awp_[REDACTED]',
        provisionToken: 'awp_secret',
      })
      .mockRejectedValueOnce(new Error('CREATE_FAILED'))
    const listAssignments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdAssignment])
    const api = createApi({ createAssignment, listAssignments })

    renderPlane(api)
    await openCreateSheet()

    await screen.findAllByText(/aiwork/)
    fillEmployeeEmail('mei@example.com')
    submitCreateForm()

    expect((await screen.findAllByText(/awp_secret/)).length).toBeGreaterThan(0)

    // Success replaces the form; re-open it (clears the stale one-time token).
    fireEvent.click(screen.getByRole('button', { name: '再开通一个' }))

    fillEmployeeEmail('error@example.com')
    submitCreateForm()

    expect(await screen.findByText(/CREATE_FAILED/)).not.toBeNull()
    expect(screen.queryByText(/awp_secret/)).toBeNull()
    expect(screen.queryByText('Provision command')).toBeNull()
    expect(screen.queryByText('Delivery command')).toBeNull()
  })

  it('keeps refreshed assignments when an older list request resolves late', async () => {
    const initialList = createDeferred<HostAssignmentSummary[]>()
    const refreshedList = createDeferred<HostAssignmentSummary[]>()
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      provisioningAdapterType: 'aissh',
      provisioningTargetMaturity: 'production',
      provisioningTargetRef: 'srv-1',
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

    renderPlane(api)
    await openCreateSheet()

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

    renderPlane(api)

    expect(await screen.findByText(/FORBIDDEN/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('lin@example.com')).not.toBeNull()
    expect(listAssignments).toHaveBeenCalledTimes(2)
  })

  it('shows an open Worker link only for ready assignments', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([readyAssignment]),
    })

    renderPlane(api)

    expect(await screen.findByText('可访问')).not.toBeNull()
    const workerLink = screen.getByRole('link', { name: '打开 Worker' })
    expect(workerLink.getAttribute('href')).toBe('/workers/worker-mei')
    expect(workerLink.getAttribute('href')).not.toContain('127.0.0.1')
  })

  it('shows tunnel connection states in plain product language', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([
        { ...readyAssignment, assignmentId: 'asn_checked', status: 'checked_in', workerId: 'wkr_82', workbenchUrl: null },
        { ...readyAssignment, assignmentId: 'asn_attention', status: 'needs_attention', workerId: 'wkr_83', workbenchUrl: null },
      ]),
    })

    renderPlane(api)

    expect(await screen.findByText('连接中')).not.toBeNull()
    expect(screen.getByText('需处理')).not.toBeNull()
    expect(screen.queryByRole('link', { name: '打开 Worker' })).toBeNull()
  })

  it('offers a login link when the operator operator is unauthenticated', async () => {
    const api = createApi({
      getOperator: vi.fn().mockResolvedValue(null),
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    const loginLink = await screen.findByRole('link', { name: '登录' })
    expect(loginLink.getAttribute('href')).toBe('/auth/login?returnTo=/host')
    expect(screen.queryByText('退出登录')).toBeNull()
  })

  it('shows a logout control for an authenticated operator', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    expect(await screen.findByText('admin@example.com')).not.toBeNull()
    expect(screen.getByText('Host 管理员')).not.toBeNull()
    const logout = screen.getByRole('button', { name: '退出登录' })
    expect(logout.closest('form')?.getAttribute('action')).toBe('/auth/logout')
    expect(logout.closest('form')?.getAttribute('method')).toBe('post')
  })

  it('switches to the Souls panel and lists real Soul releases', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    await screen.findByRole('heading', { name: 'AI Workers' })
    fireEvent.click(screen.getByRole('button', { name: 'Souls' }))

    expect(await screen.findByLabelText('Soul releases list')).not.toBeNull()
    expect(screen.getByText('AIWorker Freeform')).not.toBeNull()
    expect(screen.getByText('aiworker-freeform@dev')).not.toBeNull()
    // The provisioning drawer belongs to AI Workers, not Souls, and its header
    // action is gone on this section.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '开通 AI Worker' })).toBeNull()
  })

  it('keeps planned nav sections but labels them honestly as TODO', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    await screen.findByRole('heading', { name: 'AI Workers' })
    fireEvent.click(screen.getByRole('button', { name: /Activity/ }))

    const activityPanel = await screen.findByLabelText('Activity panel')
    expect(within(activityPanel).getByText('规划中')).not.toBeNull()
    expect(within(activityPanel).getByText('此功能尚未接入后端，是后续阶段的 TODO。')).not.toBeNull()
    // The TODO marker is also present on the nav button itself, honestly.
    expect(screen.getByRole('button', { name: /Settings/ }).textContent).toContain('规划中')
  })

  it('opens and focuses the assignment drawer when the header action is clicked', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    await screen.findByRole('heading', { name: 'AI Workers' })
    // The empty state shares the 开通 AI Worker label, so click the header action.
    const [headerAction] = screen.getAllByRole('button', { name: '开通 AI Worker' })
    if (!headerAction)
      throw new Error('open create action not found')
    fireEvent.click(headerAction)

    expect(await screen.findByRole('dialog', { name: '开通 AI Worker' })).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('员工邮箱'))
  })

  it('surfaces Soul source errors from Host options', async () => {
    const api = createApi({
      getOptions: vi.fn().mockResolvedValue({ ...hostOptions, soulSourceErrors: ['Invalid Soul descriptor identity: hr-manager'] }),
      listAssignments: vi.fn().mockResolvedValue([]),
    })

    renderPlane(api)

    expect(await screen.findByText('Invalid Soul descriptor identity: hr-manager')).not.toBeNull()
  })

  it('prompts re-login when the assignments API returns 401', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockRejectedValue(new HostApiError({ code: 'UNAUTHENTICATED', status: 401 })),
    })

    renderPlane(api)

    const reloginLink = await screen.findByRole('link', { name: '重新登录' })
    expect(reloginLink.getAttribute('href')).toBe('/auth/login?returnTo=/host')
    expect(screen.getByText('登录已过期，请重新登录。')).not.toBeNull()
  })

  it('shows an admin-required message when the assignments API returns 403', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockRejectedValue(new HostApiError({ code: 'FORBIDDEN', status: 403 })),
    })

    renderPlane(api)

    expect(await screen.findByText('需要 Host 管理员账号才能访问。')).not.toBeNull()
  })

  it('polls assignments live on the configured interval', async () => {
    const listAssignments = vi.fn().mockResolvedValue([])
    const api = createApi({ listAssignments })

    renderPlane(api, { pollIntervalMs: 20 })

    await waitFor(() => {
      expect(listAssignments.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('keeps the re-login banner across poll ticks under a persistent 401', async () => {
    const listAssignments = vi.fn().mockRejectedValue(new HostApiError({ code: 'UNAUTHENTICATED', status: 401 }))
    const api = createApi({ listAssignments })

    renderPlane(api, { pollIntervalMs: 20 })

    // The initial foreground load surfaces the re-login banner.
    expect(await screen.findByRole('link', { name: '重新登录' })).not.toBeNull()

    // Let several silent poll ticks fire against the same persistent 401.
    await waitFor(() => {
      expect(listAssignments.mock.calls.length).toBeGreaterThanOrEqual(3)
    })

    // Silent polls must NOT wipe the standing banner.
    expect(screen.getByRole('link', { name: '重新登录' })).not.toBeNull()
    expect(screen.getByText('登录已过期，请重新登录。')).not.toBeNull()
  })

  it('drops the error banner once a poll recovers', async () => {
    const listAssignments = vi.fn()
      .mockRejectedValueOnce(new HostApiError({ code: 'UNAUTHENTICATED', status: 401 }))
      .mockResolvedValue([])
    const api = createApi({ listAssignments })

    renderPlane(api, { pollIntervalMs: 20 })

    expect(await screen.findByRole('link', { name: '重新登录' })).not.toBeNull()
    // A later successful poll clears the standing banner and shows the list state.
    expect(await screen.findByText('暂无开通记录')).not.toBeNull()
    expect(screen.queryByRole('link', { name: '重新登录' })).toBeNull()
  })
})
