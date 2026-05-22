import type { ReactNode } from 'react'
import type { HrRouteProfile } from '../app'
import type { HrWorkbenchCopy } from '../copy'
import type { HrProfileSectionId, parseHrProfileReadme } from '../profile-readme'
import type { ProfileRevisionReviewState } from '../revision-review'

import {
  ArrowLeft01Icon,
  BookOpenTextIcon,
  CheckmarkCircle01Icon,
  DatabaseIcon,
  Edit02Icon,
  PanelLeftIcon,
  PanelRightIcon,
  RefreshIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ButtonGroup } from '@zonease/aiworker-ui/components/button-group'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@zonease/aiworker-ui/components/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Separator } from '@zonease/aiworker-ui/components/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@zonease/aiworker-ui/components/table'

import { getHrProfileSection, HR_PROFILE_SECTION_ORDER } from '../profile-readme'

type ParsedHrProfile = ReturnType<typeof parseHrProfileReadme>

export interface ProfileReadingRoomColumnProps {
  approvingProfileRevision?: boolean
  labels: HrWorkbenchCopy
  leftPanelOpen: boolean
  onApproveProfileRevision?: () => void
  onBackToReadingRoom: () => void
  onOpenSectionAction: () => void
  onRefresh?: () => void
  onReviewProfilePatch: () => void
  onToggleLeftPanel: () => void
  onToggleRightPanel: () => void
  profilePatchReviewOpen: boolean
  refreshError?: string | null
  refreshing?: boolean
  revisionReview?: null | ProfileRevisionReviewState
  rightPanelOpen: boolean
  reviewCount: number
  selectedProfile: HrRouteProfile | null
  sourceCards: Array<{ count: number, label: string }>
  parsedProfile: ParsedHrProfile | null
}

