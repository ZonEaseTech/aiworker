import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { BookOpenText } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { WorkbenchSectionTitle } from '../../../common'
import { getHrProfileSection, HR_PROFILE_SECTION_ORDER, parseHrProfileReadme } from '../profile-readme'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface HrProfileReadingRoomProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  profilePreview: SoulProfilePreviewState
}

export function HrProfileReadingRoom({ focusedProfile, labels, profilePreview }: HrProfileReadingRoomProps) {
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)
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
      <section className="hr-reading-summary">
        <h2>{labels.profileDetailsTitle}</h2>
        <MarkdownSection content={summary?.body || parsed.intro} empty={labels.currentProfileEmpty} />
      </section>
      <div className="hr-reading-section-grid">
        {primarySections.map(section => (
          <section key={section.id} className={`hr-reading-section ${section.id}`}>
            <h3>{section.title}</h3>
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
