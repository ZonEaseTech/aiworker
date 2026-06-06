import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HostControlPlane, type HostAssignmentSummary } from './app'

const readyAssignment: HostAssignmentSummary = {
  assignedEmail: 'lin@example.com',
  serverRef: 'aissh://server/ap-sg-01',
  soulReleaseRef: 'freeform@2026.06.01',
  status: 'ready',
  workerId: 'worker-lin',
  workbenchUrl: 'https://worker.example.com/w/worker-lin',
}

describe('HostControlPlane', () => {
  it('does not render a micro-app or iframe and shows the control plane actions', () => {
    const { container } = render(<HostControlPlane assignments={[readyAssignment]} />)

    expect(container.querySelector('micro-app')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('heading', { name: 'AI Workers' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '开通 AI Worker' })).not.toBeNull()
  })

  it('shows ready assignment details and a Worker link', () => {
    render(<HostControlPlane assignments={[readyAssignment]} />)

    expect(screen.getByText('lin@example.com')).not.toBeNull()
    expect(screen.getByText('aissh://server/ap-sg-01')).not.toBeNull()
    expect(screen.getByText('freeform@2026.06.01')).not.toBeNull()
    expect(screen.getByText('已可用')).not.toBeNull()
    expect(screen.getByText('worker-lin')).not.toBeNull()

    const workerLink = screen.getByRole('link', { name: '打开 Worker' })
    expect(workerLink.getAttribute('href')).toBe('https://worker.example.com/w/worker-lin')
  })

  it('does not show a Worker link while provisioning', () => {
    const provisioningAssignment: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      serverRef: 'aissh://server/ap-sg-02',
      soulReleaseRef: 'support@2026.06.01',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }

    render(<HostControlPlane assignments={[provisioningAssignment]} />)

    expect(screen.getByText('mei@example.com')).not.toBeNull()
    expect(screen.getByText('开通中')).not.toBeNull()
    expect(screen.queryByRole('link', { name: '打开 Worker' })).toBeNull()
  })

  it('labels assignments that need attention or were revoked', () => {
    render(
      <HostControlPlane
        assignments={[
          { ...readyAssignment, assignedEmail: 'ops@example.com', status: 'needs_attention' },
          { ...readyAssignment, assignedEmail: 'old@example.com', status: 'revoked' },
        ]}
      />,
    )

    expect(screen.getByText('需处理')).not.toBeNull()
    expect(screen.getByText('已撤销')).not.toBeNull()
  })
})
