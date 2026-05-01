import process from 'node:process'

import {
  BUILTIN_SOUL_PRESETS,
  CUSTOMIZE_SOUL_ID,
  findBuiltinSoul,
  supportedSoulIds,
} from '../soul/presets'

function joinValues(values: readonly string[]): string {
  return values.join(', ')
}

function printList(): void {
  const width = Math.max(...BUILTIN_SOUL_PRESETS.map(preset => preset.id.length), CUSTOMIZE_SOUL_ID.length)
  process.stdout.write('[aiworker soul] built-in presets\n')
  for (const preset of BUILTIN_SOUL_PRESETS) {
    process.stdout.write(
      `  ${preset.id.padEnd(width)}  ${preset.label} — ${preset.description} packs=${joinValues(preset.packs)} toolsets=${joinValues(preset.toolsets)}\n`,
    )
  }
  process.stdout.write(
    `  ${CUSTOMIZE_SOUL_ID.padEnd(width)}  Custom — 通过 \`aiworker init --soul customize\` 交互生成职责、边界和能力草案。\n`,
  )
  process.stdout.write('\nCapability packs and toolsets are initialized as draft. Run `aiworker doctor` inside a project for static validation status.\n')
}

export async function runSoulList(): Promise<number> {
  printList()
  return 0
}

export async function runSoulShow(id: string): Promise<number> {
  if (id === CUSTOMIZE_SOUL_ID) {
    process.stdout.write([
      '[aiworker soul] customize',
      '  type: interactive template',
      '  usage: aiworker init --soul customize',
      '  asks: responsibilities, boundaries, out-of-scope behavior, communication style, risk approval, packs, toolsets',
      '  output: project-local SOUL.md, AGENT.md, policy.json, toolsets.json, capability-packs.json drafts',
    ].join('\n'))
    process.stdout.write('\n')
    return 0
  }

  const preset = findBuiltinSoul(id)
  if (!preset) {
    process.stderr.write(`[aiworker soul] unknown Soul preset "${id}". Available presets: ${supportedSoulIds()}\n`)
    return 2
  }

  process.stdout.write([
    `[aiworker soul] ${preset.id} (${preset.label})`,
    `Description: ${preset.description}`,
    '',
    'Responsibilities:',
    ...preset.responsibilities.map(item => `  - ${item}`),
    '',
    'Boundaries:',
    ...preset.boundaries.map(item => `  - ${item}`),
    '',
    `Communication style: ${preset.communicationStyle}`,
    `Risk policy: ${preset.riskPolicy}`,
    `Out-of-scope strategy: ${preset.outOfScope}`,
    '',
    `Capability packs: ${joinValues(preset.packs)} (draft; project validation via aiworker doctor)`,
    `Toolsets: ${joinValues(preset.toolsets)} (draft; project validation via aiworker doctor)`,
  ].join('\n'))
  process.stdout.write('\n')
  return 0
}
