const PROVISION_TOKEN_RE = /^awp_[\w-]+$/

export function isProvisionTokenLike(value: string): boolean {
  return PROVISION_TOKEN_RE.test(value)
}

export function redactProvisionToken(value: string): string {
  return isProvisionTokenLike(value) ? 'awp_[REDACTED]' : value
}
