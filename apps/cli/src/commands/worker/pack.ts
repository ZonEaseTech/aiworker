import process from 'node:process'

import {
  BUILTIN_WORKER_PACKS,
  findBuiltinWorkerPack,
  supportedWorkerPackIds,
} from '@zonease/aiworker-shared'

function joinValues(values: readonly string[]): string {
  return values.join(', ')
}

export async function runPackList(): Promise<number> {
  const width = Math.max(...BUILTIN_WORKER_PACKS.map(pack => pack.id.length))
  process.stdout.write('[aiworker pack] built-in worker packs\n')
  for (const pack of BUILTIN_WORKER_PACKS) {
    process.stdout.write(
      `  ${pack.id.padEnd(width)}  ${pack.label} — ${pack.description} artifacts=${joinValues(pack.artifactKinds)}\n`,
    )
  }
  process.stdout.write('\nWorker packs are OD-style workbench assets: SKILL.md + DOMAIN.md + work-order templates. Soul presets remain the Project Brain governance/persona surface.\n')
  return 0
}

export async function runPackShow(id: string): Promise<number> {
  const pack = findBuiltinWorkerPack(id)
  if (!pack) {
    process.stderr.write(`[aiworker pack] unknown worker pack "${id}". Available packs: ${supportedWorkerPackIds()}\n`)
    return 2
  }

  process.stdout.write([
    `[aiworker pack] ${pack.id} (${pack.label})`,
    `Description: ${pack.description}`,
    `Domain: ${pack.domain}`,
    `Artifact kinds: ${joinValues(pack.artifactKinds)}`,
    '',
    'Work order templates:',
    ...pack.workOrderTemplates.map(template => `  - ${template.id}: ${template.title} — ${template.description}`),
    '',
    'Review checklist:',
    ...pack.defaultReviewChecklist.map(item => `  - ${item}`),
    '',
    'SKILL.md:',
    indentBlock(pack.skillMd),
    '',
    'DOMAIN.md:',
    indentBlock(pack.domainMd),
  ].join('\n'))
  process.stdout.write('\n')
  return 0
}

function indentBlock(markdown: string): string {
  return markdown.trim().split(/\r?\n/).map(line => `  ${line}`).join('\n')
}