export function ProfileReadingRoomColumn({
  approvingProfileRevision = false,
  labels,
  leftPanelOpen,
  onApproveProfileRevision,
  onBackToReadingRoom,
  onOpenSectionAction,
  onRefresh,
  onReviewProfilePatch,
  onToggleLeftPanel,
  onToggleRightPanel,
  parsedProfile,
  profilePatchReviewOpen,
  refreshError = null,
  refreshing = false,
  revisionReview = null,
  rightPanelOpen,
  reviewCount,
  selectedProfile,
  sourceCards,
}: ProfileReadingRoomColumnProps) {
  const profileTitle = selectedProfile ? profileDisplayTitle(selectedProfile, labels) : labels.profileSelectionTitle
  const summarySection = parsedProfile ? getHrProfileSection(parsedProfile, 'currentProfileSummary') : null

  return (
    <section data-slot="hr-reading-room-column" className="h-full min-h-0">
      <Card size="sm" className="h-full min-h-0 rounded-none bg-background/45 py-3 ring-0">
        <CardHeader>
          <ItemContent className="min-w-0">
            <CardTitle>Reading Room</CardTitle>
            <CardDescription>
              {selectedProfile
                ? labels.profileHeaderDetail(selectedProfile.reviewStatus, selectedProfile.nextAction)
                : labels.profileSelectionBody}
            </CardDescription>
            {selectedProfile
              ? (
                  <ItemActions className="min-w-0 flex-wrap gap-1.5">
                    <Badge variant="secondary">{profileTitle}</Badge>
                    {sourceCards.map(source => (
                      <Badge key={source.label} variant="outline">
                        {source.label}
                        <span data-slot="hr-source-count">{source.count}</span>
                      </Badge>
                    ))}
                  </ItemActions>
                )
              : null}
          </ItemContent>
          <CardAction>
            <ButtonGroup aria-label={labels.workbenchPanelControlsLabel}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={leftPanelOpen ? 'Hide profile list' : 'Show profile list'}
                aria-pressed={leftPanelOpen}
                title={leftPanelOpen ? 'Hide profile list' : 'Show profile list'}
                onClick={onToggleLeftPanel}
              >
                <HugeiconsIcon icon={PanelLeftIcon} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={rightPanelOpen ? 'Hide composer' : 'Show composer'}
                aria-pressed={rightPanelOpen}
                title={rightPanelOpen ? 'Hide composer' : 'Show composer'}
                onClick={onToggleRightPanel}
              >
                <HugeiconsIcon icon={PanelRightIcon} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh profile" title="Refresh profile" disabled={refreshing} onClick={onRefresh}>
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={labels.evidenceConnectors} title={labels.evidenceConnectors}>
                <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Profile settings" title="Profile settings">
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
            </ButtonGroup>
          </CardAction>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          {refreshError
            ? (
                <Alert variant="destructive" className="mb-3">
                  <AlertDescription>{refreshError}</AlertDescription>
                </Alert>
              )
            : null}
          {!selectedProfile || !parsedProfile
            ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{labels.profileSelectionTitle}</EmptyTitle>
                    <EmptyDescription>{labels.profileSelectionBody}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            : profilePatchReviewOpen
              ? (
                  <ProfilePatchReviewPanel
                    labels={labels}
                    parsedProfile={parsedProfile}
                    revisionReview={revisionReview}
                    approvingProfileRevision={approvingProfileRevision}
                    onApproveProfileRevision={onApproveProfileRevision}
                    onBack={onBackToReadingRoom}
                  />
                )
              : (
                  <ItemGroup className="gap-4">
                    <ProfilePatchStrip
                      labels={labels}
                      revisionReview={revisionReview}
                      reviewCount={reviewCount}
                      selectedProfile={selectedProfile}
                      onReview={onReviewProfilePatch}
                    />

                    <ProfileSection
                      actionLabel={labels.runSectionDraft}
                      id="currentProfileSummary"
                      status="ready"
                      title={labels.profileDetailsTitle}
                      onAction={onOpenSectionAction}
                    >
                      <MarkdownBlock content={summarySection?.body || parsedProfile.intro} empty={labels.currentProfileEmpty} />
                    </ProfileSection>

                    {HR_PROFILE_SECTION_ORDER
                      .filter(section => section.id !== 'currentProfileSummary')
                      .map(section => (
                        <ProfileSection
                          key={section.id}
                          actionLabel={labels.profilePatchSectionAction(section.title)}
                          id={section.id}
                          status={sectionBadge(section.id) === '+' ? 'added' : 'changed'}
                          title={section.title}
                          onAction={onOpenSectionAction}
                        >
                          <MarkdownBlock
                            content={getHrProfileSection(parsedProfile, section.id)?.body ?? ''}
                            empty={labels.baseSectionEmpty}
                          />
                        </ProfileSection>
                      ))}
                  </ItemGroup>
                )}
        </CardContent>

      </Card>
    </section>
  )
}

function ProfilePatchStrip({
  labels,
  onReview,
  revisionReview,
  reviewCount,
  selectedProfile,
}: {
  labels: HrWorkbenchCopy
  onReview: () => void
  revisionReview?: null | ProfileRevisionReviewState
  reviewCount: number
  selectedProfile: HrRouteProfile
}) {
  if (selectedProfile.status !== 'ready-for-review')
    return null
  const changedSectionCount = revisionReview?.status && revisionReview.status !== 'empty'
    ? revisionReview.changedSectionCount
    : reviewCount

  return (
    <Item variant="muted" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle>{labels.profilePatchReadyTitle}</ItemTitle>
        <ItemDescription>
          {labels.profilePatchChangedSections(changedSectionCount)}
          {' · '}
          {labels.profilePatchStripDetail('Person Profile')}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {reviewCount > 0 ? <Badge variant="secondary">{labels.sourceCards(0, 0, reviewCount)[2]?.count ?? reviewCount}</Badge> : null}
        <Button type="button" size="sm" onClick={onReview}>{labels.reviewProfilePatchShort}</Button>
      </ItemActions>
    </Item>
  )
}

