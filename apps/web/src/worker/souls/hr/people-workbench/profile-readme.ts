export type HrProfileSectionId
  = | 'currentProfileSummary'
    | 'identityAndBasics'
    | 'roleContextAndResponsibilities'
    | 'capabilitiesAndStack'
    | 'confirmedFacts'
    | 'evidenceStatus'
    | 'risksAndGaps'
    | 'nextHrActions'
    | 'reviewState'
    | 'acceptedExternalSections'

export interface HrProfileSectionDefinition {
  id: HrProfileSectionId
  title: string
}

export interface HrProfileReadmeSection {
  body: string
  heading: string
}

export interface HrProfileReadme {
  intro: string
  sections: Partial<Record<HrProfileSectionId, HrProfileReadmeSection>>
  title: string | null
  unknownSections: HrProfileReadmeSection[]
}

export const HR_PROFILE_SECTION_ORDER = [
  { id: 'currentProfileSummary', title: 'Current Profile Summary' },
  { id: 'identityAndBasics', title: 'Identity And Basics' },
  { id: 'roleContextAndResponsibilities', title: 'Role Context And Responsibilities' },
  { id: 'capabilitiesAndStack', title: 'Capabilities And Stack' },
  { id: 'confirmedFacts', title: 'Confirmed Facts' },
  { id: 'evidenceStatus', title: 'Evidence Status' },
  { id: 'risksAndGaps', title: 'Risks And Gaps' },
  { id: 'nextHrActions', title: 'Next HR Actions' },
  { id: 'reviewState', title: 'Review State' },
  { id: 'acceptedExternalSections', title: 'Accepted External Sections' },
] as const satisfies readonly HrProfileSectionDefinition[]

const sectionByTitle = new Map<string, HrProfileSectionId>(
  HR_PROFILE_SECTION_ORDER.map(section => [normalizeHeading(section.title), section.id]),
)

export function parseHrProfileReadme(markdown: string): HrProfileReadme {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  let title: string | null = null
  const headings: Array<{ heading: string, lineIndex: number }> = []

  lines.forEach((line, lineIndex) => {
    const levelOneHeading = readMarkdownHeading(line, 1)
    if (title === null && levelOneHeading)
      title = levelOneHeading

    const levelTwoHeading = readMarkdownHeading(line, 2)
    if (levelTwoHeading)
      headings.push({ heading: levelTwoHeading, lineIndex })
  })

  const firstHeadingLine = headings[0]?.lineIndex ?? lines.length
  const intro = lines.slice(0, firstHeadingLine).join('\n').trim()
  const sections: Partial<Record<HrProfileSectionId, HrProfileReadmeSection>> = {}
  const unknownSections: HrProfileReadmeSection[] = []

  headings.forEach((match, index) => {
    const heading = match.heading
    const bodyStartLine = match.lineIndex + 1
    const bodyEndLine = headings[index + 1]?.lineIndex ?? lines.length
    const body = lines.slice(bodyStartLine, bodyEndLine).join('\n').trim()
    const id = sectionByTitle.get(normalizeHeading(heading))
    const section = { body, heading }
    if (id)
      sections[id] = section
    else
      unknownSections.push(section)
  })

  return {
    intro,
    sections,
    title,
    unknownSections,
  }
}

export function getHrProfileSection(readme: HrProfileReadme, id: HrProfileSectionId): HrProfileReadmeSection | null {
  return readme.sections[id] ?? null
}

function normalizeHeading(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

function readMarkdownHeading(line: string, level: 1 | 2): string | null {
  const prefix = '#'.repeat(level)
  if (!line.startsWith(`${prefix} `))
    return null
  return line.slice(prefix.length + 1).trim() || null
}
