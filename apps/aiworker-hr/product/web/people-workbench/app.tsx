import type { FormEvent } from 'react'
import type { HrProfileComposerSubmitInput } from './profile-composer'
import type { ProfileRevisionReviewState } from './revision-review'
import type {
  ComposerMaterial,
  HrLocale,
  HrPeopleWorkbenchApi,
  HrWorkbenchData,
  HrWorkbenchHostData,
  LocalArtifact,
  LocalSession,
  LocalWorkspace,
  PersonLifecycle,
} from './types'

import { Button } from '@zonease/aiworker-ui/components/button'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@zonease/aiworker-ui/components/dialog'
import { Field, FieldGroup, FieldLabel } from '@zonease/aiworker-ui/components/field'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@zonease/aiworker-ui/components/select'
import { Textarea } from '@zonease/aiworker-ui/components/textarea'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createHrPeopleWorkbenchApi, createProfileUpdateDraftSessionPayload } from './api'
import { candidateMaterialsFromSessionComposerMaterials } from './attachments'
import { ProfileComposerColumn } from './columns/profile-composer-column'
import { ProfileListColumn } from './columns/profile-list-column'
import { ProfileReadingRoomColumn } from './columns/profile-reading-room-column'
import { getHrPeopleWorkbenchCopy } from './copy'
import { normalizeHrWorkbenchHostData, readHrWorkbenchHostData } from './host-data'
import { buildPersonProfiles, buildProfileListSections } from './model'
import { parseHrProfileReadme } from './profile-readme'
import { buildProfileRevisionReview } from './revision-review'

export interface HrRouteProfile {
  evidenceCount: number
  id: string
  lifecycle?: PersonLifecycle
  name: string
  nextAction: string
  profileTitle?: string
  reviewCount?: number
  reviewStatus: string
  sessionCount?: number
  stage: string
  status: 'draft' | 'failed' | 'ready-for-review' | 'reviewed' | 'risk' | string
  summary: string
}

export interface HrPeopleWorkbenchData extends HrWorkbenchData {
  profiles?: HrRouteProfile[]
}

export type HrMicroAppHostData = HrWorkbenchHostData
export type HrLocalApiClient = HrPeopleWorkbenchApi

export interface HrPeopleWorkbenchAppProps extends Partial<HrPeopleWorkbenchData> {
  apiClient?: HrLocalApiClient | null
  badgeLabel?: string
  description?: string
  initialHostData?: HrMicroAppHostData
  locale?: HrLocale
  onSessionCreated?: (session: LocalSession) => void
  selectedProfileId?: string
  title?: string
}

declare global {
  interface Window {
    __AIWORKER_MICRO_APP_HOST_DATA__?: unknown
    microApp?: {
      addDataListener?: (listener: (data: unknown) => void, autoTrigger?: boolean) => void
      getData?: () => unknown
      removeDataListener?: (listener: (data: unknown) => void) => void
    }
  }
}

const EMPTY_ARTIFACTS: LocalArtifact[] = []
const EMPTY_PROFILE_READMES: Record<string, string> = {}
const EMPTY_SESSIONS: LocalSession[] = []
const EMPTY_WORKSPACES: LocalWorkspace[] = []
const defaultSeedProfiles: HrRouteProfile[] = [
  {
    evidenceCount: 2,
    id: 'profile-ben',
    lifecycle: 'candidate',
    name: 'Ben',
    nextAction: 'Review README patch',
    profileTitle: 'Ben People Profile',
    reviewCount: 0,
    reviewStatus: 'README patch ready',
    sessionCount: 2,
    stage: 'Candidate',
    status: 'ready-for-review',
    summary: 'aiworker hr.person profile · 3d ago',
  },
  {
    evidenceCount: 1,
    id: 'profile-stella',
    lifecycle: 'candidate',
    name: 'Stella',
    nextAction: 'Capture profile update',
    profileTitle: 'Stella People Profile',
    reviewCount: 1,
    reviewStatus: 'Profile updated',
    sessionCount: 1,
    stage: 'Candidate',
    status: 'reviewed',
    summary: 'aiworker hr.person profile · 46h ago',
  },
]

