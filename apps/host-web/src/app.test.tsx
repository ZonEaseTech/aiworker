import type { CreateHostAssignmentInput, HostApiClient, HostAssignmentSummary } from './host-api'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HostControlPlane } from './app'

const checkedInAssignment: HostAssignmentSummary = {
  assignedEmail: 'lin@example.com',
  assignmentId: 'asn_lin',
  serverRef: 'aissh://server/ap-sg-01',
  soulReleaseRef: 'freeform@2026.06.01',
  status: 'checked_in',
  workerId: 'worker-lin',
  workbenchUrl: null,
}

const readyAssignment: HostAssignmentSummary = {
  assignedEmail: 'mei@example.com',
  assignmentId: 'asn_mei',
  serverRef: 'aissh://server/ap-sg-02',
  soulReleaseRef: 'support@2026.06.01',
  status: 'ready',
  workerId: 'worker-mei',
  workbenchUrl: 'https://worker.example.com/w/worker-mei',
}

function createApi(input: {
  createAssignment?: HostApiClient['createAssignment']
  listAssignments: HostApiClient['listAssignments']
}): HostApiClient {
  return {
    createAssignment: input.createAssignment ?? vi.fn(),
    listAssignments: input.listAssignments,
  }
}

describe('host control plane', () => {
  it('loads assignments from Host API and avoids mounted Worker UI', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([checkedInAssignment]),
    })

    const { container } = render(<HostControlPlane api={api} />)

    expect(await screen.findByText('lin@example.com')).not.toBeNull()
    expect(screen.getByText('Worker 已报到')).not.toBeNull()
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

  it('creates assignment, refreshes list, and shows the one-time provision command', async () => {
    const createdAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      serverRef: 'aissh://server/ap-sg-03',
      soulReleaseRef: 'freeform@2026.06.02',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const createAssignment = vi.fn().mockResolvedValue({
      assignment: createdAssignment,
      provisionCommand: 'bun aiworker provision --token awp_secret',
    })
    const listAssignments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdAssignment])
    const api = createApi({ createAssignment, listAssignments })

    render(<HostControlPlane api={api} />)

    fireEvent.change(screen.getByLabelText('员工邮箱'), {
      target: { value: 'mei@example.com' },
    })
    fireEvent.change(screen.getByLabelText('aissh server'), {
      target: { value: 'aissh://server/ap-sg-03' },
    })
    fireEvent.change(screen.getByLabelText('Soul release'), {
      target: { value: 'freeform@2026.06.02' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建 assignment' }))

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith({
        assignedEmail: 'mei@example.com',
        serverRef: 'aissh://server/ap-sg-03',
        soulReleaseRef: 'freeform@2026.06.02',
      } satisfies CreateHostAssignmentInput)
    })
    expect(await screen.findByText('mei@example.com')).not.toBeNull()
    expect(screen.getByText(/awp_secret/)).not.toBeNull()
    expect(screen.getByText('token 只显示一次')).not.toBeNull()
    expect(listAssignments).toHaveBeenCalledTimes(2)
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

  it('shows an open Worker link for ready assignments', async () => {
    const api = createApi({
      listAssignments: vi.fn().mockResolvedValue([readyAssignment]),
    })

    render(<HostControlPlane api={api} />)

    expect(await screen.findByText('可打开 Worker')).not.toBeNull()
    const workerLink = screen.getByRole('link', { name: '打开 Worker' })
    expect(workerLink.getAttribute('href')).toBe('https://worker.example.com/w/worker-mei')
  })
})
