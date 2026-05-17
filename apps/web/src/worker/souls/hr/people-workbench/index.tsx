import type { LocalSoulAppWorkbenchAction } from '../../../../features/local-workspace/api/types'
import type { SoulWorkbenchRendererProps } from '../../types'
import type { HrProfileToolsRailTarget } from './components/profile-tools-rail'
import type { ProfileListSectionId } from './types'

import { IconButton } from '@zonease/aiworker-component'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Search, Settings, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HrProfileDetails } from './components/profile-details'
import { HrProfileList } from './components/profile-list'
import { HrProfileToolsPanel } from './components/profile-tools-panel'
import { HrProfileToolsRail } from './components/profile-tools-rail'
import { getHrPeopleWorkbenchCopy } from './copy'
import {
  buildPersonProfiles,
  buildProfileListSections,
  buildProfileTimeline,
  orderActionsForProfile,
} from './model'

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
    soulCopy,
    submitting,
    templates,
    value,
    workbench,
    workerName,
    workspaces,
  },
}: SoulWorkbenchRendererProps) {
  const labels = getHrPeopleWorkbenchCopy(locale)
  const [profileQuery, setProfileQuery] = useState('')
  const [profileListVisible, setProfileListVisible] = useState(true)
  const [profileToolsExpanded, setProfileToolsExpanded] = useState(false)
  const [profileToolsFocusTarget, setProfileToolsFocusTarget] = useState<HrProfileToolsRailTarget | null>(null)
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
  const reviewGuardrails = locale === 'zh-CN' ? labels.reviewGuardrails : workbench.reviewChecklist.slice(0, 4)
  const activeActions = orderActionsForProfile(workbench.actions, focusedProfile)
  const timeline = focusedProfile ? buildProfileTimeline(focusedProfile, labels, locale) : []
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
      return
    }
    if (action.role === 'settings')
      onOpenSettings()
  }

  function renderWorkbenchBridgeAction(action: LocalSoulAppWorkbenchAction) {
    const busy = workbenchBridge?.busyActionId === action.id
    const Icon = action.role === 'settings'
      ? Settings
      : action.role === 'refresh'
        ? RefreshCw
        : action.role === 'panel-toggle'
          ? ShieldCheck
          : Plus
    return (
      <button
        key={action.id}
        aria-busy={busy}
        className="shell-primary-action"
        disabled={Boolean(workbenchBridge?.busyActionId)}
        title="Provided by the Soul App protocol"
        type="button"
        onClick={() => void handleWorkbenchAction(action)}
      >
        <Icon aria-hidden="true" size={14} />
        <span>{action.label}</span>
      </button>
    )
  }

  return (
    <>
      <header className="entry-header workspace-header hr-people-header">
        <div className="hr-header-main">
          <span className="kicker">{`${soulCopy.name} / ${workbench.name}`}</span>
          <h1>{labels.workbenchTitle}</h1>
          <p>{focusedProfile ? labels.commandDetail(focusedProfile.name, focusedProfile.moment) : `${workerName} ${labels.headerFallback}`}</p>
        </div>
        <div className="entry-header-right hr-header-actions">
          {workbenchBridge?.search ?? (
            <label className="hr-profile-search">
              <Search aria-hidden="true" size={14} />
              <span className="sr-only">{labels.profileListSearchLabel}</span>
              <input
                value={profileQuery}
                placeholder={labels.profileListSearchPlaceholder}
                onChange={event => setProfileQuery(event.target.value)}
              />
            </label>
          )}
          <div className="hr-header-metrics" aria-label={labels.metricsLabel}>
            {labels.metrics(profiles.length, artifacts.length, lessons.length).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
          {workbenchBridge
            ? workbenchBridge.actionDescriptors.map(renderWorkbenchBridgeAction)
            : (
                <>
                  <button type="button" className="primary hr-header-command" onClick={onCreateWorkspace}>
                    <Plus aria-hidden="true" size={14} />
                    <span>{labels.newProfile}</span>
                  </button>
                  <button type="button" className="ghost hr-header-command" onClick={onOpenConnectors}>
                    <ShieldCheck aria-hidden="true" size={14} />
                    <span>{labels.evidenceConnectors}</span>
                  </button>
                </>
              )}
          <div className="hr-header-icon-group" aria-label={labels.workbenchPanelControlsLabel}>
            <IconButton
              aria-label={profileListVisible ? labels.hideProfileList : labels.showProfileList}
              aria-pressed={profileListVisible}
              onClick={() => setProfileListVisible(visible => !visible)}
            >
              {profileListVisible ? <PanelLeftClose aria-hidden="true" size={16} /> : <PanelLeftOpen aria-hidden="true" size={16} />}
            </IconButton>
            {focusedProfile
              ? (
                  <IconButton
                    aria-label={profileToolsExpanded ? labels.collapseProfileTools : labels.expandProfileTools}
                    aria-pressed={profileToolsExpanded}
                    onClick={() => setProfileToolsExpanded(expanded => !expanded)}
                  >
                    {profileToolsExpanded ? <PanelRightClose aria-hidden="true" size={16} /> : <PanelRightOpen aria-hidden="true" size={16} />}
                  </IconButton>
                )
              : null}
            {workbenchBridge?.actionRoles.has('refresh')
              ? null
              : (
                  <IconButton aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
                    <RefreshCw aria-hidden="true" size={16} />
                  </IconButton>
                )}
            {workbenchBridge?.actionRoles.has('settings')
              ? null
              : (
                  <IconButton aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
                    <Settings aria-hidden="true" size={16} />
                  </IconButton>
                )}
          </div>
        </div>
      </header>
      {workbenchBridge?.status}
      {workbenchBridge?.results}

      <div className="entry-tab-content workspace-content hr-people-content" data-testid="hr-people-workbench">
        <div className={`hr-people-layout ${profileListVisible ? '' : 'without-profile-list'} ${focusedProfile ? 'has-profile-selection' : 'selection-empty'} ${focusedProfile && !profileToolsExpanded ? 'with-tools-rail' : ''}`}>
          {profileListVisible
            ? (
                <HrProfileList
                  collapsedSectionIds={collapsedSectionIds}
                  labels={labels}
                  sections={profileSections}
                  selectedWorkspaceId={selectedWorkspace?.id ?? null}
                  visibleCount={visibleProfiles.length}
                  onOpenWorkspace={onOpenWorkspace}
                  onToggleSection={toggleSection}
                />
              )
            : null}

          {focusedProfile
            ? (
                <HrProfileDetails
                  focusedProfile={focusedProfile}
                  labels={labels}
                  profilePreview={profilePreview}
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
                  activeActions={activeActions}
                  artifact={selectedArtifact}
                  artifactPreview={artifactPreview}
                  copy={copy}
                  engineReadiness={engineReadiness}
                  focusedProfile={focusedProfile}
                  labels={labels}
                  locale={locale}
                  profilePreview={profilePreview}
                  selectedTemplate={selectedTemplate}
                  selectedWorkspace={selectedWorkspace}
                  submitting={submitting}
                  templates={templates}
                  value={value}
                  onActionSelect={onActionSelect}
                  onContextChange={onContextChange}
                  onOpenSession={onOpenSession}
                  onProfileToolsFocusTargetHandled={() => setProfileToolsFocusTarget(null)}
                  onPromoteProfileRevision={onPromoteProfileRevision}
                  onSubmitSession={onSubmitSession}
                  onTemplateChange={onTemplateChange}
                  profileRevisionSubmitting={profileRevisionSubmitting}
                  profileToolsFocusTarget={profileToolsFocusTarget}
                  reviewGuardrails={reviewGuardrails}
                  timeline={timeline}
                />
              )
            : focusedProfile
              ? (
                  <HrProfileToolsRail
                    labels={labels}
                    onExpand={(target) => {
                      setProfileToolsFocusTarget(target)
                      setProfileToolsExpanded(true)
                    }}
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