function ProfileSection({
  actionLabel,
  children,
  id,
  onAction,
  status,
  title,
}: {
  actionLabel: string
  children: ReactNode
  id: HrProfileSectionId
  onAction: () => void
  status: 'added' | 'changed' | 'ready'
  title: string
}) {
  return (
    <section data-slot="hr-profile-section" data-section-id={id} className="grid min-w-0 gap-3">
      <Item size="xs" className="px-0 py-0">
        <ItemContent className="min-w-0">
          <ItemTitle size="sm" className="max-w-full">{title}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Badge variant={status === 'added' ? 'secondary' : 'outline'} className="gap-1">
            <HugeiconsIcon icon={status === 'ready' ? BookOpenTextIcon : status === 'added' ? CheckmarkCircle01Icon : Edit02Icon} strokeWidth={2} aria-hidden="true" />
            {status === 'ready' ? 'Ready' : status === 'added' ? 'Added' : 'Changed'}
          </Badge>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={actionLabel} title={actionLabel} onClick={onAction}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
        </ItemActions>
      </Item>
      {children}
      <Separator />
    </section>
  )
}

function ProfilePatchReviewPanel({
  approvingProfileRevision = false,
  labels,
  parsedProfile,
  revisionReview,
  onApproveProfileRevision,
  onBack,
}: {
  approvingProfileRevision?: boolean
  labels: HrWorkbenchCopy
  onApproveProfileRevision?: () => void
  onBack: () => void
  parsedProfile: ParsedHrProfile
  revisionReview?: null | ProfileRevisionReviewState
}) {
  const fallbackSections = HR_PROFILE_SECTION_ORDER
    .map(section => ({
      body: getHrProfileSection(parsedProfile, section.id)?.body ?? '',
      currentMarkdown: '',
      id: section.id,
      proposedMarkdown: getHrProfileSection(parsedProfile, section.id)?.body ?? '',
      status: sectionBadge(section.id) === '+' ? 'added' : 'changed',
      title: section.title,
    }))
    .filter(section => section.proposedMarkdown.trim().length > 0)
  const reviewSections = revisionReview?.changedSections.length
    ? revisionReview.changedSections
    : fallbackSections
  const ready = revisionReview?.status === 'ready'
  const issues = revisionReview?.issues ?? []

  return (
    <ItemGroup data-slot="hr-profile-patch-review" className="gap-4">
      <Item variant="muted" size="sm">
        <ItemContent className="min-w-0">
          <ItemTitle>{labels.profilePatchReviewTitle}</ItemTitle>
          <ItemDescription>{labels.profilePatchReviewDetail('Person Profile')}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant={ready ? 'secondary' : 'outline'}>{labels.profilePatchChangedSections(reviewSections.length)}</Badge>
        </ItemActions>
      </Item>
      {issues.length > 0
        ? (
            <Alert variant="destructive">
              <AlertDescription>{issues.join(' ')}</AlertDescription>
            </Alert>
          )
        : null}
      <ItemGroup className="gap-2">
        <ItemTitle>{labels.changedSectionsTitle}</ItemTitle>
        <ItemActions className="min-w-0 flex-wrap justify-start">
          {reviewSections.map(section => (
            <Badge key={section.id} variant={section.status === 'added' ? 'default' : 'secondary'}>
              {section.title}
            </Badge>
          ))}
        </ItemActions>
      </ItemGroup>
      {reviewSections.length > 0
        ? reviewSections.map(section => (
            <section key={section.id} data-slot="hr-profile-patch-section" className="grid min-w-0 gap-3">
              <Item size="xs" className="px-0 py-0">
                <ItemContent className="min-w-0">
                  <ItemTitle size="sm" className="max-w-full">{section.title}</ItemTitle>
                  <ItemDescription>{section.status === 'added' ? labels.profilePatchAddedLabel : labels.profilePatchChangedLabel}</ItemDescription>
                </ItemContent>
              </Item>
              <MarkdownBlock content={section.proposedMarkdown} empty={labels.profilePatchNoChanges} />
              <Separator />
            </section>
          ))
        : <ItemDescription>{labels.profilePatchNoChanges}</ItemDescription>}
      <ItemActions className="justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
          {labels.backToReadingRoom}
        </Button>
        <Button type="button" size="sm" disabled={!ready || approvingProfileRevision} onClick={onApproveProfileRevision}>
          {approvingProfileRevision ? labels.approvingProfileRevision : labels.approveProfileRevision}
        </Button>
      </ItemActions>
    </ItemGroup>
  )
}

