import type { AssignmentSummary } from '@/lib/admin-data'
import { EyeIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { AssignmentDetailSheet } from '@/components/assignment-detail-sheet'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
        <CardDescription>Assignment lifecycle follows draft → provisioning → projected → handoff → ready.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Soul</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Detail</TableHead>
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
                    <div className="text-[0.625rem] text-muted-foreground">{assignment.team}</div>
                  </TableCell>
                  <TableCell>{soul.displayName}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{environment.id}</div>
                    <div className="text-[0.625rem] text-muted-foreground">{environment.targetRef}</div>
                  </TableCell>
                  <TableCell><StatusBadge tone={status.tone}>{status.label}</StatusBadge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openAssignment(assignment)}>
                      <EyeIcon data-icon="inline-start" weight="duotone" />
                      查看
                    </Button>
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
