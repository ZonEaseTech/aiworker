import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { BrainJournalAuthorityMode } from '../journal'

import { describeExecutorAuthority } from '../journal'

export type OperatorAuthorityMode = 'ambient' | 'provider-managed' | 'aiworker-brokered' | 'read-only' | 'plan-only' | 'dry-run' | 'unknown'

export interface AuthorityPreflightSignal {
  type: 'production' | 'database' | 'destructive' | 'payment' | 'pii' | 'secret' | 'cross-scope'
  reason: string
}

export interface AuthorityPreflightResult {
  authorityMode: BrainJournalAuthorityMode
  operatorMode: OperatorAuthorityMode
  risk: 'low' | 'high'
  signals: AuthorityPreflightSignal[]
  enforceable: boolean
  warning?: string
  recommendation?: 'continue' | 'prefer-plan-only' | 'prefer-dry-run' | 'hold-for-operator'
}

const SIGNAL_RULES: Array<{ type: AuthorityPreflightSignal['type'], pattern: RegExp, reason: string }> = [
  { type: 'production', pattern: /\b(prod|production|live)\b/i, reason: 'task mentions production/live environment' },
  { type: 'database', pattern: /\b(database|db|sql|table|migration)\b/i, reason: 'task mentions database or schema operations' },
  { type: 'destructive', pattern: /\b(delete|drop|truncate|destroy|wipe|remove|rm\s+-rf)\b/i, reason: 'task may involve destructive mutation' },
  { type: 'payment', pattern: /\b(payment|charge|refund|stripe|invoice|payout|billing)\b/i, reason: 'task mentions payment or billing operations' },
  { type: 'pii', pattern: /\b(pii|personal data|ssn|email list|candidate data|身份证|手机号|隐私)\b/i, reason: 'task may involve personal or sensitive user data' },
  { type: 'secret', pattern: /\b(secret|token|api[-_\s]?key|credential|private key|password)\b/i, reason: 'task mentions secrets or credentials' },
  { type: 'cross-scope', pattern: /\b(cross[-_\s]?scope|outside scope|another repo|other workspace|global config|全局|其他项目|其它项目)\b/i, reason: 'task may reach outside the current worker scope' },
]

export function operatorAuthorityMode(authorityMode: BrainJournalAuthorityMode): OperatorAuthorityMode {
  if (authorityMode === 'unmanaged_ambient')
    return 'ambient'
  if (authorityMode === 'provider_managed')
    return 'provider-managed'
  if (authorityMode === 'aiworker_brokered')
    return 'aiworker-brokered'
  return 'unknown'
}

export function detectAuthorityPreflight(input: {
  text: string
  config?: WorkerConfig
  authorityMode?: BrainJournalAuthorityMode
  requestedMode?: OperatorAuthorityMode
}): AuthorityPreflightResult {
  const authorityMode = input.authorityMode ?? describeExecutorAuthority(input.config).authorityMode
  const operatorMode = input.requestedMode ?? operatorAuthorityMode(authorityMode)
  const signals = SIGNAL_RULES
    .filter(rule => rule.pattern.test(input.text))
    .map(rule => ({ type: rule.type, reason: rule.reason }))
  const risk = signals.length === 0 ? 'low' : 'high'
  const enforceable = operatorMode !== 'ambient'
  if (risk === 'low') {
    return {
      authorityMode,
      enforceable,
      operatorMode,
      recommendation: 'continue',
      risk,
      signals,
    }
  }
  return {
    authorityMode,
    enforceable,
    operatorMode,
    recommendation: operatorMode === 'ambient' ? 'prefer-plan-only' : 'hold-for-operator',
    risk,
    signals,
    warning: operatorMode === 'ambient'
      ? 'High-risk task under unmanaged ambient executor authority. AIWorker can warn and journal this risk, but cannot guarantee the external executor will not act through user/host-level tools.'
      : 'High-risk task detected. Keep approval, dry-run, or brokered controls explicit before allowing mutation.',
  }
}