function MarkdownBlock({ content, empty }: { content: string, empty: string }) {
  const blocks = parseMarkdownBlocks(content)
  if (blocks.length === 0)
    return <ItemDescription>{empty}</ItemDescription>

  return (
    <ItemGroup data-slot="hr-markdown-block" className="gap-3">
      {blocks.map((block, index) => {
        if (block.kind === 'table')
          return <MarkdownTable key={`table-${index}`} lines={block.lines} />
        if (block.kind === 'list') {
          return (
            <ItemGroup key={`list-${index}`} asChild role="list" className="gap-1">
              <ul>
                {block.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </ItemGroup>
          )
        }
        return <p key={`paragraph-${index}`} data-slot="hr-markdown-paragraph">{block.text}</p>
      })}
    </ItemGroup>
  )
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const [headerLine, _separatorLine, ...bodyLines] = lines
  const headers = splitMarkdownTableRow(headerLine ?? '')
  const rows = bodyLines.map(splitMarkdownTableRow).filter(row => row.length > 0)

  if (headers.length === 0)
    return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map(header => <TableHead key={header} className="whitespace-normal align-top">{header}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={`${row.join('-')}-${rowIndex}`}>
            {headers.map((header, cellIndex) => (
              <TableCell key={`${header}-${cellIndex}`} className="whitespace-normal break-words align-top">
                {row[cellIndex] ?? ''}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

type MarkdownBlockModel
  = | { kind: 'list', items: string[] }
    | { kind: 'paragraph', text: string }
    | { kind: 'table', lines: string[] }

function parseMarkdownBlocks(content: string): MarkdownBlockModel[] {
  const lines = content.split('\n')
  const blocks: MarkdownBlockModel[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? ''
    if (!line) {
      index += 1
      continue
    }

    if (line.startsWith('|') && isMarkdownSeparator(lines[index + 1] ?? '')) {
      const tableLines = [line, lines[index + 1]?.trim() ?? '']
      index += 2
      while (index < lines.length && (lines[index]?.trim() ?? '').startsWith('|')) {
        tableLines.push(lines[index]?.trim() ?? '')
        index += 1
      }
      blocks.push({ kind: 'table', lines: tableLines })
      continue
    }

    if (line.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && (lines[index]?.trim() ?? '').startsWith('- ')) {
        items.push((lines[index]?.trim() ?? '').slice(2).trim())
        index += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (index < lines.length) {
      const nextLine = lines[index]?.trim() ?? ''
      if (!nextLine || nextLine.startsWith('|') || nextLine.startsWith('- '))
        break
      paragraphLines.push(nextLine)
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ') })
  }

  return blocks
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function isMarkdownSeparator(line: string): boolean {
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  return /^\s*(?:\|\s*)?:?-{3,}:?\s*(?:\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(line)
}

function profileDisplayTitle(profile: HrRouteProfile, labels: HrWorkbenchCopy): string {
  if (profile.profileTitle)
    return profile.profileTitle
  if (profile.name.endsWith('People Profile'))
    return profile.name
  return labels.profileHeaderTitle(profile.name)
}

function sectionBadge(sectionId: HrProfileSectionId): '+' | '~' | null {
  if (sectionId === 'identityAndBasics' || sectionId === 'roleContextAndResponsibilities' || sectionId === 'capabilitiesAndStack')
    return '+'
  if (sectionId === 'confirmedFacts' || sectionId === 'evidenceStatus' || sectionId === 'risksAndGaps' || sectionId === 'reviewState')
    return '~'
  return null
}
