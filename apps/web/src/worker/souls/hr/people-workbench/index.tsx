import type { SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { LocalSoulAppWorkbenchAction } from '../../../../features/local-workspace/api/types'
import type { SoulWorkbenchRendererProps } from '../../types'
import type { HrProfileSectionId } from './profile-readme'
import type { ProfileListSectionId } from './types'

import { IconButton } from '@zonease/aiworker-component'
import { PanelLeft, PanelRight, Plus, RefreshCw, Search, Settings, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HrProfileDetails } from './components/profile-details'
import { HrProfileList } from './components/profile-list'
import { HrProfilePatchReview } from './components/profile-patch-review'
import { HrProfileToolsPanel } from './components/profile-tools-panel'
import { getHrPeopleWorkbenchCopy } from './copy'
import {
  buildPersonProfiles,
  buildProfileListSections,
  orderActionsForProfile,
} from './model'
import { buildProfileRevisionReview } from './revision-review'

export function HrPeopleWorkbench({
  context: {
    artifactPreview,
    artifacts,
    copy,
    engineReadiness,
    lessons,
    locale,
    onActionSelect,
    onOpenConnectors,
    onContextChange,
    onCreateWorkspace,
    onOpenSession,
    onOpenSettings,
    onOpenWorkspace,
    onPromoteProfileRevision,
    onRefresh,
    onSubmitSession,
    onTemplateChange,
    profilePreview,
    profileRevisionSubmitting,
    reviews,
    selectedArtifact,
    selectedTemplate,
    selectedWorkspace,
    workbenchBridge,
    sessions,
    submitting,
    templates,
    value,
    workbench,
    workspaces,
  },
}: SoulWorkbenchRendererProps) {
  const labels = getHrPeopleWorkbenchCopy(locale)
  const [profileQuery, setProfileQuery] = useState('')
  const [profileListVisible, setProfileListVisible] = useState(true)
  const [profilePatchReviewWorkspaceId, setProfilePatchReviewWorkspaceId] = useState<string | null>(null)
  const [profileToolsExpanded, setProfileToolsExpanded] = useState(false)
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<ReadonlySet<ProfileListSectionId>>(() => new Set(['employee', 'alumni']))
  const profiles = useMemo(
    () => buildPersonProfiles(workspaces, sessions, artifacts, reviews, lessons, labels, locale),
    [artifacts, labels, lessons, locale, reviews, sessions, workspaces],
  )
  const visibleProfiles = useMemo(
    () => profiles.filter(profile => matchesProfileQuery(profile, profileQuery)),
    [profileQuery, profiles],
  )
  const profileSections = useMemo(
    () => buildProfileListSections(visibleProfiles, labels),
    [labels, visibleProfiles],
  )
  const selectedProfile = selectedWorkspace
    ? profiles.find(profile => profile.id === selectedWorkspace.id) ?? null
    : null
  const focusedProfile = selectedProfile
  const activeActions = orderActionsForProfile(workbench.actions, focusedProfile)
  const profilePatchReviewOpen = Boolean(focusedProfile && profilePatchReviewWorkspaceId === focusedProfile.id)
  const previewMatchesArtifact = Boolean(selectedArtifact && artifactPreview.artifactId === selectedArtifact.id)
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)
  const profileRevisionReview = useMemo(() => buildProfileRevisionReview({
    artifactContent: previewMatchesArtifact ? artifactPreview.content : '',
    artifactError: previewMatchesArtifact ? artifactPreview.error : null,
    artifactLoading: Boolean(selectedArtifact) && (!previewMatchesArtifact || artifactPreview.loading),
    currentProfileContent: profilePreviewMatchesProfile ? profilePreview.content : '',
    currentProfileError: profilePreviewMatchesProfile ? profilePreview.error : null,
    currentProfileLoading: Boolean(focusedProfile) && (!profilePreviewMatchesProfile || profilePreview.loading),
    hasArtifact: Boolean(selectedArtifact),
  }), [
    artifactPreview.content,
    artifactPreview.error,
    artifactPreview.loading,
    focusedProfile,
    previewMatchesArtifact,
    profilePreview.content,
    profilePreview.error,
    profilePreview.loading,
    profilePreviewMatchesProfile,
    selectedArtifact,
  ])

  const toggleSection = (sectionId: ProfileListSectionId) => {
    setCollapsedSectionIds((current) => {
      const next = new Set(current)
      if (next.has(sectionId))
        next.delete(sectionId)
      else
        next.add(sectionId)
      return next
    })
  }

  function handleOpenProfilePatchReview() {
    if (selectedArtifact && focusedProfile)
      setProfilePatchReviewWorkspaceId(focusedProfile.id)
  }

  function handleSectionAction(sectionId: HrProfileSectionId) {
    const action = findActionForProfileSection(activeActions, sectionId)
    if (!action)
      return
    onActionSelect(action)
    setProfileToolsExpanded(true)
  }
  async function handleWorkbenchAction(action: LocalSoulAppWorkbenchAction) {
    const result = await workbenchBridge?.onAction(action)
    if (!result?.ok)
      return
    if (action.role === 'primary') {
      onCreateWorkspace()
      return
    }
    if (action.role === 'panel-toggle') {
      if (focusedProfile)
        setProfileToolsExpanded(expanded => !expanded)
    }
  }

  function renderWorkbenchIconAction(action: LocalSoulAppWorkbenchAction) {
    const busy = workbenchBridge?.busyActionId === action.id
    const Icon = action.role === 'configure'
      ? Settings
      : action.role === 'refresh'
        ? RefreshCw
        : action.role === 'panel-toggle'
          ? ShieldCheck
          : Plus
    return (
      <IconButton
        key={action.id}
        aria-busy={busy}
        aria-label={action.label}
        disabled={Boolean(workbenchBridge?.busyActionId)}
        title="Provided by the Soul App protocol"
        onClick={() => void handleWorkbenchAction(action)}
      >
        <Icon aria-hidden="true" size={15} />
      </IconButton>
    )
  }

  const primaryWorkbenchAction = workbenchBridge?.actionDescriptors.find(action => action.role === 'primary') ?? null
  const createProfileLabel = primaryWorkbenchAction?.label ?? labels.newProfile
  const createProfileBusy = Boolean(primaryWorkbenchAction && workbenchBridge?.busyActionId === primaryWorkbenchAction.id)
  const showProfileFilter = profiles.length > 5 || profileQuery.trim().length > 0
  const profileHeaderActions = focusedProfile
    ? (
        <>
          <IconButton
            aria-label={profileListVisible ? labels.hideProfileList : labels.showProfileList}
            aria-pressed={profileListVisible}
            onClick={() => setProfileListVisible(visible => !visible)}
          >
            <PanelLeft aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            aria-label={profileToolsExpanded ? labels.collapseProfileTools : labels.expandProfileTools}
            aria-pressed={profileToolsExpanded}
            onClick={() => setProfileToolsExpanded(expanded => !expanded)}
          >
            <PanelRight aria-hidden="true" size={16} />
          </IconButton>
          {workbenchBridge
            ? workbenchBridge.actionDescriptors
                .filter(action => action.role !== 'primary')
                .map(renderWorkbenchIconAction)
            : (
                <>
                  <IconButton aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
                    <RefreshCw aria-hidden="true" size={16} />
                  </IconButton>
                  <IconButton aria-label={labels.evidenceConnectors} onClick={onOpenConnectors}>
                    <ShieldCheck aria-hidden="true" size={16} />
                  </IconButton>
                  <IconButton aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
                    <Settings aria-hidden="true" size={16} />
                  </IconButton>
                </>
              )}
        </>
      )
    : null

  function handleCreateProfile() {
    if (primaryWorkbenchAction) {
      void handleWorkbenchAction(primaryWorkbenchAction)
      return
    }
    onCreateWorkspace()
  }

  return (
    <>
      {workbenchBridge?.status}

      <div className="entry-tab-content workspace-content hr-people-content" data-testid="hr-people-workbench">
        <div className={`hr-people-layout ${profileListVisible ? '' : 'without-profile-list'} ${focusedProfile ? 'has-profile-selection' : 'selection-empty'} ${focusedProfile && !profileToolsExpanded ? 'without-profile-tools' : ''}`}>
          {profileListVisible
            ? (
                <HrProfileList
                  collapsedSectionIds={collapsedSectionIds}
                  createProfileBusy={createProfileBusy}
                  createProfileLabel={createProfileLabel}
                  labels={labels}
                  profileQuery={profileQuery}
                  sections={profileSections}
                  selectedWorkspaceId={selectedWorkspace?.id ?? null}
                  showProfileFilter={showProfileFilter}
                  visibleCount={visibleProfiles.length}
                  onCreateProfile={handleCreateProfile}
                  onOpenWorkspace={onOpenWorkspace}
                  onProfileQueryChange={setProfileQuery}
                  onToggleSection={toggleSection}
                />
              )
            : null}

          {focusedProfile
            ? profilePatchReviewOpen
              ? (
                  <HrProfilePatchReview
                    artifact={selectedArtifact}
                    labels={labels}
                    profileRevisionSubmitting={profileRevisionSubmitting}
                    review={profileRevisionReview}
                    onBack={() => setProfilePatchReviewWorkspaceId(null)}
                    onPromoteProfileRevision={onPromoteProfileRevision}
                  />
                )
              : (
                  <HrProfileDetails
                    focusedProfile={focusedProfile}
                    labels={labels}
                    patchArtifact={selectedArtifact}
                    profilePreview={profilePreview}
                    profileRevisionReview={profileRevisionReview}
                    headerActions={profileHeaderActions}
                    onReviewPatch={handleOpenProfilePatchReview}
                    onSectionAction={handleSectionAction}
                  />
                )
            : (
                <HrProfileSelectionEmpty
                  hasProfiles={profiles.length > 0}
                  labels={labels}
                />
              )}

          {focusedProfile && profileToolsExpanded
            ? (
                <HrProfileToolsPanel
                  engineReadiness={engineReadiness}
                  focusedProfile={focusedProfile}
                  labels={labels}
                  locale={locale}
                  selectedTemplate={selectedTemplate}
                  selectedWorkspace={selectedWorkspace}
                  submitting={submitting}
                  templates={templates}
                  value={value}
                  onContextChange={onContextChange}
                  onOpenSession={onOpenSession}
                  onSubmitSession={onSubmitSession}
                  onTemplateChange={onTemplateChange}
                />
              )
            : null}
        </div>
      </div>
    </>
  )
}

