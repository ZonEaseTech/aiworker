#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIBLING_NEXT = resolve(ROOT, '..', 'aiworker-next')
const ROOT_ENV = resolve(ROOT, '.env')
const APP_NAME = 'AIWorker Web Admin'
const DEFAULT_BASE_URL = 'https://20831--main--ben--ben.coder.tbc.5ok.co'
const LEGACY_DEFAULT_BASE_URL = 'http://127.0.0.1:20831'
const DEFAULT_EMAIL_DOMAINS = 'zonease.org,jbcnet.co.jp,ttpos.org'

function parseEnvFile(path) {
  const map = new Map()
  if (!existsSync(path))
    return map
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0)
      continue
    let value = trimmed.slice(eq + 1).trim()
    if (value.length >= 2 && value[0] === '"' && value.at(-1) === '"')
      value = value.slice(1, -1)
    map.set(trimmed.slice(0, eq).trim(), value)
  }
  return map
}

function die(message) {
  console.error(`\nERROR: ${message}\n`)
  process.exit(1)
}

function m2mSources() {
  return [
    { label: `${ROOT}/.logto`, values: parseEnvFile(resolve(ROOT, '.logto')) },
    { label: 'process env', values: new Map(Object.entries(process.env).filter(([, value]) => typeof value === 'string')) },
    { label: `${SIBLING_NEXT}/.logto`, values: parseEnvFile(resolve(SIBLING_NEXT, '.logto')) },
    { label: `${SIBLING_NEXT}/.env`, values: parseEnvFile(resolve(SIBLING_NEXT, '.env')) },
  ]
}

function readM2m() {
  for (const source of m2mSources()) {
    const appId = source.values.get('LOGTO_M2M_APP_ID') || source.values.get('LOGTO_M2M_CLIENT_ID')
    const appSecret = source.values.get('LOGTO_M2M_APP_SECRET') || source.values.get('LOGTO_M2M_CLIENT_SECRET')
    const tenantId = source.values.get('LOGTO_TENANT_ID')
    if (appId && appSecret && tenantId)
      return { appId, appSecret, source: source.label, tenantId }
  }
  die('No complete Logto M2M tuple found. Need LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET / LOGTO_TENANT_ID in .logto, process env, or ../aiworker-next.')
}

