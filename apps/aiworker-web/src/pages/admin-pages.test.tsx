import type { ReactElement } from 'react'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AssignmentDetailContent } from '@/components/assignment-detail-sheet'
import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { AuditCard } from '@/components/audit/audit-card'
import { BoundaryAlert } from '@/components/boundary-alert'
import { TooltipProvider } from '@/components/ui/tooltip'
import { adminConsoleData } from '@/lib/admin-data'
import { AssignmentsPage } from './assignments-page'
import { AuditPage } from './audit-page'
import { DashboardPage } from './dashboard-page'
import { EnvironmentsPage } from './environments-page'
import {
  ProvisioningPage,
  resolveAssignmentIdentityForTuple,
  resolveAssignmentSelectionState,
  resolvePreviewApprovalStatus,
} from './provisioning-page'
import { SoulsPage } from './souls-page'

describe('admin console page composition', () => {
  test('renders every admin route with its core heading', () => {
    const pages: Array<[string, ReactElement, string]> = [
      ['dashboard', <DashboardPage />, 'AIWorker 分发控制台'],
      ['assignments', <AssignmentsPage />, '员工 workspace 分配'],
      ['provisioning', <TooltipProvider><ProvisioningPage /></TooltipProvider>, '生成 assignment plan'],
      ['souls', <SoulsPage />, '版本化 workspace templates'],
      ['environments', <EnvironmentsPage />, '环境与 provider profile'],
      ['audit', <AuditPage />, '交付证据与审计'],
    ]

    for (const [name, page, heading] of pages) {
      const markup = renderToStaticMarkup(page)
      expect(markup, name).toContain(heading)
    }

    const dashboard = renderToStaticMarkup(<DashboardPage />)
    expect(dashboard).toContain('AIWorker 分发控制台')
    expect(dashboard).toContain('管理员引导')
    expect(dashboard).toContain('AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane')
    expect(dashboard).toContain('bun run dev')
    expect(dashboard).not.toContain('bun run dev:aiworker-web')
    expect(dashboard).toContain('本次会话使用')
    expect(dashboard).toContain('在本设备记住')
    expect(dashboard).toContain('admin-data 读取与会改变状态的 Web API 调用')
    expect(dashboard).toContain('Control-plane directory is not bound')
    expect(dashboard).toContain('待审批')

    const provisioning = renderToStaticMarkup(<TooltipProvider><ProvisioningPage /></TooltipProvider>)
    expect(provisioning).toContain('Approval gate')
    expect(provisioning).toContain('Assignment 标识')
    expect(provisioning).toContain('预览 trace 时间线')
    expect(provisioning).toContain('assignment snapshot')
    expect(provisioning).toContain('Fixture 预览模式')
    expect(provisioning).toContain('approvals.jsonl')
    expect(provisioning).toContain('预览批准')
    expect(provisioning).toContain('预览退回修改')
    expect(provisioning).toContain('执行已审批交付')
    expect(provisioning).toContain('生成配对链接')
    expect(provisioning).toContain('需要先完成审批')
    expect(provisioning).toContain('Provider needs target-side setup')
    expect(provisioning).toContain('配对前必须先完成 apply')
    expect(provisioning).toContain('只在当前页面显示')
    expect(provisioning).toContain('不会持久化')
    expect(provisioning).toContain('aiworker plan')
    expect(provisioning).not.toContain('apply --yes')

    const audit = renderToStaticMarkup(<AuditPage />)
    expect(audit).toContain('Trace 事件:')
    expect(audit).toContain('receipt')
  })

  test('provisioning approval controls stay preview-only and redacted', () => {
    const markup = renderToStaticMarkup(<TooltipProvider><ProvisioningPage /></TooltipProvider>)

    expect(markup).toContain('未配置 AIWORKER_CONTROL_PLANE_DIR')
    expect(markup).toContain('不会触发 aissh 或 Paseo')
    expect(markup).not.toContain('/api/sessions/')
    expect(markup).not.toContain('engine_invocation')
    expect(markup).not.toContain('offer=')
    expect(markup).not.toContain('sk-')
  })

  test('approval preview decisions are scoped by assignment id', () => {
    expect(resolvePreviewApprovalStatus('asn-1', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('approved')
    expect(resolvePreviewApprovalStatus('asn-2', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('changes_requested')
    expect(resolvePreviewApprovalStatus('asn-3', { 'asn-1': 'approved', 'asn-2': 'changes_requested' }, 'pending')).toBe('pending')
  })

  test('assignment identity selection is the source of truth for provisioning tuple selectors', () => {
    for (const assignment of adminConsoleData.assignments) {
      expect(resolveAssignmentSelectionState(assignment.id)).toEqual({
        assignmentId: assignment.id,
        environmentId: assignment.environmentId,
        providerProfileId: assignment.providerProfileId,
        soulReleaseId: assignment.soulReleaseId,
      })
    }

    const aliceAssignment = adminConsoleData.assignments.find(assignment => assignment.id === 'asn-alice-freeform')!

    expect(resolveAssignmentSelectionState('missing-assignment')).toBeUndefined()
    expect(resolveAssignmentIdentityForTuple(
      aliceAssignment.environmentId,
      aliceAssignment.soulReleaseId,
      aliceAssignment.providerProfileId,
    )).toBe(aliceAssignment.id)
    expect(resolveAssignmentIdentityForTuple(
      aliceAssignment.environmentId,
      aliceAssignment.soulReleaseId,
      'claude-ops',
    )).toBe('')
  })

  test('assignment detail sheet exposes approval and trace evidence without runtime data', () => {
    const markup = renderToStaticMarkup(
      <AssignmentDetailContent assignment={adminConsoleData.assignments[0]} />,
    )

    expect(markup).toContain('审批')
    expect(markup).toContain('预览 trace 时间线')
    expect(markup).toContain('Control API 尚未实现')
    expect(markup).toContain(`receipt:${adminConsoleData.assignments[0].receiptId}`)
    expect(markup).not.toContain('/api/sessions/')
    expect(markup).not.toContain('engine_invocation')
  })

  test('shared cards preserve the runtime boundary and assignment detail affordance', () => {
    expect(renderToStaticMarkup(<BoundaryAlert />)).toContain('归 Paseo 所有')
    expect(renderToStaticMarkup(<AuditCard />)).toContain('最近审计事件')
    expect(renderToStaticMarkup(<AssignmentTableCard title="Test ledger" assignments={adminConsoleData.assignments} />)).toContain('Assignment 生命周期')
  })
})