const defaultProfileReadmes: Record<string, string> = {
  'profile-ben': [
    '# Ben People Profile',
    '',
    '> Accepted People Profile for this HR workspace. Profile updates are written by the HR Soul App.',
    '',
    '## Current Profile Summary',
    '',
    'This profile README is still a baseline evidence-gap snapshot for the person target labeled Ben. It has no accepted role context, accepted capabilities, or confirmed HR facts yet.',
    '',
    'Confidence: Low for person facts, because no accepted evidence is present in the profile.',
    '',
    'Primary sources:',
    '',
    '| Source | Relevance |',
    '| --- | --- |',
    '| README.md:1-48 | Accepted profile state and current approved evidence status. |',
    '| .aiworker/sessions/c7593090-a95d-465c-8b9a-ed22faf48ef8/context/active-context.md:1-18 | Session binding, target, capability, and requested output shape. |',
    '| .aiworker/sessions/c7593090-a95d-465c-8b9a-ed22faf48ef8/context/capability/SKILL.md:1-7 | Person Profile capability reminder. |',
    '| evidence/README.md:1-3 | Evidence storage boundary and raw-evidence handling note. |',
    '',
    '## Identity And Basics',
    '',
    'No accepted content in this section yet.',
    '',
    '## Role Context And Responsibilities',
    '',
    'No accepted content in this section yet.',
    '',
    '## Capabilities And Stack',
    '',
    'No accepted content in this section yet.',
    '',
    '## Confirmed Facts',
    '',
    '| Claim | Evidence | Confidence | Notes |',
    '| --- | --- | --- | --- |',
    '| The workspace person target for this session is Ben. | .aiworker/sessions/c7593090-a95d-465c-8b9a-ed22faf48ef8/context/active-context.md:1-14 | High | This is a session/profile binding claim, not an identity-verification claim. |',
    '| README.md is the accepted People Profile for this workspace. | README.md:1-3; .aiworker/sessions/c7593090-a95d-465c-8b9a-ed22faf48ef8/context/active-context.md:3-8 | High | Profile updates are written by the HR Soul App. |',
    '| The accepted profile has no accepted profile update yet. | README.md:5-7; README.md:42-44 | High | No accepted summary can be derived beyond the empty baseline. |',
    '| Lifecycle, target role, current stage, and profile confidence are currently unknown or not started in the accepted state. | README.md:9-14 | High | These should not be inferred from the session target alone. |',
    '| There is no accepted role context yet. | README.md:16-18 | High | Role responsibilities remain missing. |',
    '',
    '## Evidence Status',
    '',
    '| Signal | Status | Source |',
    '| --- | --- | --- |',
    '| Profile baseline | Accepted empty baseline | README.md:1-48 |',
    '| Raw HR evidence | Missing from accepted profile | evidence/README.md:1-3 |',
    '| README patch | Ready | Session output can be inspected by the HR Soul App |',
    '',
    '## Risks And Gaps',
    '',
    '- The profile contains a named target but no accepted evidence-backed identity, role, capability, or lifecycle facts.',
    '- Any downstream HR decision should remain blocked until source-backed evidence is attached.',
    '',
    '## Next HR Actions',
    '',
    '- Inspect the profile patch before writing it into README.md.',
    '- Attach source material that supports identity, role context, capabilities, and lifecycle stage.',
    '',
    '## Profile Update State',
    '',
    'README patch ready. No accepted profile update has been written yet.',
    '',
    '## Accepted External Sections',
    '',
    '- None yet.',
  ].join('\n'),
}

