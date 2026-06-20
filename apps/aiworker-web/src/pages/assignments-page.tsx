import type { AssignmentStatus } from '@/lib/admin-data'
import { useMemo, useState } from 'react'

import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { CreateAssignmentSheet } from '@/components/forms/create-assignment-sheet'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getEnvironment, getSoulRelease, statusMeta } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

const assignmentStatusOptions: Array<AssignmentStatus | 'all'> = [
  'all',
  'draft',
  'provisioning',
  'workspace_projected',
  'handoff_ready',
  'ready',
  'needs_attention',
]

export function AssignmentsPage() {
  const { data } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AssignmentStatus | 'all'>('all')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return data.assignments.filter((assignment) => {
      if (status !== 'all' && assignment.status !== status) {
        return false
      }

      if (!normalized) {
        return true
      }

      return [
        assignment.assignedEmail,
        assignment.team,
        assignment.workspaceRef,
        getSoulRelease(assignment.soulReleaseId, data).displayName,
        getEnvironment(assignment.environmentId, data).targetRef,
      ].some(value => value.toLowerCase().includes(normalized))
    })
  }, [data, query, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="员工开通"
        title="员工开通记录"
        description="查看每位员工是否已经能使用 AIWorker、下一步要处理什么，以及是否需要管理员介入。"
        actions={<CreateAssignmentSheet />}
      />
      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按员工、团队、能力或设备负责人搜索。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
            <Field>
              <FieldLabel htmlFor="assignment-search">关键词</FieldLabel>
              <Input
                id="assignment-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="alice@example.com / 财务 / AIWorker Freeform"
              />
            </Field>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select value={status} onValueChange={value => setStatus(value as AssignmentStatus | 'all')}>
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {assignmentStatusOptions.map(option => (
                      <SelectItem key={option} value={option}>
                        {option === 'all' ? '全部状态' : statusMeta[option].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {filtered.length
        ? (
            <AssignmentTableCard title="全部员工" assignments={filtered} />
          )
        : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>没有匹配结果</EmptyTitle>
                <EmptyDescription>调整筛选条件，或回到总览为员工准备开通。</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setStatus('all')
                  }}
                >
                  清空筛选
                </Button>
              </EmptyContent>
            </Empty>
          )}
    </div>
  )
}
