import type { HrRouteProfile } from '../app'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonLifecycle } from '../types'

import { UserAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import { Input } from '@zonease/aiworker-ui/components/input'
import { ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useState } from 'react'

interface LifecycleColumnSection {
  id: PersonLifecycle
  label: string
  profiles: HrRouteProfile[]
}

const LIFECYCLE_COLUMN_LABELS: Record<PersonLifecycle, string> = {
  alumni: '离职归档',
  candidate: '候选人',
  employee: '在职员工',
}

export interface ProfileListColumnProps {
  labels: HrWorkbenchCopy
  onNewProfile?: () => void
  onProfileQueryChange: (query: string) => void
  onSelectProfile: (profile: HrRouteProfile) => void
  profileQuery: string
  profiles: HrRouteProfile[]
  selectedProfileId?: string
  totalProfileCount: number
}

export function ProfileListColumn({
  labels,
  onNewProfile,
  onProfileQueryChange,
  onSelectProfile,
  profileQuery,
  profiles,
  selectedProfileId,
  totalProfileCount,
}: ProfileListColumnProps) {
  const sections = buildRouteProfileSections(profiles)
  const showProfileFilter = totalProfileCount > 5 || profileQuery.trim().length > 0
  const [collapsedSections, setCollapsedSections] = useState<Set<PersonLifecycle>>(() => new Set())

  return (
    <aside data-slot="hr-profile-list-column" className="h-full min-h-0">
      <Card size="sm" className="h-full min-h-0 rounded-none bg-transparent py-3 ring-0 xl:border-r xl:border-border/60">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Profile List</CardTitle>
            <CardDescription>
              {labels.profileBoardTitle}
              {' · '}
              {labels.profileBoardDetail(profiles.length)}
            </CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              data-hr-route-action="new-profile"
              variant="ghost"
              size="icon-sm"
              aria-label={labels.newProfile}
              title={labels.newProfile}
              onClick={onNewProfile}
            >
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {showProfileFilter
            ? (
                <Input
                  aria-label={labels.profileListFilterLabel}
                  value={profileQuery}
                  placeholder={labels.profileListFilterPlaceholder}
                  onChange={event => onProfileQueryChange(event.currentTarget.value)}
                />
              )
            : null}
          <ItemGroup className="min-h-0 gap-3 overflow-y-auto">
            {sections.map((section) => {
              const collapsed = collapsedSections.has(section.id)
              const controlsId = `hr-profile-list-section-${section.id}`
              return (
                <CollapsibleGroup
                  key={section.id}
                  collapsed={collapsed}
                  controlsId={controlsId}
                  drawerProps={{ 'aria-label': section.label, 'role': 'group' }}
                  meta={section.profiles.length}
                  title={section.label}
                  toggleAriaLabel={`${collapsed ? 'Expand' : 'Collapse'} ${section.label}`}
                  onToggle={() => toggleCollapsedProfileSection(section.id, setCollapsedSections)}
                >
                  {section.profiles.length > 0
                    ? (
                        <ItemGroup className="gap-2">
                          {section.profiles.map(profile => (
                            <ProfileListItem
                              key={profile.id}
                              labels={labels}
                              profile={profile}
                              selected={profile.id === selectedProfileId}
                              onSelect={onSelectProfile}
                            />
                          ))}
                        </ItemGroup>
                      )
                    : <ProfileListPlaceholder>{labels.noProfilesInSection}</ProfileListPlaceholder>}
                </CollapsibleGroup>
              )
            })}
          </ItemGroup>
        </CardContent>
      </Card>
    </aside>
  )
}

function ProfileListPlaceholder({ children }: { children: string }) {
  return (
    <ItemDescription
      asChild
      className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center"
    >
      <div data-slot="hr-empty-placeholder">{children}</div>
    </ItemDescription>
  )
}

function toggleCollapsedProfileSection(
  sectionId: PersonLifecycle,
  setCollapsedSections: (updater: (current: Set<PersonLifecycle>) => Set<PersonLifecycle>) => void,
) {
  setCollapsedSections((current) => {
    const next = new Set(current)
    if (next.has(sectionId))
      next.delete(sectionId)
    else
      next.add(sectionId)
    return next
  })
}

export function buildRouteProfileSections(profiles: HrRouteProfile[]): LifecycleColumnSection[] {
  return (['candidate', 'employee', 'alumni'] as const).map(id => ({
    id,
    label: LIFECYCLE_COLUMN_LABELS[id],
    profiles: profiles.filter(profile => resolveRouteProfileLifecycle(profile) === id),
  }))
}

function ProfileListItem({
  labels,
  onSelect,
  profile,
  selected,
}: {
  labels: HrWorkbenchCopy
  onSelect: (profile: HrRouteProfile) => void
  profile: HrRouteProfile
  selected: boolean
}) {
  return (
    <Button
      type="button"
      data-hr-profile-id={profile.id}
      data-hr-route-path={`/hr/profiles/${profile.id}`}
      aria-label={labels.openProfile(profile.name)}
      variant={selected ? 'secondary' : 'ghost'}
      size="lg"
      className="h-10 w-full justify-between gap-2 overflow-hidden px-3 py-0 whitespace-nowrap"
      onClick={() => onSelect(profile)}
    >
      <ItemTitle asChild className="min-w-0 flex-1 truncate text-left">
        <span>{profile.name}</span>
      </ItemTitle>
      <ItemDescription asChild className="max-w-[52%] shrink-0 truncate text-right">
        <span>{profile.reviewStatus}</span>
      </ItemDescription>
    </Button>
  )
}

function resolveRouteProfileLifecycle(profile: HrRouteProfile): PersonLifecycle {
  if (profile.lifecycle)
    return profile.lifecycle
  const stage = `${profile.stage} ${profile.name} ${profile.summary}`.toLowerCase()
  if (/alumni|offboard|depart|exit|离职|归档|交接/.test(stage))
    return 'alumni'
  if (/employee|onboard|active|在职|员工|入职|试用/.test(stage))
    return 'employee'
  return 'candidate'
}
