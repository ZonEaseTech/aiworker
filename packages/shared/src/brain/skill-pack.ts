import type { SkillMetadata } from '../capabilities'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { skillMetadataSchema } from '../capabilities'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

const brainSkillMetadataSchema = skillMetadataSchema.extend({
  id: z.string().min(1),
})

export interface BrainSkillPack {
  id: string
  installPath: string
  metadata: BrainSkillPackMetadata
  skillMd: string
  sourcePath: string
}

export type BrainSkillPackMetadata = SkillMetadata & {
  id: string
}

const brainSkillPackSourceSchema = z.object({
  expectedId: z.string().min(1),
  skillMd: z.string().min(1),
  sourcePath: z.string().min(1),
})

export type BrainSkillPackSource = z.infer<typeof brainSkillPackSourceSchema>

function parseBrainSkillFrontmatter(raw: string, sourcePath: string): BrainSkillPackMetadata {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match)
    throw new Error(`Brain skill pack ${sourcePath} is missing YAML frontmatter`)

  let parsed: unknown
  try {
    parsed = parseYaml(match[1] ?? '')
  }
  catch (err) {
    throw new Error(`Brain skill pack ${sourcePath} has invalid YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    return brainSkillMetadataSchema.parse(parsed)
  }
  catch (err) {
    if (err instanceof z.ZodError)
      throw new Error(`Brain skill pack ${sourcePath} does not satisfy SkillMetadata: ${err.issues.map(issue => issue.message).join('; ')}`)
    throw err
  }
}

export function createBrainSkillPack(input: BrainSkillPackSource): BrainSkillPack {
  const source = brainSkillPackSourceSchema.parse(input)
  const metadata = parseBrainSkillFrontmatter(source.skillMd, source.sourcePath)
  if (metadata.id !== source.expectedId)
    throw new Error(`Brain skill pack ${source.sourcePath} declares id "${metadata.id}" but expected "${source.expectedId}"`)

  return {
    id: metadata.id,
    installPath: `${metadata.id}/SKILL.md`,
    metadata,
    skillMd: source.skillMd.trimEnd(),
    sourcePath: source.sourcePath,
  }
}

export function brainSkillPackSeedFiles(packs: readonly BrainSkillPack[]): Record<string, string> {
  return Object.fromEntries(packs.map(pack => [pack.installPath, `${pack.skillMd}\n`]))
}
