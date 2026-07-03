import { DemoDataNotice } from '@/components/demo-data-notice'
import { CreateEnvironmentSheet } from '@/components/forms/create-environment-sheet'
import { CreateProviderSheet } from '@/components/forms/create-provider-sheet'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { environmentStatusMeta, providerStatusMeta } from '@/lib/admin-data'
import { useAdminData } from '@/lib/admin-data-context'

export function EnvironmentsPage() {
  const { data } = useAdminData()
  return (
    <div className="flex flex-col gap-6">
      <DemoDataNotice />
      <PageHeader
        eyebrow="资源"
        title="员工设备和后台 AI 账号"
        description="Environment（目标机）= 员工用的 Paseo 机器/环境；Provider（后台账号）= 背后的 AI 账号（只存 secret:// 引用）。这两类是可复用库，开通时智能带出，一般不用逐条手建。"
      />
      <Tabs defaultValue="environments">
        <TabsList>
          <TabsTrigger value="environments">员工设备</TabsTrigger>
          <TabsTrigger value="providers">后台 AI 账号</TabsTrigger>
        </TabsList>
        <TabsContent value="environments" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>员工设备</CardTitle>
                  <CardDescription>用于判断员工是否具备开通条件；更细的连接信息折叠给技术支持查看。</CardDescription>
                </div>
                <CardAction>
                  <CreateEnvironmentSheet />
                </CardAction>
              </div>
            </CardHeader>
            <CardContent>
              {data.environments.length === 0
                ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>还没有登记目标机 Environment</EmptyTitle>
                        <EmptyDescription>
                          Environment 是员工使用 AIWorker 的 Paseo 机器/环境。通常不用在这里手建——直接去操作台“新开通”，缺机器时可在抽屉内联创建；也可以用右上角“新建设备”提前登记一台常用机器。
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <CreateEnvironmentSheet />
                      </EmptyContent>
                    </Empty>
                  )
                : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>员工/负责人</TableHead>
                          <TableHead>设备</TableHead>
                          <TableHead>连接方式</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="w-16 text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.environments.map((environment) => {
                          const meta = environmentStatusMeta[environment.status]
                          return (
                            <TableRow key={environment.id}>
                              <TableCell>
                                <div className="font-medium">{environment.ownerEmail}</div>
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                                  <div className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{environment.paseoHome}</div>
                                </details>
                              </TableCell>
                              <TableCell>{environment.targetRef}</TableCell>
                              <TableCell>
                                {environment.endpointKind === 'relay-offer' ? '远程配对' : environment.endpointKind === 'local-home' ? '本机目录' : '已配置'}
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                                  <div className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{environment.daemonEndpoint}</div>
                                </details>
                              </TableCell>
                              <TableCell><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></TableCell>
                              <TableCell className="text-right">
                                <CreateEnvironmentSheet editTarget={environment} />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>后台 AI 账号</CardTitle>
                  <CardDescription>只显示账号名称和授权状态；密钥不会出现在页面、日志或开通记录里。</CardDescription>
                </div>
                <CardAction>
                  <CreateProviderSheet />
                </CardAction>
              </div>
            </CardHeader>
            <CardContent>
              {data.providerProfiles.length === 0
                ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>还没有登记后台账号 Provider</EmptyTitle>
                        <EmptyDescription>
                          Provider 是员工背后用的 AI 账号，这里只保存 secret:// 引用，绝不保存真实密钥。用右上角“新建账号”登记一个引用，登记后可在开通时智能复用。
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <CreateProviderSheet />
                      </EmptyContent>
                    </Empty>
                  )
                : null}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {data.providerProfiles.map((profile) => {
                  const meta = providerStatusMeta[profile.status]
                  return (
                    <Card key={profile.id}>
                      <CardHeader>
                        <CardTitle>{profile.label}</CardTitle>
                        <CardDescription>
                          服务：
                          {profile.provider}
                        </CardDescription>
                        <CardAction>
                          <CreateProviderSheet editTarget={profile} />
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 text-xs">
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        <details>
                          <summary className="cursor-pointer text-[0.625rem] text-muted-foreground">支持信息</summary>
                          <p className="mt-1 break-words font-mono text-[0.625rem] text-muted-foreground">{profile.secretRef}</p>
                        </details>
                        {profile.paseoProviderId ? <Badge variant="outline">已关联 Paseo</Badge> : null}
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
