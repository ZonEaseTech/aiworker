import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminConsoleData, releaseStatusMeta } from '@/lib/admin-data'

export function SoulsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Soul releases"
        title="版本化 workspace templates"
        description="Soul descriptor 只描述 protocol / identity / workspaceTemplate。这里展示发布状态和投影文件摘要，不解释 Soul 私有领域字段。"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {adminConsoleData.soulReleases.map((release) => {
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
                <div className="rounded-md border bg-muted/30 p-3 font-mono">
                  <p>{release.descriptorRef}</p>
                  <p className="mt-1 text-muted-foreground">
                    {release.fileCount}
                    {' '}
                    projected files
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
