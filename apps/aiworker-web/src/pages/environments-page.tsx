import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminConsoleData, environmentStatusMeta, providerStatusMeta } from '@/lib/admin-data'

export function EnvironmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Paseo environments"
        title="环境与 provider profile"
        description="一个 Paseo environment 可承载同一员工的多个 workspace。跨员工隔离依赖 OS user/container/VM、独立 PASEO_HOME、endpoint 和 credentials。"
      />
      <Tabs defaultValue="environments">
        <TabsList>
          <TabsTrigger value="environments">Environments</TabsTrigger>
          <TabsTrigger value="providers">Provider profiles</TabsTrigger>
        </TabsList>
        <TabsContent value="environments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Environment registry</CardTitle>
              <CardDescription>仅保存连接元数据；daemon lifecycle 属于 Paseo。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminConsoleData.environments.map((environment) => {
                    const meta = environmentStatusMeta[environment.status]
                    return (
                      <TableRow key={environment.id}>
                        <TableCell>
                          <div className="font-medium">{environment.ownerEmail}</div>
                          <div className="font-mono text-[0.625rem] text-muted-foreground">{environment.paseoHome}</div>
                        </TableCell>
                        <TableCell>{environment.targetRef}</TableCell>
                        <TableCell className="font-mono text-xs">{environment.daemonEndpoint}</TableCell>
                        <TableCell><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider profile references</CardTitle>
              <CardDescription>literal provider keys never enter descriptors, receipts, logs, UI, or projected files。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {adminConsoleData.providerProfiles.map((profile) => {
                  const meta = providerStatusMeta[profile.status]
                  return (
                    <Card key={profile.id}>
                      <CardHeader>
                        <CardTitle>{profile.label}</CardTitle>
                        <CardDescription>{profile.provider}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 text-xs">
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        <p className="break-words font-mono text-muted-foreground">{profile.secretRef}</p>
                        {profile.paseoProviderId ? <Badge variant="outline">{profile.paseoProviderId}</Badge> : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
