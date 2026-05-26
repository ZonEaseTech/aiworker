import process from 'node:process'

const HOST_INTERNAL_ENV_PREFIXES = ['AIWORKER_', 'WORKER_', 'OD_'] as const

export function sanitizeEngineEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (HOST_INTERNAL_ENV_PREFIXES.some(prefix => key.startsWith(prefix)))
      continue
    result[key] = value
  }
  return result
}

const SOUL_APP_SERVICE_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'TERM',
  'SHELL',
  'USER',
  'LOGNAME',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const

export function soulAppServiceEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const key of SOUL_APP_SERVICE_ENV_ALLOWLIST) {
    if (base[key] !== undefined)
      result[key] = base[key]
  }
  return result
}
