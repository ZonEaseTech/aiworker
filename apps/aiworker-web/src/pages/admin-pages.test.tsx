import type { ReactElement } from 'react'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { adminConsoleData } from '@/lib/admin-data'
import { AssignmentsPage } from './assignments-page'
import { AuditPage } from './audit-page'
import { DashboardPage } from './dashboard-page'
import { EnvironmentsPage } from './environments-page'
import { ProvisioningPage } from './provisioning-page'
import { SoulsPage } from './souls-page'

describe('admin console page composition', () => {
  test('renders every admin route with its core heading', () => {
    const pages: Array<[string, ReactElement, string]> = [
      ['dashboard', <DashboardPage />, 'AIWorker 分发控制台'],
      ['assignments', <AssignmentsPage />, '员工 workspace 分配'],
      ['provisioning', <ProvisioningPage />, '生成 assignment plan'],
      ['souls', <SoulsPage />, '版本化 workspace templates'],
      ['environments', <EnvironmentsPage />, '环境与 provider profile'],
      ['audit', <AuditPage />, '交付证据与审计'],
    ]

    for (const [name, page, heading] of pages) {
      const markup = renderToStaticMarkup(page)
      expect(markup, name).toContain(heading)
    }

    expect(renderToStaticMarkup(<DashboardPage />)).toContain('AIWorker 分发控制台')
  })

  test('shared cards preserve the runtime boundary and assignment detail affordance', () => {
    expect(renderToStaticMarkup(<BoundaryAlert />)).toContain('Paseo owns workspace UI')
    expect(renderToStaticMarkup(<AuditCard />)).toContain('Recent audit events')
    expect(renderToStaticMarkup(<AssignmentTableCard title="Test ledger" assignments={adminConsoleData.assignments} />)).toContain('Assignment lifecycle follows')
  })
})