function HrProfileSelectionEmpty({
  hasProfiles,
  labels,
}: {
  hasProfiles: boolean
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>
}) {
  return (
    <section className="hr-profile-selection-empty" aria-label={hasProfiles ? labels.profileSelectionTitle : labels.emptyProfileTitle}>
      <div className="hr-profile-selection-empty-inner">
        <Search aria-hidden="true" size={20} />
        <h2>{hasProfiles ? labels.profileSelectionTitle : labels.emptyProfileTitle}</h2>
        <p>{hasProfiles ? labels.profileSelectionBody : labels.emptyProfileBody}</p>
      </div>
    </section>
  )
}

function matchesProfileQuery(profile: ReturnType<typeof buildPersonProfiles>[number], query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery)
    return true
  return [
    profile.name,
    profile.detail,
    profile.moment,
    profile.nextStep,
    profile.status,
    profile.reviewStatus,
    profile.lifecycle,
  ].some(value => value.toLowerCase().includes(normalizedQuery))
}

function findActionForProfileSection(
  actions: readonly SoulWorkbenchAction[],
  sectionId: HrProfileSectionId,
): SoulWorkbenchAction | null {
  const preferredIds: Record<HrProfileSectionId, string[]> = {
    acceptedExternalSections: ['extract-evidence', 'summarize-profile'],
    capabilitiesAndStack: ['summarize-profile', 'extract-evidence'],
    confirmedFacts: ['extract-evidence', 'build-evidence-matrix'],
    currentProfileSummary: ['summarize-profile'],
    evidenceStatus: ['build-evidence-matrix', 'extract-evidence'],
    identityAndBasics: ['summarize-profile'],
    nextHrActions: ['prepare-next-step'],
    reviewState: ['prepare-next-step'],
    risksAndGaps: ['check-risky-wording', 'build-evidence-matrix'],
    roleContextAndResponsibilities: ['summarize-profile', 'prepare-next-step'],
  }

  for (const actionId of preferredIds[sectionId]) {
    const action = actions.find(item => item.id === actionId)
    if (action)
      return action
  }
  return actions[0] ?? null
}
