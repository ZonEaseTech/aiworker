import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { HrWorkbenchCopy } from '../copy'
import type { ProfileRevisionReviewState, ProfileRevisionSectionChange } from '../revision-review'

import { ArrowLeft, CheckCircle2, FileDiff, ShieldAlert } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { WorkbenchSectionTitle } from '../../../common'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface ProfilePatchReviewProps {
  artifact: LocalArtifact | null
  labels: HrWorkbenchCopy
  profileRevisionSubmitting: boolean
  review: ProfileRevisionReviewState
  onBack: () => void
  onPromoteProfileRevision: () => Promise<void> | void
}

export function HrProfilePatchReview({
  artifact,
  labels,
  profileRevisionSubmitting,
  review,
  onBack,
  onPromoteProfileRevision,
}: ProfilePatchReviewProps) {
  const canApprove = Boolean(artifact && review.status === 'ready' && review.changedSectionCount > 0 && !profileRevisionSubmitting)
  const statusTitle = review.status === 'ready' ? labels.profilePatchReadyTitle : labels.profilePatchBlockedTitle
  const statusDetail = review.status === 'ready'
    ? labels.profilePatchChangedSections(review.changedSectionCount)
    : labels.profilePatchBlockers(review.blockerCount || review.issues.length)
  async function handleApproveProfilePatch() {
    await onPromoteProfileRevision()
    onBack()
  }

  return (
    <section className="hr-profile-patch-review" aria-label={labels.profilePatchReviewTitle} data-testid="hr-profile-patch-review">
      <WorkbenchSectionTitle
        icon={<FileDiff size={15} />}
        title={labels.profilePatchReviewTitle}
        detail={artifact ? labels.profilePatchReviewDetail(artifact.title) : labels.artifactPreviewEmpty}
      />

      <div className={`hr-profile-patch-status ${review.status}`} role={review.status === 'ready' ? 'status' : 'alert'}>
        {review.status === 'ready' ? <CheckCircle2 aria-hidden="true" size={17} /> : <ShieldAlert aria-hidden="true" size={17} />}
        <span>
          <strong>{statusTitle}</strong>
          <small>{statusDetail}</small>
        </span>
      </div>

      {review.issues.length > 0
        ? (
            <ul className="hr-profile-patch-issues">
              {review.issues.map(issue => <li key={issue}>{issue}</li>)}
            </ul>
          )
        : null}

      {review.status === 'ready'
        ? (
            <>
              <ChangedSectionNav labels={labels} sections={review.changedSections} />
              {review.changedSections.length > 0
                ? (
                    <div className="hr-profile-patch-section-list">
                      {review.changedSections.map(section => (
                        <ProfilePatchSection key={section.id} labels={labels} section={section} />
                      ))}
                    </div>
                  )
                : <div className="hr-profile-patch-empty">{labels.profilePatchNoChanges}</div>}
            </>
          )
        : null}

      <div className="hr-profile-patch-actions">
        <button type="button" className="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={14} />
          <span>{labels.backToReadingRoom}</span>
        </button>
        <button
          type="button"
          className="primary"
          disabled={!canApprove}
          onClick={() => void handleApproveProfilePatch()}
        >
          <CheckCircle2 aria-hidden="true" size={14} />
          <span>{profileRevisionSubmitting ? labels.approvingProfileRevision : labels.approveProfileRevision}</span>
        </button>
      </div>
    </section>
  )
}

function ChangedSectionNav({
  labels,
  sections,
}: {
  labels: HrWorkbenchCopy
  sections: readonly ProfileRevisionSectionChange[]
}) {
  if (sections.length === 0)
    return null

  return (
    <nav className="hr-profile-patch-nav" aria-label={labels.changedSectionsTitle}>
      <strong>{labels.changedSectionsTitle}</strong>
      <div>
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => document.getElementById(`hr-profile-patch-section-${section.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          >
            <span className={`hr-section-patch-badge ${section.status}`} aria-hidden="true">{section.status === 'added' ? '+' : '~'}</span>
            <span>{section.title}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function ProfilePatchSection({
  labels,
  section,
}: {
  labels: HrWorkbenchCopy
  section: ProfileRevisionSectionChange
}) {
  const statusLabel = section.status === 'added' ? labels.profilePatchAddedLabel : labels.profilePatchChangedLabel
  return (
    <section id={`hr-profile-patch-section-${section.id}`} className="hr-profile-patch-section">
      <header>
        <span className={`hr-section-patch-badge ${section.status}`}>{section.status === 'added' ? '+' : '~'}</span>
        <span>
          <strong>{section.title}</strong>
          <small>{statusLabel}</small>
        </span>
      </header>
      <div className="hr-profile-patch-columns">
        <PatchColumn title={labels.currentReadmeTitle} content={section.currentMarkdown} empty={labels.currentProfileEmpty} />
        <PatchColumn title={labels.proposedReadmeTitle} content={section.proposedMarkdown} empty={labels.artifactPreviewEmpty} />
      </div>
    </section>
  )
}

function PatchColumn({
  content,
  empty,
  title,
}: {
  content: string
  empty: string
  title: string
}) {
  return (
    <div className="hr-profile-patch-column">
      <h3>{title}</h3>
      <Suspense fallback={<div className="hr-markdown-preview hr-profile-patch-markdown" />}>
        <MarkdownPreview
          className="hr-markdown-preview hr-profile-patch-markdown"
          content={content}
          empty={<span>{empty}</span>}
        />
      </Suspense>
    </div>
  )
}
