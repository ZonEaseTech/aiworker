import type { AssignmentSummary } from '@/lib/admin-data'
import { EyeIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { AssignmentDetailSheet } from '@/components/assignment-detail-sheet'
import { CreateAssignmentSheet } from '@/components/forms/create-assignment-sheet'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getEnvironment, getSoulRelease, statusMeta } from '@/lib/admin-data'

export function AssignmentTableCard({ title, assignments }: { title: string, assignments: AssignmentSummary[] }) {
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSummary | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function openAssignment(assignment: AssignmentSummary) {
    setSelectedAssignment(assignment)
    setSheetOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>先看员工、下一步和状态；支持排查信息在详情里展开。</CardDescription>
        <CardAction>
          <StatusBadge tone={assignments.some(assignment => assignment.status === 'needs_attention') ? 'warning' : 'info'}>
            {assignments.length}
            {' '}
            人
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">员工</TableHead>
              <TableHead>下一步</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((assignment) => {
              const soul = getSoulRelease(assignment.soulReleaseId)
              const environment = getEnvironment(assignment.environmentId)
              const status = statusMeta[assignment.status]
              return (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="font-medium">{assignment.assignedEmail}</div>
                    <div className="text-[0.625rem] text-muted-foreground">
                      {assignment.team}
                      {' '}
                      ·
                      {' '}
                      {soul.displayName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[18rem] text-xs/relaxed">{assignment.nextStep}</div>
                    <div className="mt-1 truncate text-[0.625rem] text-muted-foreground">
                      设备：
                      {environment.ownerEmail === assignment.assignedEmail ? '员工本人' : `${environment.ownerEmail} 代管`}
                      {' '}
                      ·
                      {' '}
                      {assignment.updatedAt}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge tone={status.tone}>{status.label}</StatusBadge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openAssignment(assignment)}>
                        <EyeIcon data-icon="inline-start" weight="duotone" />
                        查看
                      </Button>
                      <CreateAssignmentSheet editTarget={assignment} />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <AssignmentDetailSheet assignment={selectedAssignment} open={sheetOpen} onOpenChange={setSheetOpen} />
      </CardContent>
    </Card>
  )
}
