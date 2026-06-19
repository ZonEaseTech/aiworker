import type { AssignmentStatus } from '@/lib/admin-data'
import { useMemo, useState } from 'react'

import { AssignmentTableCard } from '@/components/assignments/assignment-table-card'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminConsoleData, getEnvironment, getSoulRelease, statusMeta } from '@/lib/admin-data'

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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AssignmentStatus | 'all'>('all')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return adminConsoleData.assignments.filter((assignment) => {
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
        getSoulRelease(assignment.soulReleaseId).displayName,
        getEnvironment(assignment.environmentId).targetRef,
      ].some(value => value.toLowerCase().includes(normalized))
    })
  }, [query, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Assignments"
        title="员工 workspace 分配"
        description="查看 assignment lifecycle、workspace ref、provider profile 和 redacted handoff。这里只管理元数据，不进入 Paseo workspace。"
      />
      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按员工、团队、workspace、Soul 或 target 搜索。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
            <Field>
              <FieldLabel htmlFor="assignment-search">关键词</FieldLabel>
              <Input
                id="assignment-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="alice@example.com / finance / workspace"
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
            <AssignmentTableCard title="Assignment 列表" assignments={filtered} />
          )
        : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>没有匹配结果</EmptyTitle>
                <EmptyDescription>调整筛选条件，或从 Provisioning 创建新的 assignment plan。</EmptyDescription>
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
