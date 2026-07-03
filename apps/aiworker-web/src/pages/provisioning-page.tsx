import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link, useSearchParams } from 'react-router'

import { AssignmentDetailContent } from '@/components/assignment-detail-sheet'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin-data-context'

/**
 * 兼容页（设计 B6）。开通/发入口/重试等动作已在操作台行内与新开通抽屉里完成，
 * 此页不再是隐藏的“干活”深链，也不在导航里。
 *
 * 保留 `/provisioning` 路由只为避免旧深链 404：
 * - 带 `?assignment=<id>` 时，就地渲染该开通的只读详情（含 Provider、receipt、trace、handoff）。
 * - 无参数或引用不存在时，引导回操作台。
 */
export function ProvisioningPage() {
  const { data } = useAdminData()
  const [searchParams] = useSearchParams()
  const requestedAssignmentId = searchParams.get('assignment') ?? ''
  const assignment = data.assignments.find(item => item.id === requestedAssignmentId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="员工开通"
        title="处理员工开通"
        description="开通、发入口和重试现在都在操作台行内完成。这里只用于打开某一条开通的详情；从操作台可以直接动手。"
        actions={(
          <Button asChild size="sm" variant="outline">
            <Link to="/">
              <ArrowRightIcon data-icon="inline-start" weight="duotone" />
              回操作台
            </Link>
          </Button>
        )}
      />

      {assignment
        ? (
            <Card>
              <CardHeader>
                <CardTitle>{assignment.assignedEmail}</CardTitle>
                <CardDescription>这条开通的完整信息；要开通、发入口或重试，请回操作台在行内处理。</CardDescription>
              </CardHeader>
              <CardContent>
                <AssignmentDetailContent assignment={assignment} />
              </CardContent>
            </Card>
          )
        : (
            <Card>
              <CardHeader>
                <CardTitle>没有找到对应的员工开通</CardTitle>
                <CardDescription>操作台是唯一的“干活”页；从那里选择员工并在行内开通。</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link to="/">
                    <ArrowRightIcon data-icon="inline-start" weight="duotone" />
                    去操作台开通
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
    </div>
  )
}