async function managementToken(endpoint, apiIndicator, m2mId, m2mSecret) {
  const res = await fetch(new URL('/oidc/token', endpoint), {
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: apiIndicator,
      scope: 'all',
    }),
    headers: {
      'authorization': `Basic ${Buffer.from(`${m2mId}:${m2mSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  if (!res.ok)
    die(`Logto Management API token exchange failed (${res.status}). Verify the M2M app has Management API access.`)
  const body = await res.json()
  if (typeof body.access_token !== 'string')
    die('Logto Management API token response did not include access_token.')
  return body.access_token
}

async function findApp(endpoint, token) {
  let page = 1
  for (;;) {
    const url = new URL('/api/applications', endpoint)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', '100')
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok)
      die(`List Logto applications failed (${res.status}).`)
    const list = await res.json()
    const items = Array.isArray(list) ? list : (list.data ?? [])
    const found = items.find(app => app?.name === APP_NAME)
    if (found)
      return found.id
    if (items.length < 100)
      return null
    page += 1
  }
}

function oidcMetadata(baseUrl) {
  return {
    postLogoutRedirectUris: [`${baseUrl}/`, `${baseUrl}/login`],
    redirectUris: [`${baseUrl}/callback`],
  }
}

async function createApp(endpoint, token, baseUrl) {
  const res = await fetch(new URL('/api/applications', endpoint), {
    body: JSON.stringify({
      description: 'AIWorker Web private admin console.',
      name: APP_NAME,
      oidcClientMetadata: oidcMetadata(baseUrl),
      type: 'Traditional',
    }),
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    die(`Create Logto application failed (${res.status}).`)
  return await res.json()
}

async function patchApp(endpoint, token, id, baseUrl) {
  const res = await fetch(new URL(`/api/applications/${encodeURIComponent(id)}`, endpoint), {
    body: JSON.stringify({ oidcClientMetadata: oidcMetadata(baseUrl) }),
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!res.ok)
    die(`Update Logto application redirect URIs failed (${res.status}).`)
}

async function tryPatchApp(endpoint, token, id, baseUrl) {
  const res = await fetch(new URL(`/api/applications/${encodeURIComponent(id)}`, endpoint), {
    body: JSON.stringify({ oidcClientMetadata: oidcMetadata(baseUrl) }),
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'PATCH',
  })
  return res.ok
}

function existingRuntimeApp(rootEnv) {
  const id = rootEnv.get('LOGTO_CLIENT_ID') || rootEnv.get('LOGTO_APP_ID')
  const secret = rootEnv.get('LOGTO_CLIENT_SECRET') || rootEnv.get('LOGTO_APP_SECRET')
  return id && secret ? { id, secret } : null
}

export function logtoBaseUrl(rootEnv, env = process.env) {
  const explicit = env.LOGTO_BASE_URL?.trim()
  if (explicit)
    return explicit
  const persisted = rootEnv.get('LOGTO_BASE_URL')?.trim()
  if (persisted && persisted !== LEGACY_DEFAULT_BASE_URL)
    return persisted
  return DEFAULT_BASE_URL
}

async function readSecret(endpoint, token, id) {
  const res = await fetch(new URL(`/api/applications/${encodeURIComponent(id)}/secrets`, endpoint), {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok)
    die(`Read Logto application secret failed (${res.status}).`)
  const secrets = await res.json()
  const found = Array.isArray(secrets)
    ? secrets.find(secret => typeof secret?.value === 'string' && secret.value.trim())
    : null
  if (!found)
    die('Logto application has no readable secret.')
  return found.value.trim()
}

async function discoverAuthEndpoint(endpoint, token) {
  try {
    const res = await fetch(new URL('/api/domains', endpoint), {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok)
      return null
    const domains = await res.json()
    const active = Array.isArray(domains)
      ? domains.find(domain => domain?.status === 'Active' && typeof domain?.domain === 'string')
      : null
    return active ? `https://${active.domain}` : null
  }
  catch {
    return null
  }
}

function mergeEnv(path, updates) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : []
  const seen = new Set()
  const out = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      return line
    const eq = trimmed.indexOf('=')
    if (eq <= 0)
      return line
    const key = trimmed.slice(0, eq).trim()
    if (Object.hasOwn(updates, key)) {
      seen.add(key)
      return `${key}=${updates[key]}`
    }
    return line
  })
  const added = Object.entries(updates).filter(([key]) => !seen.has(key))
  if (added.length) {
    if (out.length && out.at(-1).trim() !== '')
      out.push('')
    out.push('# Logto admin login (generated by scripts/setup-logto.mjs; keep ignored)')
    for (const [key, value] of added)
      out.push(`${key}=${value}`)
  }
  let text = out.join('\n')
  if (!text.endsWith('\n'))
    text += '\n'
  writeFileSync(path, text)
}

async function main() {
  const m2m = readM2m()
  const rootEnv = parseEnvFile(ROOT_ENV)
  const endpoint = `https://${m2m.tenantId}.logto.app/`
  const apiIndicator = `https://${m2m.tenantId}.logto.app/api`
  const baseUrl = logtoBaseUrl(rootEnv).replace(/\/+$/, '')
  const allowedEmailDomains = process.env.LOGTO_ALLOWED_EMAIL_DOMAINS || rootEnv.get('LOGTO_ALLOWED_EMAIL_DOMAINS') || rootEnv.get('AIWORKER_ALLOWED_EMAIL_DOMAINS') || DEFAULT_EMAIL_DOMAINS

  console.log(`Using Logto M2M source: ${m2m.source}`)
  console.log(`Management endpoint: ${endpoint}`)
  console.log(`Redirect URI: ${baseUrl}/callback`)
  console.log(`Allowed email domains: ${allowedEmailDomains}`)

  const token = await managementToken(endpoint, apiIndicator, m2m.appId, m2m.appSecret)
  const discoveredAuthEndpoint = await discoverAuthEndpoint(endpoint, token)
  const authEndpoint = (process.env.LOGTO_ENDPOINT || discoveredAuthEndpoint || rootEnv.get('LOGTO_ENDPOINT') || endpoint).replace(/\/+$/, '')
  const existing = existingRuntimeApp(rootEnv)

  let appId = await findApp(endpoint, token)
  let appSecret
  if (!appId && existing) {
    appId = existing.id
    appSecret = existing.secret
    const patched = await tryPatchApp(endpoint, token, appId, baseUrl)
    console.log(patched
      ? 'Reused existing LOGTO_CLIENT_ID from .env and confirmed redirect URIs.'
      : 'Reused existing LOGTO_CLIENT_ID from .env. Could not update redirect URIs with current M2M permissions; verify them in Logto if login fails.')
  }
  else if (appId) {
    await patchApp(endpoint, token, appId, baseUrl)
    console.log(`Reused Logto app "${APP_NAME}".`)
  }
  else {
    const app = await createApp(endpoint, token, baseUrl)
    appId = app.id
    console.log(`Created Logto app "${APP_NAME}".`)
  }

  appSecret ??= await readSecret(endpoint, token, appId)
  const cookieSecret = rootEnv.get('LOGTO_COOKIE_SECRET') || rootEnv.get('AIWORKER_SESSION_SECRET') || randomBytes(32).toString('base64url')
  mergeEnv(ROOT_ENV, {
    AIWORKER_SESSION_SECRET: cookieSecret,
    LOGTO_ALLOWED_EMAIL_DOMAINS: allowedEmailDomains,
    LOGTO_BASE_URL: baseUrl,
    LOGTO_CLIENT_ID: appId,
    LOGTO_CLIENT_SECRET: appSecret,
    LOGTO_COOKIE_SECRET: cookieSecret,
    LOGTO_ENDPOINT: authEndpoint,
  })

  console.log(`Wrote Logto runtime configuration to ${ROOT_ENV}. Restart aiworker-web to load it.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => die(error instanceof Error ? error.message : String(error)))
