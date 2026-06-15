import { PlayCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  adminConsoleData,
  environmentStatusMeta,
  getEnvironment,
  getProviderProfile,
  getSoulRelease,
  providerStatusMeta,
  releaseStatusMeta,
} from '@/lib/admin-data'

export function ProvisioningPage() {
  const [selectedSoul, setSelectedSoul] = useState(adminConsoleData.soulReleases[0].id)
  const [selectedEnvironment, setSelectedEnvironment] = useState(adminConsoleData.environments[0].id)
  const [selectedProvider, setSelectedProvider] = useState(adminConsoleData.providerProfiles[0].id)
  const environment = getEnvironment(selectedEnvironment)
  const provider = getProviderProfile(selectedProvider)
  const soul = getSoulRelease(selectedSoul)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Provisioning"
        title="生成 assignment plan"
        description="该页面只预览 AIWorker 将执行的 aissh/projection/handoff 元数据，不会展示 provider secret，也不会连接 Paseo runtime。"
        actions={(
          <Button size="sm">
            <PlayCircleIcon data-icon="inline-start" weight="duotone" />
            预览计划
          </Button>
        )}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>输入</CardTitle>
            <CardDescription>选择目标员工环境、Soul release 与 provider profile。</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Paseo environment</FieldLabel>
                <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {adminConsoleData.environments.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.ownerEmail}
                          {' '}
                          ·
                          {item.targetRef}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Soul release</FieldLabel>
                <Select value={selectedSoul} onValueChange={setSelectedSoul}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {adminConsoleData.soulReleases.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.displayName}
                          {' '}
                          ·
                          {item.version}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Provider profile</FieldLabel>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {adminConsoleData.providerProfiles.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                          {' '}
                          ·
                          {item.provider}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Redacted plan preview</CardTitle>
            <CardDescription>交付前可复制给审批或审计；secret 只显示 reference。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Install/verify Paseo</FieldTitle>
                  <FieldDescription>
                    {environment.targetRef}
                    {' '}
                    · PASEO_HOME=
                    {environment.paseoHome}
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={environmentStatusMeta[environment.status].tone}>
                  {environmentStatusMeta[environment.status].label}
                </StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Project workspace files</FieldTitle>
                  <FieldDescription>
                    {soul.fileCount}
                    {' '}
                    files from
                    {' '}
                    {soul.workspaceTemplateRoot}
                  </FieldDescription>
                </FieldContent>
                <StatusBadge tone={releaseStatusMeta[soul.status].tone}>{releaseStatusMeta[soul.status].label}</StatusBadge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Provider authentication</FieldTitle>
                  <FieldDescription>{provider.secretRef}</FieldDescription>
                </FieldContent>
                <StatusBadge tone={providerStatusMeta[provider.status].tone}>{providerStatusMeta[provider.status].label}</StatusBadge>
              </Field>
            </FieldGroup>
            <Separator />
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs/relaxed">
              {`aiworker apply --yes \\
  --user ${environment.ownerEmail} \\
  --target ${environment.targetRef} \\
  --environment ${environment.id} \\
  --paseo-home ${environment.paseoHome} \\
  --paseo-endpoint ${environment.daemonEndpoint} \\
  --provider ${provider.id} \\
  --soul ${soul.descriptorRef} \\
  --workspace <workspace-ref>`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
