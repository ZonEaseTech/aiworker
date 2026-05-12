import type { LocalWorkspace } from '@zonease/aiworker-shared'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile, ProfileListSection, ProfileListSectionId } from '../types'

import { ChevronDown, UsersRound } from 'lucide-react'
import { WorkbenchSectionTitle } from '../../../common'

interface ProfileListProps {
  collapsedSectionIds: ReadonlySet<ProfileListSectionId>
  labels: HrWorkbenchCopy
  onOpenWorkspace: (workspace: LocalWorkspace) => void
  onToggleSection: (sectionId: ProfileListSectionId) => void
  sections: ProfileListSection[]
  selectedWorkspaceId: string | null
  visibleCount: number
}

export function HrProfileList({
  collapsedSectionIds,
  labels,
  onOpenWorkspace,
  onToggleSection,
  sections,
  selectedWorkspaceId,
  visibleCount,
}: ProfileListProps) {
  return (
    <aside className="hr-profile-list-panel" aria-label={labels.profileBoardLabel}>
      <WorkbenchSectionTitle
        icon={<UsersRound size={15} />}
        title={labels.profileBoardTitle}
        detail={labels.profileListDetail(visibleCount)}
      />

      <div className="hr-profile-list-scroll">
        {sections.map((section) => {
          const collapsed = collapsedSectionIds.has(section.id)
          return (
            <section key={section.id} className="hr-profile-list-section">
              <button
                type="button"
                className="hr-profile-section-toggle"
                aria-expanded={!collapsed}
                onClick={() => onToggleSection(section.id)}
              >
                <span>
                  <strong>{section.label}</strong>
                </span>
                <span className="hr-section-count">{section.profiles.length}</span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>

              {!collapsed
                ? (
                    <div className="hr-profile-section-drawer">
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
                    </div>
                  )
                : null}
            </section>
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
