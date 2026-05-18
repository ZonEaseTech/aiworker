import type { LocalWorkspace } from '@zonease/aiworker-shared'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile, ProfileListSection, ProfileListSectionId } from '../types'

import { IconButton, StudioCollapsibleGroup } from '@zonease/aiworker-component'
import { Plus, Search, UsersRound } from 'lucide-react'
import { WorkbenchSectionTitle } from '../../../common'

interface ProfileListProps {
  collapsedSectionIds: ReadonlySet<ProfileListSectionId>
  createProfileBusy?: boolean
  createProfileLabel: string
  labels: HrWorkbenchCopy
  onCreateProfile: () => void
  onOpenWorkspace: (workspace: LocalWorkspace) => void
  onProfileQueryChange: (query: string) => void
  onToggleSection: (sectionId: ProfileListSectionId) => void
  profileQuery: string
  sections: ProfileListSection[]
  selectedWorkspaceId: string | null
  showProfileFilter: boolean
  visibleCount: number
}

export function HrProfileList({
  collapsedSectionIds,
  createProfileBusy = false,
  createProfileLabel,
  labels,
  onCreateProfile,
  onOpenWorkspace,
  onProfileQueryChange,
  onToggleSection,
  profileQuery,
  sections,
  selectedWorkspaceId,
  showProfileFilter,
  visibleCount,
}: ProfileListProps) {
  return (
    <aside className="hr-profile-list-panel" aria-label={labels.profileBoardLabel}>
      <div className="hr-profile-list-header">
        <WorkbenchSectionTitle
          icon={<UsersRound size={15} />}
          title={labels.profileBoardTitle}
          detail={labels.profileListDetail(visibleCount)}
        />
        <IconButton
          aria-busy={createProfileBusy}
          aria-label={createProfileLabel}
          disabled={createProfileBusy}
          title={createProfileLabel}
          onClick={onCreateProfile}
        >
          <Plus aria-hidden="true" size={15} />
        </IconButton>
      </div>

      {showProfileFilter
        ? (
            <label className="hr-profile-list-filter">
              <Search aria-hidden="true" size={14} />
              <span className="sr-only">{labels.profileListFilterLabel}</span>
              <input
                value={profileQuery}
                placeholder={labels.profileListFilterPlaceholder}
                onChange={event => onProfileQueryChange(event.target.value)}
              />
            </label>
          )
        : null}

      <div className="hr-profile-list-scroll">
        {sections.map((section) => {
          const collapsed = collapsedSectionIds.has(section.id)
          return (
            <StudioCollapsibleGroup
              key={section.id}
              className="hr-profile-list-section"
              collapsed={collapsed}
              meta={section.profiles.length}
              title={section.label}
              toggleAriaLabel={`${section.label} ${section.profiles.length}`}
              onToggle={() => onToggleSection(section.id)}
            >
              {section.profiles.length > 0
                ? section.profiles.map(profile => (
                    <ProfileListCard
                      key={`${section.id}-${profile.id}`}
                      labels={labels}
                      profile={profile}
                      selected={selectedWorkspaceId === profile.id}
                      onOpenWorkspace={onOpenWorkspace}
                    />
                  ))
                : <span className="hr-profile-section-empty">{labels.noProfilesInSection}</span>}
            </StudioCollapsibleGroup>
          )
        })}
      </div>
    </aside>
  )
}

function ProfileListCard({
  labels,
  onOpenWorkspace,
  profile,
  selected,
}: {
  labels: HrWorkbenchCopy
  onOpenWorkspace: (workspace: LocalWorkspace) => void
  profile: PersonProfile
  selected: boolean
}) {
  return (
    <button
      type="button"
      className={`hr-profile-list-card ${profile.lifecycle} ${selected ? 'active' : ''}`}
      aria-label={labels.openProfile(profile.name)}
      onClick={() => onOpenWorkspace(profile.workspace)}
    >
      <span className="hr-profile-list-card-main">
        <span className="hr-profile-list-card-copy">
          <strong>{profile.name}</strong>
          <small>{profile.detail}</small>
        </span>
        <span className={`workbench-status-cell ${profile.statusTone}`}>{labels.lifecycleLabels[profile.lifecycle]}</span>
      </span>
      <span className="hr-profile-list-card-status">
        <small>{profile.moment}</small>
        <strong>{profile.nextStep}</strong>
      </span>
    </button>
  )
}
