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

export function createNoopExecutor(): LocalExecutor {
  return {
    async run(input) {
      const outputKind = typeof input.metadata?.outputKind === 'string' ? input.metadata.outputKind : 'business-artifact'
      const skillName = typeof input.metadata?.skillName === 'string' ? input.metadata.skillName : 'Local Soul artifact'
      return {
        summary: `Recorded local run ${input.runId}.`,
        artifacts: [
          {
            kind: outputKind,
            path: `runs/${input.runId}/${outputKind}.md`,
            title: skillName,
            content: `# ${skillName}\n\n${input.prompt}\n`,
          },
        ],
        review: {
          verdict: 'needs_review',
          findings: [{ message: 'Review this run before accepting lessons.' }],
          risks: [],
        },
        lessons: [],
      }
    },
  }
}
