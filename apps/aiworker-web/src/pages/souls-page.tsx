import { DemoDataNotice } from '@/components/demo-data-notice'
import { RegisterSoulSheet } from '@/components/forms/register-soul-sheet'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { releaseStatusMeta } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

export function SoulsPage() {
  const { data } = useAdminData()
  return (
    <div className="flex flex-col gap-6">
      <DemoDataNotice />
      <PageHeader
        eyebrow="能力模板"
        title="可分配的 AI 能力"
        description="管理员选择员工需要的能力包；模板内容由专业人员维护，页面只展示发布状态和适用说明。"
        actions={<RegisterSoulSheet />}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data.soulReleases.map((release) => {
          const meta = releaseStatusMeta[release.status]
          return (
            <Card key={release.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{release.displayName}</CardTitle>
                    <CardDescription className="mt-1">{release.version}</CardDescription>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-xs/relaxed">
                <p className="text-muted-foreground">{release.summary}</p>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-foreground">
                    {release.fileCount}
                    {' '}
                    个准备文件
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                    <p className="mt-1 break-words font-mono text-[0.625rem] text-muted-foreground">{release.descriptorRef}</p>
                  </details>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
