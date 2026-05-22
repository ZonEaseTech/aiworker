import type { HrRouteProfile } from '../app'
import type { HrWorkbenchCopy } from '../copy'
import type { HrProfileComposerSubmitInput } from '../profile-composer'
import type { LocalSession } from '../types'

import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'

import { HrProfileComposer } from '../profile-composer'

export interface ProfileComposerColumnProps {
  labels: HrWorkbenchCopy
  onComposerSubmit: (input: HrProfileComposerSubmitInput) => Promise<void> | void
  selectedProfile: HrRouteProfile | null
  sessions: LocalSession[]
  submitError?: string | null
  submitting?: boolean
}

export function ProfileComposerColumn({
  labels,
  onComposerSubmit,
  selectedProfile,
  sessions,
  submitError = null,
  submitting = false,
}: ProfileComposerColumnProps) {
  const recentSessions = sessions
    .filter(session => !selectedProfile || session.workspaceId === selectedProfile.id)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  return (
    <aside data-slot="hr-profile-composer-column" className="h-full min-h-0">
      <Card size="sm" className="h-full min-h-0 rounded-none bg-transparent py-3 ring-0 xl:border-l xl:border-border/60">
        <CardHeader>
          <ItemContent className="min-w-0">
            <CardTitle>Recent Sessions & Composer</CardTitle>
            <CardDescription>
              {selectedProfile
                ? labels.actionComposerDetail(selectedProfile.name)
                : labels.selectProfileFirst}
            </CardDescription>
          </ItemContent>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <ItemGroup data-slot="hr-recent-sessions-panel" className="min-h-0 flex-1 gap-2 overflow-hidden">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <ItemTitle>Recent Sessions</ItemTitle>
              <Badge variant="outline">{recentSessions.length}</Badge>
            </div>
            <ItemDescription>{labels.recentSessionsDetail(recentSessions.length)}</ItemDescription>
            <div data-slot="hr-recent-sessions-list" className="min-h-0 flex-1 overflow-y-auto pr-1">
              {recentSessions.length > 0
                ? (
                    <ItemGroup className="gap-1.5">
                      {recentSessions.map(session => (
                        <Button key={session.id} type="button" variant="ghost" size="sm" className="h-auto w-full justify-start px-2 py-1.5 whitespace-normal">
                          <ItemContent className="min-w-0 gap-0.5">
                            <ItemTitle className="max-w-full truncate">{session.title || session.capabilityTemplateId}</ItemTitle>
                            <ItemDescription className="max-w-full">{formatSessionTimeAgo(session.updatedAt)}</ItemDescription>
                          </ItemContent>
                        </Button>
                      ))}
                    </ItemGroup>
                  )
                : <RecentSessionsPlaceholder>{labels.noRecentSessions}</RecentSessionsPlaceholder>}
            </div>
          </ItemGroup>
          <div data-slot="hr-composer-pane" className="h-1/3 min-h-0 shrink-0 overflow-hidden">
            <HrProfileComposer
              className="h-full min-h-0"
              disabled={!selectedProfile}
              errorMessage={submitError}
              labels={labels}
              profileName={selectedProfile?.name}
              submitting={submitting}
              onSubmit={onComposerSubmit}
            />
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}

function RecentSessionsPlaceholder({ children }: { children: string }) {
  return (
    <ItemDescription
      asChild
      className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center"
    >
      <div data-slot="hr-empty-placeholder">{children}</div>
    </ItemDescription>
  )
}

function formatSessionTimeAgo(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt)
  if (Number.isNaN(timestamp))
    return updatedAt

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60)
    return 'just now'

  const elapsedMinutes = Math.round(elapsedSeconds / 60)
  if (elapsedMinutes < 60)
    return `${elapsedMinutes}m ago`

  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24)
    return `${elapsedHours}h ago`

  const elapsedDays = Math.round(elapsedHours / 24)
  return `${elapsedDays}d ago`
}
