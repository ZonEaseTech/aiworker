import type { HostedSoulApp } from '@zonease/aiworker-shared'
import type { messagesFor, normalizeLocale } from '../../features/i18n'
import type { LocalWorkspaceData } from '../../features/local-workspace/api/types'

import {
  Add01Icon,
  ArrowRight01Icon,
  File02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import { ItemContent, ItemDescription, ItemGroup } from '@zonease/aiworker-ui/components/item'
import {
  displaySoul,
  formatStatus,
} from '../../features/i18n'
import { StudioEmptyState } from '../components/studio-shell'

type WorkerMessages = ReturnType<typeof messagesFor>

export function FirstRunSoulAppHome({
  apps,
  copy,
  locale,
  onCreateWorker,
  onStartApp,
  souls,
}: {
  apps: HostedSoulApp[]
  copy: WorkerMessages
  locale: ReturnType<typeof normalizeLocale>
  onCreateWorker: () => void
  onStartApp: (app: HostedSoulApp) => void
  souls: LocalWorkspaceData['souls']
}) {
  if (apps.length === 0) {
    return (
      <StudioEmptyState
        icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
        title={copy.workspace.noSoulApps}
        detail={copy.workspace.noSoulAppsDetail}
        action={(
          <Button type="button" variant="ghost" size="lg" onClick={onCreateWorker}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
            {copy.workspace.createWorker}
          </Button>
        )}
      />
    )
  }

  return (
    <ItemGroup className="w-full max-w-6xl gap-4" aria-label={copy.workspace.firstRunTitle}>
      <ItemDescription className="line-clamp-none max-w-2xl">{copy.workspace.firstRunDetail}</ItemDescription>
      <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const soul = soulForApp(app, souls)
          const soulCopy = soul ? displaySoul(soul, locale) : null
          const domain = soulCopy?.domain ?? app.projectedSoul?.domain ?? app.appId
          const description = soulCopy?.description ?? app.manifest.description
          return (
            <Card
              key={app.appId}
              size="sm"
              className="min-h-44"
            >
              <CardHeader>
                <ItemContent className="min-w-0">
                  <CardTitle>{app.manifest.name}</CardTitle>
                  <CardDescription>{domain}</CardDescription>
                </ItemContent>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="line-clamp-2">{description}</CardDescription>
              </CardContent>
              <CardFooter className="justify-between gap-2">
                <Badge variant="outline">{`${formatStatus(app.status, locale)} · ${app.version}`}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={copy.workspace.startSoulApp(app.manifest.name)}
                  onClick={() => onStartApp(app)}
                >
                  {copy.workspace.startSoulApp(app.manifest.name)}
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </ItemGroup>
    </ItemGroup>
  )
}

function soulForApp(app: HostedSoulApp, souls: LocalWorkspaceData['souls']) {
  return souls.find(soul => soul.id === app.appId)
    ?? souls.find(soul => soul.id === app.projectedSoul?.id)
    ?? null
}