export function HrPeopleWorkbenchApp({
  apiClient = null,
  artifacts = EMPTY_ARTIFACTS,
  initialHostData,
  locale = 'en',
  onSessionCreated,
  profileReadmes = EMPTY_PROFILE_READMES,
  profiles,
  selectedProfileId,
  sessions = EMPTY_SESSIONS,
  workspaces = EMPTY_WORKSPACES,
}: HrPeopleWorkbenchAppProps) {
  const labels = getHrPeopleWorkbenchCopy(locale)
  const [hostData] = useHostData(initialHostData)
  const [workbenchData, setWorkbenchData] = useState<HrPeopleWorkbenchData>(() => ({
    artifacts,
    profileReadmes,
    profiles,
    sessions,
    workspaces,
  }))
  const [profileQuery, setProfileQuery] = useState('')
  const [activeProfileId, setActiveProfileId] = useState(selectedProfileId ?? '')
  const [profilePatchReviewOpen, setProfilePatchReviewOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [revisionReview, setRevisionReview] = useState<ProfileRevisionReviewState | null>(null)
  const [approvingRevision, setApprovingRevision] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [createProfileOpen, setCreateProfileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const localApi = useMemo(
    () => apiClient ?? createHrPeopleWorkbenchApi({
      appId: hostData.appId,
      routePrefix: hostData.routePrefix,
    }),
    [apiClient, hostData.appId, hostData.routePrefix],
  )
  const standalonePreview = hostData.routePrefix.startsWith('standalone://')

  useEffect(() => {
    setWorkbenchData({
      artifacts,
      profileReadmes,
      profiles,
      sessions,
      workspaces,
    })
  }, [artifacts, profileReadmes, profiles, sessions, workspaces])

  const projectedProfiles = useMemo(
    () => workbenchData.profiles ?? routeProfilesFromWorkspaceRecords({
      artifacts: workbenchData.artifacts,
      labels,
      locale,
      profileReadmes: workbenchData.profileReadmes,
      sessions: workbenchData.sessions,
      workspaces: workbenchData.workspaces,
    }),
    [labels, locale, workbenchData],
  )
  const allProfiles = projectedProfiles.length > 0 ? projectedProfiles : defaultSeedProfiles
  const visibleProfiles = useMemo(
    () => allProfiles.filter(profile => matchesProfileQuery(profile, profileQuery)),
    [allProfiles, profileQuery],
  )
  const selectedProfile = allProfiles.find(profile => profile.id === activeProfileId)
    ?? allProfiles.find(profile => profile.id === selectedProfileId)
    ?? visibleProfiles[0]
    ?? allProfiles[0]
    ?? null
  const selectedProfileReadme = selectedProfile
    ? workbenchData.profileReadmes[selectedProfile.id] ?? defaultProfileReadmes[selectedProfile.id] ?? defaultProfileReadmes['profile-ben']!
    : ''
  const parsedProfile = selectedProfile ? parseHrProfileReadme(selectedProfileReadme) : null
  const selectedRevisionArtifact = useMemo(
    () => selectedProfile ? selectProfileRevisionArtifact(workbenchData.artifacts, selectedProfile.id) : null,
    [selectedProfile, workbenchData.artifacts],
  )
  const sourceCards = selectedProfile
    ? labels.sourceCards(selectedProfile.evidenceCount, selectedProfile.sessionCount ?? 0, selectedProfile.reviewCount ?? 0)
    : []

  useEffect(() => {
    if (!selectedProfile)
      return
    if (selectedProfile.id !== activeProfileId)
      setActiveProfileId(selectedProfile.id)
  }, [activeProfileId, selectedProfile])

  const refreshWorkbenchData = useCallback(async () => {
    if (standalonePreview)
      return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const next = await localApi.loadWorkbenchData({
        workerId: hostData.workerId,
        workspaceId: hostData.workspaceId,
      })
      setWorkbenchData(current => mergeWorkbenchData(current, next))
    }
    catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setRefreshing(false)
    }
  }, [hostData.workerId, hostData.workspaceId, localApi, standalonePreview])

  useEffect(() => {
    void refreshWorkbenchData()
  }, [refreshWorkbenchData])

  useEffect(() => {
    let cancelled = false
    if (!selectedProfile) {
      setRevisionReview(null)
      return
    }
    if (!selectedRevisionArtifact) {
      setRevisionReview(buildProfileRevisionReview({
        artifactContent: '',
        artifactLoading: false,
        currentProfileContent: selectedProfileReadme,
        currentProfileLoading: false,
        hasArtifact: false,
      }))
      return
    }
    if (standalonePreview) {
      setRevisionReview(buildProfileRevisionReview({
        artifactContent: '',
        artifactLoading: false,
        currentProfileContent: selectedProfileReadme,
        currentProfileLoading: false,
        hasArtifact: false,
      }))
      return
    }

    setRevisionReview(buildProfileRevisionReview({
      artifactContent: '',
      artifactLoading: true,
      currentProfileContent: selectedProfileReadme,
      currentProfileLoading: false,
      hasArtifact: true,
    }))

    void localApi.readWorkspaceFile(selectedProfile.id, selectedRevisionArtifact.path)
      .then((artifactContent) => {
        if (cancelled)
          return
        setRevisionReview(buildProfileRevisionReview({
          artifactContent,
          artifactLoading: false,
          currentProfileContent: selectedProfileReadme,
          currentProfileLoading: false,
          hasArtifact: true,
        }))
      })
      .catch((error) => {
        if (cancelled)
          return
        setRevisionReview(buildProfileRevisionReview({
          artifactContent: '',
          artifactError: error instanceof Error ? error.message : String(error),
          artifactLoading: false,
          currentProfileContent: selectedProfileReadme,
          currentProfileLoading: false,
          hasArtifact: true,
        }))
      })

    return () => {
      cancelled = true
    }
  }, [localApi, selectedProfile, selectedProfileReadme, selectedRevisionArtifact, standalonePreview])

  function selectProfile(profile: HrRouteProfile) {
    setActiveProfileId(profile.id)
    setProfilePatchReviewOpen(false)
    setSubmitError(null)
  }

  async function submitComposer(input: HrProfileComposerSubmitInput) {
    if (!selectedProfile)
      throw new Error(labels.selectProfileFirst)
    if (standalonePreview)
      throw new Error('Standalone preview does not create Host sessions. Open this app from Worker Web to submit a real profile draft.')
    setSubmitting(true)
    setSubmitError(null)
    try {
      const materials = await uploadCandidateMaterials({
        api: localApi,
        attachments: input.attachments,
        materials: input.materials,
        workspaceId: selectedProfile.id,
      })
      const { session } = await localApi.createProfileUpdateDraftSession(
        hostData.workerId,
        selectedProfile.id,
        createProfileUpdateDraftSessionPayload({
          appId: hostData.appId,
          attachedMaterials: materials,
          profileName: selectedProfile.name,
          draftType: input.draft.templateId,
          userInput: input.context,
        }),
      )
      setWorkbenchData(current => ({
        ...current,
        sessions: [session, ...current.sessions.filter(item => item.id !== session.id)],
      }))
      onSessionCreated?.(session)
      await refreshWorkbenchData()
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSubmitError(message)
      throw new Error(message)
    }
    finally {
      setSubmitting(false)
    }
  }

  async function approveProfileRevision() {
    if (!selectedProfile || !selectedRevisionArtifact || revisionReview?.status !== 'ready')
      return
    setApprovingRevision(true)
    setRefreshError(null)
    try {
      await localApi.writeProfileReadme(selectedProfile.id, {
        artifactId: selectedRevisionArtifact.id,
        profileMarkdown: revisionReview.proposedMarkdown,
      })
      setProfilePatchReviewOpen(false)
      await refreshWorkbenchData()
    }
    catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setApprovingRevision(false)
    }
  }

  return (
    <>
      <section
        data-slot="hr-route-surface"
        data-layout="reading-room-primary"
        data-left-panel={leftPanelOpen ? 'open' : 'closed'}
        data-right-panel={rightPanelOpen ? 'open' : 'closed'}
        className={cn(
          'hr-reading-room-grid grid h-full max-h-full min-h-0 gap-0 overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10',
        )}
      >
        {leftPanelOpen
          ? (
              <ProfileListColumn
                labels={labels}
                profileQuery={profileQuery}
                profiles={visibleProfiles}
                selectedProfileId={selectedProfile?.id}
                totalProfileCount={allProfiles.length}
                onNewProfile={() => setCreateProfileOpen(true)}
                onProfileQueryChange={setProfileQuery}
                onSelectProfile={selectProfile}
              />
            )
          : null}
        <ProfileReadingRoomColumn
          labels={labels}
          leftPanelOpen={leftPanelOpen}
          parsedProfile={parsedProfile}
          profilePatchReviewOpen={profilePatchReviewOpen}
          refreshError={refreshError}
          refreshing={refreshing}
          revisionReview={revisionReview}
          rightPanelOpen={rightPanelOpen}
          reviewCount={selectedProfile?.reviewCount ?? 0}
          selectedProfile={selectedProfile}
          sourceCards={sourceCards}
          approvingProfileRevision={approvingRevision}
          onApproveProfileRevision={approveProfileRevision}
          onBackToReadingRoom={() => setProfilePatchReviewOpen(false)}
          onOpenSectionAction={() => setSubmitError(null)}
          onRefresh={refreshWorkbenchData}
          onReviewProfilePatch={() => setProfilePatchReviewOpen(true)}
          onToggleLeftPanel={() => setLeftPanelOpen(open => !open)}
          onToggleRightPanel={() => setRightPanelOpen(open => !open)}
        />
        {rightPanelOpen
          ? (
              <ProfileComposerColumn
                labels={labels}
                selectedProfile={selectedProfile}
                sessions={workbenchData.sessions}
                submitError={submitError}
                submitting={submitting}
                onComposerSubmit={submitComposer}
              />
            )
          : null}
      </section>
      <CreateProfileDialog
        labels={labels}
        open={createProfileOpen}
        onOpenChange={setCreateProfileOpen}
        onCreate={(input) => {
          const profile = createRouteProfileDraft(input, labels, allProfiles)
          setWorkbenchData(current => ({
            ...current,
            profileReadmes: {
              ...current.profileReadmes,
              [profile.id]: createDraftProfileReadme(profile, input.summary),
            },
            profiles: [profile, ...allProfiles.filter(item => item.id !== profile.id)],
          }))
          setActiveProfileId(profile.id)
          setProfilePatchReviewOpen(false)
          setProfileQuery('')
        }}
      />
    </>
  )
}

