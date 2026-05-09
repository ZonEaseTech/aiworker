/**
 * Secret-like content scanner for free-text fields that flow into brain
 * admission `payload.body`, `evidence[].summary`, `evidence[].notes`, etc.
 *
 * Field-name based redaction (`redactSecretLikeValues`) only catches values
 * stored under a known-name key. This scanner catches secret-shaped strings
 * embedded inside operator-controlled markdown bodies, which is where Soul
 * proposals often paste live tokens (BUG-055).
 *
 * Scanner is regex-based plus a high-entropy heuristic. Scope is "good
 * enough to block obvious leaks"; it is not a substitute for a vault and
 * is not meant to defeat motivated obfuscation.
 */

export interface SecretHit {
  /** Stable id for the rule that matched. */
  rule: SecretRuleId
  /** Short human description, useful for CLI output. */
  label: string
  /** Redacted preview of the matched span (first/last 3 chars). */
  preview: string
  /** Char index of the first matched character in the input. */
  index: number
}

export type SecretRuleId
  = | 'sk-token'
    | 'jwt'
    | 'bearer-token'
    | 'aws-access-key'
    | 'github-token'
    | 'slack-token'
    | 'stripe-live'
    | 'gcp-api-key'
    | 'pem-private-key'
    | 'high-entropy'

interface SecretRule {
  id: SecretRuleId
  label: string
  regex: RegExp
}

const RULES: readonly SecretRule[] = [
  { id: 'sk-token', label: 'OpenAI/Anthropic-style sk- token', regex: /\bsk-[\w-]{20,}/g },
  { id: 'jwt', label: 'JWT-like token', regex: /eyJ[\w=.-]{20,}/g },
  { id: 'bearer-token', label: 'Bearer authorization token', regex: /\b[Bb]earer\s+[\w.-]{20,}/g },
  { id: 'aws-access-key', label: 'AWS access key id', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', label: 'GitHub-style token (ghp / gho / ghs / ghu / ghr)', regex: /\bgh[posur]_[A-Za-z0-9]{36,}\b/g },
  { id: 'slack-token', label: 'Slack token (xoxa / xoxb / xoxp / xoxr / xoxs)', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'stripe-live', label: 'Stripe live secret key', regex: /\bsk_live_[A-Za-z0-9]{16,}/g },
  { id: 'gcp-api-key', label: 'Google Cloud / Firebase API key', regex: /\bAIza[\w-]{35}\b/g },
  { id: 'pem-private-key', label: 'PEM-formatted private key block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
]

const HIGH_ENTROPY_CANDIDATE_RE = /[\w+/=]{32,}/g
/** Shannon entropy threshold (bits per char). 4.0 is high enough to flag random bytes-base64. */
const HIGH_ENTROPY_BITS = 4.0

export interface ScanBodyForSecretsResult {
  hits: SecretHit[]
}

/**
 * Scan a free-text body for secret-like substrings. Empty input returns no
 * hits. The result is suitable for both block / redact / dry-run reporting.
 */
export function scanBodyForSecrets(body: string): ScanBodyForSecretsResult {
  if (typeof body !== 'string' || body.length === 0)
    return { hits: [] }

  const hits: SecretHit[] = []
  for (const rule of RULES) {
    rule.regex.lastIndex = 0
    let match: RegExpExecArray | null = rule.regex.exec(body)
    while (match !== null) {
      hits.push({
        rule: rule.id,
        label: rule.label,
        preview: previewMatch(match[0]),
        index: match.index,
      })
      match = rule.regex.exec(body)
    }
  }

  // High-entropy fallback: catch random-bytes-as-base64 / hex tokens that
  // don't match a known prefix. We only flag strings that don't already
  // overlap an explicit rule hit so the reporter stays readable.
  const claimed = hits.map(h => ({ start: h.index, end: h.index + h.preview.length }))
  HIGH_ENTROPY_CANDIDATE_RE.lastIndex = 0
  let highMatch: RegExpExecArray | null = HIGH_ENTROPY_CANDIDATE_RE.exec(body)
  while (highMatch !== null) {
    const candidate = highMatch[0]
    const start = highMatch.index
    if (!overlaps(start, start + candidate.length, claimed) && shannonEntropy(candidate) >= HIGH_ENTROPY_BITS) {
      hits.push({
        rule: 'high-entropy',
        label: 'high-entropy token-like string',
        preview: previewMatch(candidate),
        index: start,
      })
    }
    highMatch = HIGH_ENTROPY_CANDIDATE_RE.exec(body)
  }

  hits.sort((a, b) => a.index - b.index)
  return { hits }
}

/**
 * Replace each detected hit with a `[REDACTED:<rule>]` marker. Returns the
 * redacted body plus the same hits payload for caller observability.
 */
export function redactBodySecrets(body: string): { body: string, hits: SecretHit[] } {
  const result = scanBodyForSecrets(body)
  if (result.hits.length === 0)
    return { body, hits: [] }
  // Replace from the tail so earlier indexes stay valid.
  const sorted = [...result.hits].sort((a, b) => b.index - a.index)
  let out = body
  for (const hit of sorted) {
    const start = hit.index
    const original = findOriginalAt(out, start, hit.rule)
    if (original === null)
      continue
    out = `${out.slice(0, start)}[REDACTED:${hit.rule}]${out.slice(start + original.length)}`
  }
  return { body: out, hits: result.hits }
}

function previewMatch(value: string): string {
  if (value.length <= 6)
    return '*'.repeat(value.length)
  return `${value.slice(0, 3)}…${value.slice(-3)}`
}

function overlaps(start: number, end: number, claimed: ReadonlyArray<{ start: number, end: number }>): boolean {
  for (const span of claimed) {
    if (start < span.end && end > span.start)
      return true
  }
  return false
}

function shannonEntropy(input: string): number {
  if (input.length === 0)
    return 0
  const counts = new Map<string, number>()
  for (const ch of input)
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const p = count / input.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

/**
 * Re-discover the exact substring at `start` for the originating rule so we
 * know how many characters to skip when splicing in the redaction marker.
 * Falls back to the high-entropy candidate matcher when the rule is
 * `high-entropy`.
 */
function findOriginalAt(body: string, start: number, rule: SecretRuleId): string | null {
  if (rule === 'high-entropy') {
    HIGH_ENTROPY_CANDIDATE_RE.lastIndex = start
    const match = HIGH_ENTROPY_CANDIDATE_RE.exec(body)
    return match && match.index === start ? match[0] : null
  }
  const ruleDef = RULES.find(r => r.id === rule)
  if (!ruleDef)
    return null
  ruleDef.regex.lastIndex = start
  const match = ruleDef.regex.exec(body)
  return match && match.index === start ? match[0] : null
}
