import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { HrProfileSectionId } from '../profile-readme'
import type { ProfileRevisionReviewState, ProfileRevisionSectionChange } from '../revision-review'
import type { PersonProfile } from '../types'

import { BookOpenText, Play, ShieldAlert } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { WorkbenchSectionTitle } from '../../../common'
import { getHrProfileSection, HR_PROFILE_SECTION_ORDER, parseHrProfileReadme } from '../profile-readme'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface HrProfileReadingRoomProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  patchArtifact: LocalArtifact | null
  profilePreview: SoulProfilePreviewState
  profileRevisionReview: ProfileRevisionReviewState
  onReviewPatch: () => void
  onSectionAction: (sectionId: HrProfileSectionId) => void
}

export function HrProfileReadingRoom({
  focusedProfile,
  labels,
  patchArtifact,
  profilePreview,
  profileRevisionReview,
  onReviewPatch,
  onSectionAction,
}: HrProfileReadingRoomProps) {
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)
  const changedSectionById = useMemo(() => new Map(profileRevisionReview.changedSections.map(section => [section.id, section])), [profileRevisionReview.changedSections])
  const parsed = useMemo(() => {
    if (!profilePreviewMatchesProfile || profilePreview.loading || profilePreview.error)
      return null
    return parseHrProfileReadme(profilePreview.content)
  }, [profilePreview.content, profilePreview.error, profilePreview.loading, profilePreviewMatchesProfile])

  if (!profilePreviewMatchesProfile || profilePreview.loading)
    return <div className="hr-artifact-preview-empty">{labels.currentProfileLoading}</div>

  if (profilePreview.error)
    return <div className="hr-artifact-preview-empty" role="alert">{`${labels.currentProfileError} ${profilePreview.error}`}</div>

  if (!parsed)
    return <FullMarkdown content={profilePreview.content} empty={labels.currentProfileEmpty} />

  const summary = getHrProfileSection(parsed, 'currentProfileSummary')
  const primarySections = HR_PROFILE_SECTION_ORDER.filter(section => section.id !== 'currentProfileSummary')

  return (
    <article className="hr-reading-room" data-testid="hr-current-profile-summary">
      <WorkbenchSectionTitle
        icon={<BookOpenText size={15} />}
        title={parsed.title ?? focusedProfile?.name ?? labels.profileDetailsTitle}
        detail={focusedProfile ? labels.profileReadingRoomDetail(focusedProfile.name) : labels.profileReadingRoomFallback}
      />
      <ProfilePatchStrip
        artifact={patchArtifact}
        labels={labels}
        review={profileRevisionReview}
        onReviewPatch={onReviewPatch}
      />
      <section className="hr-reading-summary">
        <ReadingSectionHeading
          labels={labels}
          sectionId="currentProfileSummary"
          title={labels.profileDetailsTitle}
          change={changedSectionById.get('currentProfileSummary') ?? null}
          onReviewPatch={onReviewPatch}
          onSectionAction={onSectionAction}
        />
        <MarkdownSection content={summary?.body || parsed.intro} empty={labels.currentProfileEmpty} />
      </section>
      <div className="hr-reading-section-grid">
        {primarySections.map(section => (
          <section key={section.id} className={`hr-reading-section ${section.id}`}>
            <ReadingSectionHeading
              labels={labels}
              sectionId={section.id}
              title={section.title}
              change={changedSectionById.get(section.id) ?? null}
              onReviewPatch={onReviewPatch}
              onSectionAction={onSectionAction}
            />
            <MarkdownSection content={getHrProfileSection(parsed, section.id)?.body} empty={labels.baseSectionEmpty} />
          </section>
        ))}
        {parsed.unknownSections.length > 0
          ? (
              <section className="hr-reading-section">
                <h3>{labels.otherProfileNotesTitle}</h3>
                {parsed.unknownSections.map(section => (
                  <div key={section.heading} className="hr-reading-unknown-section">
                    <h4>{section.heading}</h4>
                    <MarkdownSection content={section.body} empty={labels.baseSectionEmpty} />
                  </div>
                ))}
              </section>
            )
          : null}
      </div>
    </article>
  )
}

function ProfilePatchStrip({
  artifact,
  labels,
  review,
  onReviewPatch,
}: {
  artifact: LocalArtifact | null
  labels: HrWorkbenchCopy
  review: ProfileRevisionReviewState
  onReviewPatch: () => void
}) {
  if (!artifact || review.status === 'empty' || review.status === 'loading')
    return null

  const ready = review.status === 'ready'
  return (
    <section className={`hr-profile-patch-strip ${review.status}`} aria-label={ready ? labels.profilePatchReadyTitle : labels.profilePatchBlockedTitle}>
      <span className="hr-profile-patch-strip-icon" aria-hidden="true">
        {ready ? <BookOpenText size={16} /> : <ShieldAlert size={16} />}
      </span>
      <span>
        <strong>{ready ? labels.profilePatchReadyTitle : labels.profilePatchBlockedTitle}</strong>
        <small>{ready ? labels.profilePatchChangedSections(review.changedSectionCount) : labels.profilePatchBlockers(review.blockerCount || review.issues.length)}</small>
      </span>
      <span className="hr-profile-patch-strip-source">{ready ? labels.profilePatchStripDetail(artifact.title) : labels.profilePatchBlockedStripDetail(artifact.title)}</span>
      <button type="button" className="secondary" onClick={onReviewPatch}>
        {labels.reviewProfilePatch}
      </button>
    </section>
  )
}

function ReadingSectionHeading({
  change,
  labels,
  sectionId,
  title,
  onReviewPatch,
  onSectionAction,
}: {
  change: ProfileRevisionSectionChange | null
  labels: HrWorkbenchCopy
  sectionId: HrProfileSectionId
  title: string
  onReviewPatch: () => void
  onSectionAction: (sectionId: HrProfileSectionId) => void
}) {
  const statusLabel = change?.status === 'added' ? labels.profilePatchAddedLabel : labels.profilePatchChangedLabel
  return (
    <div className="hr-reading-section-heading">
      <h3>{title}</h3>
      <div className="hr-reading-section-heading-actions">
        {change
          ? (
              <button
                type="button"
                className={`hr-section-patch-badge ${change.status}`}
                aria-label={labels.profilePatchSectionBadge(title, statusLabel)}
                title={labels.reviewProfilePatch}
                onClick={onReviewPatch}
              >
                <span aria-hidden="true">{change.status === 'added' ? '+' : '~'}</span>
              </button>
            )
          : null}
        <button
          type="button"
          className="hr-section-run-button"
          aria-label={labels.profilePatchSectionAction(title)}
          title={labels.runSectionProposal}
          onClick={() => onSectionAction(sectionId)}
        >
          <Play aria-hidden="true" size={12} />
        </button>
      </div>
    </div>
  )
}

function MarkdownSection({ content, empty }: { content: string | undefined, empty: string }) {
  return <FullMarkdown content={content?.trim() ?? ''} empty={empty} />
}

function FullMarkdown({ content, empty }: { content: string, empty: string }) {
  return (
    <Suspense fallback={<div className="hr-markdown-preview hr-reading-markdown" />}>
      <MarkdownPreview
        className="hr-markdown-preview hr-reading-markdown"
        content={content}
        empty={<span>{empty}</span>}
      />
    </Suspense>
  )
}
