export type Severity = 'ok' | 'warn' | 'error'

export type CheckCategory = 'runtime' | 'engine' | 'provisioning' | 'auth' | 'service'

export interface FixHint {
  message: string
  command?: string
  docs?: string
}

export interface CheckResult {
  category: CheckCategory
  detail: string
  fix?: FixHint
  id: string
  label: string
  probed: boolean
  severity: Severity
}

export interface CheckContext {
  probe: boolean
}

export interface Check {
  category: CheckCategory
  id: string
  label: string
  run: (ctx: CheckContext) => CheckResult | Promise<CheckResult>
}

export interface DoctorReport {
  exitCode: number
  overall: Severity
  results: CheckResult[]
}