export function readHrHostDataFromDocument(doc: Document | null = typeof document === 'undefined' ? null : document): HrMicroAppHostData {
  return readHrWorkbenchHostData({ document: doc })
}

interface CreateProfileInput {
  lifecycle: PersonLifecycle
  name: string
  summary: string
}

function CreateProfileDialog({
  labels,
  onCreate,
  onOpenChange,
  open,
}: {
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>
  onCreate: (input: CreateProfileInput) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [name, setName] = useState('')
  const [lifecycle, setLifecycle] = useState<PersonLifecycle>('candidate')
  const [summary, setSummary] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName)
      return
    onCreate({
      lifecycle,
      name: trimmedName,
      summary: summary.trim(),
    })
    setName('')
    setLifecycle('candidate')
    setSummary('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.createProfileDialogTitle}</DialogTitle>
          <DialogDescription>{labels.createProfileDialogDescription}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hr-create-profile-name">{labels.createProfileNameLabel}</FieldLabel>
              <Input
                id="hr-create-profile-name"
                autoFocus
                required
                value={name}
                placeholder={labels.createProfileNamePlaceholder}
                onChange={event => setName(event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hr-create-profile-lifecycle">{labels.createProfileLifecycleLabel}</FieldLabel>
              <Select value={lifecycle} onValueChange={value => setLifecycle(value as PersonLifecycle)}>
                <SelectTrigger id="hr-create-profile-lifecycle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(['candidate', 'employee', 'alumni'] as const).map(option => (
                      <SelectItem key={option} value={option}>
                        {labels.lifecycleLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="hr-create-profile-summary">{labels.createProfileSummaryLabel}</FieldLabel>
              <Textarea
                id="hr-create-profile-summary"
                value={summary}
                placeholder={labels.createProfileSummaryPlaceholder}
                onChange={event => setSummary(event.currentTarget.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{labels.createProfileCancel}</Button>
            <Button type="submit">{labels.createProfileSubmit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function createRouteProfileDraft(
  input: CreateProfileInput,
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>,
  existingProfiles: HrRouteProfile[],
): HrRouteProfile {
  const id = uniqueProfileId(input.name, existingProfiles)
  const lifecycleLabel = labels.lifecycleLabels[input.lifecycle]
  return {
    evidenceCount: 0,
    id,
    lifecycle: input.lifecycle,
    name: input.name,
    nextAction: labels.nextSteps.profileSnapshot,
    profileTitle: labels.profileHeaderTitle(input.name),
    reviewCount: 0,
    reviewStatus: labels.moments.intakeNeeded,
    sessionCount: 0,
    stage: lifecycleLabel,
    status: 'draft',
    summary: input.summary || `${lifecycleLabel} · ${labels.moments.intakeNeeded}`,
  }
}

function createDraftProfileReadme(profile: HrRouteProfile, summary: string): string {
  const body = summary || 'No accepted profile summary yet.'
  return [
    `# ${profile.profileTitle ?? `${profile.name} People Profile`}`,
    '',
    '> Draft profile workspace. The HR Soul App writes accepted profile updates to README.md.',
    '',
    '## Current Profile Summary',
    '',
    body,
    '',
    '## Identity And Basics',
    '',
    'No accepted content in this section yet.',
    '',
    '## Role Context And Responsibilities',
    '',
    'No accepted content in this section yet.',
    '',
    '## Capabilities And Stack',
    '',
    'No accepted content in this section yet.',
    '',
    '## Confirmed Facts',
    '',
    'No accepted content in this section yet.',
    '',
    '## Evidence Status',
    '',
    'No accepted evidence attached yet.',
    '',
    '## Risks And Gaps',
    '',
    '- Evidence is missing.',
    '',
    '## Next HR Actions',
    '',
    `- ${profile.nextAction}.`,
    '',
    '## Profile Update State',
    '',
    profile.reviewStatus,
    '',
    '## Accepted External Sections',
    '',
    '- None yet.',
  ].join('\n')
}

function uniqueProfileId(name: string, existingProfiles: HrRouteProfile[]): string {
  const usedIds = new Set(existingProfiles.map(profile => profile.id))
  const stem = slugifyProfileName(name) || 'profile'
  let candidate = `profile-${stem}`
  let index = 2
  while (usedIds.has(candidate)) {
    candidate = `profile-${stem}-${index}`
    index += 1
  }
  return candidate
}

function slugifyProfileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function useHostData(initialHostData: HrMicroAppHostData | undefined): [HrMicroAppHostData, (data: HrMicroAppHostData) => void] {
  const [hostData, setHostData] = useState<HrMicroAppHostData>(() => initialHostData ?? readHrHostDataFromDocument())

  useEffect(() => {
    if (initialHostData)
      setHostData(initialHostData)
  }, [initialHostData])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const api = window.microApp
    if (!api) {
      setHostData(current => ({ ...current, ...readHrHostDataFromDocument() }))
      return
    }
    const receiveHostData = (value: unknown) => {
      const normalized = normalizeHrWorkbenchHostData({
        hostData: value,
        search: window.location.search,
      })
      window.__AIWORKER_MICRO_APP_HOST_DATA__ = normalized
      setHostData(normalized)
    }
    if (typeof api.addDataListener === 'function')
      api.addDataListener(receiveHostData, true)
    if (typeof api.getData === 'function')
      receiveHostData(api.getData())
    return () => {
      if (typeof api.removeDataListener === 'function')
        api.removeDataListener(receiveHostData)
    }
  }, [])

  return [hostData, setHostData]
}

function routeProfilesFromWorkspaceRecords(input: {
  artifacts: LocalArtifact[]
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>
  locale: HrLocale
  profileReadmes: Record<string, string>
  sessions: LocalSession[]
  workspaces: LocalWorkspace[]
}): HrRouteProfile[] {
  if (input.workspaces.length === 0)
    return []

  const projected = buildPersonProfiles(
    input.workspaces,
    input.sessions,
    input.artifacts,
    input.profileReadmes,
    input.labels,
    input.locale,
  )

  return buildProfileListSections(projected, input.labels).flatMap(section =>
    section.profiles.map(profile => ({
      evidenceCount: profile.artifacts.length,
      id: profile.id,
      lifecycle: profile.lifecycle,
      name: profile.name,
      nextAction: profile.nextStep,
      profileTitle: input.labels.profileHeaderTitle(profile.name),
      reviewCount: profile.reviewState === 'accepted' ? 1 : 0,
      reviewStatus: profile.moment,
      sessionCount: profile.sessions.length,
      stage: input.labels.lifecycleLabels[profile.lifecycle],
      status: profile.reviewTone === 'good' ? 'reviewed' : profile.artifacts.length > 0 ? 'ready-for-review' : 'draft',
      summary: profile.detail,
    })),
  )
}

function matchesProfileQuery(profile: HrRouteProfile, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized)
    return true
  return [
    profile.name,
    profile.profileTitle ?? '',
    profile.stage,
    profile.status,
    profile.summary,
    profile.reviewStatus,
    profile.nextAction,
  ].some(value => value.toLowerCase().includes(normalized))
}

function mergeWorkbenchData(current: HrPeopleWorkbenchData, next: Partial<HrPeopleWorkbenchData>): HrPeopleWorkbenchData {
  return {
    artifacts: next.artifacts ?? current.artifacts,
    profileReadmes: next.profileReadmes ? { ...current.profileReadmes, ...next.profileReadmes } : current.profileReadmes,
    profiles: next.profiles ?? current.profiles,
    sessions: next.sessions ?? current.sessions,
    workspaces: next.workspaces ?? current.workspaces,
  }
}

function selectProfileRevisionArtifact(artifacts: LocalArtifact[], workspaceId: string): LocalArtifact | null {
  return artifacts
    .filter(artifact => artifact.workspaceId === workspaceId && artifact.status !== 'missing' && profileArtifactRank(artifact) > 0)
    .sort((a, b) => {
      const aRank = profileArtifactRank(a)
      const bRank = profileArtifactRank(b)
      if (aRank !== bRank)
        return bRank - aRank
      return b.updatedAt.localeCompare(a.updatedAt)
    })[0] ?? null
}

function profileArtifactRank(artifact: LocalArtifact): number {
  if (artifact.kind === 'profile-update-draft')
    return 3
  if (artifact.kind === 'person-profile')
    return 2
  if (String(artifact.metadataJson.outputKind ?? '') === 'profile-update-draft')
    return 1
  return 0
}

async function uploadCandidateMaterials(input: {
  api: HrLocalApiClient
  attachments: HrProfileComposerSubmitInput['attachments']
  materials: HrProfileComposerSubmitInput['materials']
  workspaceId: string
}): Promise<ComposerMaterial[]> {
  if (input.attachments.length === 0)
    return []

  const materials = candidateMaterialsFromSessionComposerMaterials(input.materials)
  for (const material of materials) {
    await input.api.writeCandidateMaterial(input.workspaceId, material)
  }
  return materials
}
