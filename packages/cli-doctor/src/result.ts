import type { CheckCategory, CheckResult, FixHint, Severity } from './types'

export function makeResult(input: {
  category: CheckCategory
  detail: string
  fix?: FixHint
  id: string
  label: string
  probed?: boolean
  severity: Severity
}): CheckResult {
  return {
    category: input.category,
    detail: input.detail,
    ...(input.fix ? { fix: input.fix } : {}),
    id: input.id,
    label: input.label,
    probed: input.probed ?? false,
    severity: input.severity,
  }
}
