import process from 'node:process'

export interface LocalExecutorArtifact {
  path: string
  content: string
  kind?: string
  title?: string
}

export interface LocalExecutorReview {
  verdict?: 'pass' | 'warn' | 'fail' | 'needs_review'
  findings?: Record<string, unknown>[]
  risks?: Record<string, unknown>[]
}

export interface LocalExecutorLesson {
  statement: string
  evidence?: Record<string, unknown>[]
}

export interface LocalExecutorInput {
  executor?: string
  workspaceId: string
  workspaceRoot: string
  runId: string
  prompt: string
  metadata?: Record<string, unknown>
}

export interface LocalExecutorResult {
  summary: string
  artifacts?: LocalExecutorArtifact[]
  review?: LocalExecutorReview
  lessons?: LocalExecutorLesson[]
  metadata?: Record<string, unknown>
}

export interface LocalExecutor {
  run: (input: LocalExecutorInput) => Promise<LocalExecutorResult>
}

export function createLocalTemplateExecutor(): LocalExecutor {
  return {
    async run(input) {
      const executionMode = readString(input.metadata?.executionMode, 'local-cli')
      if (executionMode === 'byok')
        return runByokExecutor(input)
      return renderStructuredArtifact(input)
    },
  }
}

async function runByokExecutor(input: LocalExecutorInput): Promise<LocalExecutorResult> {
  const byok = isRecord(input.metadata?.byok) ? input.metadata.byok : {}
  const apiKeyRef = readString(byok.apiKeyRef, '')
  const apiKey = resolveApiKey(apiKeyRef)
  const baseUrl = readString(byok.baseUrl, 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = readString(byok.model, 'gpt-4o')
  const artifact = await requestOpenAICompatibleArtifact({ apiKey, baseUrl, input, model })
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Local Soul artifact')
  return {
    artifacts: [
      {
        content: artifact,
        kind: outputKind,
        path: `runs/${input.runId}/${sanitizePathPart(outputKind)}.md`,
        title: skillName,
      },
    ],
    lessons: [],
    metadata: { executionSource: 'byok', model },
    review: {
      findings: [{ message: 'BYOK artifact generated; human review is still required before memory admission.' }],
      risks: [],
      verdict: 'needs_review',
    },
    summary: `Generated ${skillName} with BYOK provider ${model}.`,
  }
}

function renderStructuredArtifact(input: LocalExecutorInput): LocalExecutorResult {
  const outputKind = readString(input.metadata?.outputKind, 'business-artifact')
  const skillName = readString(input.metadata?.skillName, 'Local Soul artifact')
  const soulName = readString(input.metadata?.soulName, 'Vertical')
  const selectedSoulId = readString(input.metadata?.selectedSoulId, 'soul')
  const selectedSkillId = readString(input.metadata?.selectedSkillId, 'skill')
  const context = extractSection(input.prompt, 'Business context') || input.prompt
  const inputHints = extractBullets(input.prompt, 'Input hints')
  const rubric = extractBullets(input.prompt, 'Review rubric')
  const contextLines = context.split('\n').map(line => line.trim()).filter(Boolean)
  const evidenceSummary = contextLines.slice(0, 5)
  const contextIsThin = context.trim().length < 80

  return {
    summary: `Generated ${skillName} with AIWorker workspace template runner.`,
    artifacts: [
      {
        kind: outputKind,
        path: `runs/${input.runId}/${sanitizePathPart(outputKind)}.md`,
        title: skillName,
        content: [
          `# ${skillName}`,
          '',
          `- Soul: ${soulName}`,
          `- Soul id: ${selectedSoulId}`,
          `- Capability template: ${selectedSkillId}`,
          `- Output kind: ${outputKind}`,
          `- Run id: ${input.runId}`,
          '',
          '## Project Context',
          context.trim(),
          '',
          '## Evidence Summary',
          ...asBullets(evidenceSummary.length > 0 ? evidenceSummary : ['No detailed evidence was supplied.']),
          '',
          '## Draft Business Artifact',
          ...asBullets([
            `Produce a ${outputKind} from the supplied project context.`,
            'Separate confirmed facts from assumptions before human review.',
            'Use the next-action section below to decide whether more evidence is needed.',
          ]),
          '',
          '## Next Actions',
          ...asBullets([
            contextIsThin ? 'Add more source evidence before accepting this artifact.' : 'Review the artifact against the rubric and mark follow-up gaps.',
            `Route follow-up to the owner of the ${soulName} project.`,
          ]),
          '',
          '## Input Hints Covered',
          ...asBullets(inputHints.length > 0 ? inputHints : ['No input hints were available.']),
          '',
          '## Review Rubric',
          ...asBullets(rubric.length > 0 ? rubric : ['Human reviewer should check evidence, risks, and next action.']),
          '',
          '## Risks And Assumptions',
          ...asBullets([
            contextIsThin ? 'Input context is short, so confidence should remain low.' : 'Confidence depends on the quality and completeness of supplied evidence.',
            'This workspace template runner does not claim external system evidence unless connectors provide it.',
          ]),
        ].join('\n'),
      },
    ],
    review: {
      verdict: 'needs_review',
      findings: [
        { message: 'Structured artifact generated from the selected Soul, template, and project context.' },
        { message: contextIsThin ? 'Project context is thin; request additional evidence before acceptance.' : 'Project context has enough substance for a first human review.' },
      ],
      risks: contextIsThin ? [{ message: 'Low-context run may miss important business evidence.' }] : [],
    },
    lessons: [
      {
        statement: `${soulName} ${skillName} artifacts should keep evidence, assumptions, risks, and next actions separated.`,
        evidence: [{ kind: 'run', runId: input.runId }],
      },
    ],
    metadata: {
      executionSource: 'workspace-template',
    },
  }
}

async function requestOpenAICompatibleArtifact({
  apiKey,
  baseUrl,
  input,
  model,
}: {
  apiKey: string
  baseUrl: string
  input: LocalExecutorInput
  model: string
}): Promise<string> {
  const skillName = readString(input.metadata?.skillName, 'Local Soul artifact')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content: 'You are AIWorker generating a concise business artifact. Return markdown only. Keep evidence, assumptions, risks, and next actions clearly separated.',
          role: 'system',
        },
        {
          content: input.prompt,
          role: 'user',
        },
      ],
      model,
      temperature: 0.2,
    }),
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`BYOK provider failed for ${skillName}: HTTP ${response.status}`)
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content)
    throw new Error(`BYOK provider returned no artifact content for ${skillName}.`)
  return content
}

function resolveApiKey(ref: string): string {
  const normalized = ref.trim()
  if (!normalized)
    throw new Error('BYOK mode requires an API key reference such as env:OPENAI_API_KEY.')
  const envName = normalized.startsWith('env:') ? normalized.slice(4) : normalized
  if (!/^[A-Z_]\w*$/i.test(envName))
    throw new Error('BYOK API key reference must be env:NAME or NAME.')
  const value = process.env[envName]
  if (!value)
    throw new Error(`BYOK API key environment variable is not set: ${envName}.`)
  return value
}

function extractSection(text: string, heading: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.trim().toLowerCase() === `${heading.toLowerCase()}:`)
  if (start < 0)
    return ''
  const collected: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Z][A-Za-z ]+:$/.test(line.trim()))
      break
    collected.push(line)
  }
  return collected.join('\n').trim()
}

function extractBullets(text: string, heading: string): string[] {
  return extractSection(text, heading)
    .split('\n')
    .map(line => line.trim().replace(/^- /, ''))
    .filter(Boolean)
}

function asBullets(values: string[]): string[] {
  return values.map(value => `- ${value}`)
}

function sanitizePathPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
