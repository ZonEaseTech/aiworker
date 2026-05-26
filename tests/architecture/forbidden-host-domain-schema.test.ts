import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')
const workerSchemaPath = 'packages/storage-sqlite/src/worker/schema.ts'
const workerMigrationsDir = 'packages/storage-sqlite/drizzle/worker'
const workerSnapshotDir = 'packages/storage-sqlite/drizzle/worker/meta'

interface DrizzleSnapshot {
  tables: Record<string, {
    columns: Record<string, {
      name: string
    }>
  }>
}

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function listNumberedFiles(dir: string, suffix: string): string[] {
  return readdirSync(join(repoRoot, dir))
    .filter(file => /^\d+_/.test(file) && file.endsWith(suffix))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

function latestNumberedFile(dir: string, suffix: string): string {
  const files = listNumberedFiles(dir, suffix)
  expect(files.length, `${dir} should contain generated ${suffix} files`).toBeGreaterThan(0)
  return join(dir, files.at(-1)!)
}

function latestWorkerSnapshot(): DrizzleSnapshot {
  const snapshotPath = latestNumberedFile(workerSnapshotDir, '_snapshot.json')
  return JSON.parse(readRepoFile(snapshotPath)) as DrizzleSnapshot
}

function latestWorkerMigrationSql(): { path: string, sql: string } {
  const path = latestNumberedFile(workerMigrationsDir, '.sql')
  return { path, sql: readRepoFile(path) }
}

function columnsFor(snapshot: DrizzleSnapshot, tableName: string): string[] {
  return Object.keys(snapshot.tables[tableName]?.columns ?? {}).sort()
}

function requiredColumnFindings(snapshot: DrizzleSnapshot, tableName: string, requiredColumns: string[]): string[] {
  if (!snapshot.tables[tableName]) {
    return [`missing table: ${tableName}`]
  }

  const actualColumns = new Set(columnsFor(snapshot, tableName))
  const missing = requiredColumns.filter(column => !actualColumns.has(column))

  return missing.map(column => `missing column: ${tableName}.${column}`)
}

function forbiddenCurrentSchemaFindings(snapshot: DrizzleSnapshot): string[] {
  const findings: string[] = []
  const forbiddenTableNames = [
    'candidates',
    'profiles',
    'reviews',
    'reports',
    'releases',
    'test_results',
    'artifacts_content',
    'domain_status',
    'business_actions',
    'chat_messages',
    'engine_auth_tokens',
    'engine_profile_files',
    'mcp_secret_values',
    'session_events',
  ]
  const forbiddenColumnsByTable = new Map<string, string[]>([
    ['engine_invocations', ['prompt', 'turn_id']],
    ['worker_overlay_assets', ['content']],
    ['worker_config', ['config_json']],
  ])
  const forbiddenColumnsEverywhere = ['payload_json']

  for (const tableName of forbiddenTableNames) {
    if (snapshot.tables[tableName]) {
      findings.push(`forbidden table: ${tableName}`)
    }
  }

  for (const [tableName, columns] of Object.entries(snapshot.tables)) {
    const columnNames = new Set(Object.keys(columns.columns ?? {}))

    for (const columnName of forbiddenColumnsEverywhere) {
      if (columnNames.has(columnName)) {
        findings.push(`forbidden column: ${tableName}.${columnName}`)
      }
    }

    for (const columnName of forbiddenColumnsByTable.get(tableName) ?? []) {
      if (columnNames.has(columnName)) {
        findings.push(`forbidden column: ${tableName}.${columnName}`)
      }
    }
  }

  return findings.sort()
}

describe('Host DB forbidden domain schema contract', () => {
  test('Drizzle worker schema source does not define forbidden Host-owned domain storage', () => {
    expect(existsSync(join(repoRoot, workerSchemaPath)), `${workerSchemaPath} should exist`).toBe(true)

    const source = readRepoFile(workerSchemaPath)
    const sourceRules = [
      ['session_events table', /sqliteTable\(\s*['"`]session_events['"`]/],
      ['engine_invocations.prompt column', /\bprompt\s*:\s*text\(\s*['"`]prompt['"`]/],
      ['engine_invocations.turn_id column', /\bturnId\s*:\s*text\(\s*['"`]turn_id['"`]/],
      ['payload_json column', /\bpayloadJson\s*:\s*text\(\s*['"`]payload_json['"`]/],
      ['worker_overlay_assets.content column', /\bcontent\s*:\s*text\(\s*['"`]content['"`]/],
      ['worker_config.config_json singleton column', /\bconfigJson\s*:\s*text\(\s*['"`]config_json['"`]/],
    ] as const

    const findings = sourceRules
      .filter(([, pattern]) => pattern.test(source))
      .map(([label]) => label)

    expect(findings, 'schema.ts should expose metadata refs/envelopes only, not prompt/history/content/config blobs').toEqual([])
  })

  test('latest worker snapshot has bridge metadata tables and rejects forbidden history/domain columns', () => {
    const snapshot = latestWorkerSnapshot()

    const findings = [
      ...requiredColumnFindings(snapshot, 'engine_invocations', [
        'input_ref',
        'process_state',
        'projection_receipt_id',
        'external_session_ref',
        'raw_log_ref',
        'event_log_ref',
        'failure_code',
      ]),
      ...requiredColumnFindings(snapshot, 'bridge_events', [
        'event_id',
        'invocation_id',
        'event_type',
        'event_json',
        'created_at',
      ]),
      ...requiredColumnFindings(snapshot, 'worker_config', [
        'worker_id',
        'config_key',
        'config_value_json',
        'source',
      ]),
      ...forbiddenCurrentSchemaFindings(snapshot),
    ].sort()

    expect(findings, 'latest worker snapshot should describe bridge metadata only').toEqual([])
  })

  test('latest worker migration does not introduce forbidden Host-owned prompt/history/content columns', () => {
    const { path, sql } = latestWorkerMigrationSql()
    const rules = [
      ['session_events table creation', /CREATE\s+TABLE\s+`?(?:__new_)?session_events`?/i],
      ['engine_invocations.prompt column', /`prompt`\s+/i],
      ['engine_invocations.turn_id column', /`turn_id`\s+/i],
      ['payload_json column', /`payload_json`\s+/i],
      ['worker_overlay_assets.content column', /CREATE\s+TABLE\s+(?:`(?:__new_)?worker_overlay_assets`|(?:__new_)?worker_overlay_assets)[\s\S]*`content`\s+/i],
      ['worker_config.config_json singleton column', /CREATE\s+TABLE\s+(?:`(?:__new_)?worker_config`|(?:__new_)?worker_config)[\s\S]*`config_json`\s+/i],
    ] as const

    const findings = rules
      .filter(([, pattern]) => pattern.test(sql))
      .map(([label]) => `${basename(path)}: ${label}`)

    expect(findings, 'new worker migration SQL should create bridge metadata shape only').toEqual([])
  })
})
