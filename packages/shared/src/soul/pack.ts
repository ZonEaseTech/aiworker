import type { SoulModule } from './module'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { soulModuleSchema } from './module'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export interface SoulPack {
  agentMd: string
  module: SoulModule
  soulBody: string
  soulMd: string
  sourcePath: string
}

const soulPackSourceSchema = z.object({
  agentMd: z.string().min(1),
  expectedId: z.string().min(1),
  soulMd: z.string().min(1),
  sourcePath: z.string().min(1),
})

export type SoulPackSource = z.infer<typeof soulPackSourceSchema>

export function stripMarkdownFrontmatter(raw: string): string {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match)
    return raw.trim()
  return (match[2] ?? '').trim()
}

function parseSoulModuleFrontmatter(raw: string, sourcePath: string): SoulModule {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match)
    throw new Error(`Soul pack ${sourcePath} is missing YAML frontmatter`)

  let parsed: unknown
  try {
    parsed = parseYaml(match[1] ?? '')
  }
  catch (err) {
    throw new Error(`Soul pack ${sourcePath} has invalid YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    return soulModuleSchema.parse(parsed)
  }
  catch (err) {
    if (err instanceof z.ZodError)
      throw new Error(`Soul pack ${sourcePath} does not satisfy SoulModule: ${err.issues.map(issue => issue.message).join('; ')}`)
    throw err
  }
}

export function createSoulPack(input: SoulPackSource): SoulPack {
  const source = soulPackSourceSchema.parse(input)
  const module = parseSoulModuleFrontmatter(source.soulMd, source.sourcePath)
  if (module.manifest.id !== source.expectedId)
    throw new Error(`Soul pack ${source.sourcePath} declares id "${module.manifest.id}" but expected "${source.expectedId}"`)
  return {
    agentMd: source.agentMd.trimEnd(),
    module,
    soulBody: stripMarkdownFrontmatter(source.soulMd),
    soulMd: source.soulMd.trimEnd(),
    sourcePath: source.sourcePath,
  }
}
