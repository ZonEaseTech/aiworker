import { z } from 'zod'

export const SOUL_DESCRIPTOR_V1_PROTOCOL = 'soul/v1'
export const SOUL_DESCRIPTOR_OUTPUT_PATH = 'dist/soul.descriptor.json'

const safeDistPath = z.string().refine((value) => {
  if (value !== 'dist/workspace-template' && !value.startsWith('dist/workspace-template/'))
    return false
  if (value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#'))
    return false
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}, 'path must stay under dist/workspace-template')

export const soulDescriptorV1Schema = z.object({
  protocol: z.literal(SOUL_DESCRIPTOR_V1_PROTOCOL),
  identity: z.object({
    description: z.string().optional(),
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    version: z.string().default('0.0.0'),
  }).strict(),
  workspaceTemplate: z.object({
    root: safeDistPath,
    entryFiles: z.array(z.string()).default([]),
    mcpFiles: z.array(z.string()).default([]),
    skillDirs: z.array(z.string()).default([]),
  }).strict(),
}).strict()

export type SoulDescriptorV1 = z.infer<typeof soulDescriptorV1Schema>

export function parseSoulDescriptorV1(input: unknown): SoulDescriptorV1 {
  return soulDescriptorV1Schema.parse(input)
}

export const soulProtocolPackage = {
  descriptor: SOUL_DESCRIPTOR_OUTPUT_PATH,
  name: '@zonease/aiworker-soul-descriptor',
  sections: ['protocol', 'identity', 'workspaceTemplate'],
} as const
