import type { ReviewRow } from '@zonease/aiworker-storage-sqlite/worker'

import { spawnSync } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const PROFILE_README_PATH = 'README.md'
export const PROFILE_REVIEW_DIR = 'reviews'

const PROFILE_GITIGNORE_PATTERNS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.aiworker/sessions/',
  '.aiworker/projections.json',
  '.agents/skills/aiworker-*',
  '.claude/skills/aiworker-*',
  'evidence/raw/',
] as const

const AIWORKER_GIT_USER = 'AIWorker Profile Ledger'
const AIWORKER_GIT_EMAIL = 'aiworker@local'

export type GitOperationResult
  = | { hash?: string, message?: string, status: 'created' | 'skipped' | 'unavailable' }
    | { message: string, status: 'failed' }

export interface ProfileWorkspaceBootstrapResult {
  git: GitOperationResult
  profilePath: string
}

export interface ProfileRevisionPromotionInput {
  artifactPath: string
  artifactTitle: string
  findingsJson: Record<string, unknown>[]
  now: string
  profileMarkdown: string
  reviewId: string
  risksJson: Record<string, unknown>[]
  tagName?: string | null
  verdict: ReviewRow['verdict']
  workspaceName: string
  workspaceRoot: string
}

export interface ProfileRevisionPromotionResult {
  git: GitOperationResult
  profilePath: string
  reviewPath: string
  tag: GitOperationResult | null
}

export async function bootstrapProfileWorkspace(input: {
  name: string
  now: string
  rootPath: string
  seedProfileFiles?: boolean
  soulId: string
  workerName: string
}): Promise<ProfileWorkspaceBootstrapResult> {
  const rootPath = path.resolve(input.rootPath)
  await mkdir(rootPath, { recursive: true })
  await mkdir(path.join(rootPath, 'artifacts'), { recursive: true })
  await mkdir(path.join(rootPath, PROFILE_REVIEW_DIR), { recursive: true })
  await mkdir(path.join(rootPath, 'evidence', 'descriptors'), { recursive: true })
  await mkdir(path.join(rootPath, 'evidence', 'raw'), { recursive: true })
  await mkdir(path.join(rootPath, '.aiworker', 'sessions'), { recursive: true })

  if (input.seedProfileFiles !== false) {
    await ensureFile(path.join(rootPath, PROFILE_README_PATH), renderInitialProfileReadme(input.name))
    await ensureFile(path.join(rootPath, 'evidence', 'README.md'), renderEvidenceReadme())
    await ensureGitignore(rootPath)
  }

  return {
    git: ensureGitInitialCommit(rootPath, await existingBootstrapPaths(rootPath)),
    profilePath: PROFILE_README_PATH,
  }
}

export async function promoteProfileRevision(input: ProfileRevisionPromotionInput): Promise<ProfileRevisionPromotionResult> {
  if (input.verdict !== 'pass' && input.verdict !== 'warn')
    throw new Error('Only pass or warn reviews can promote a profile revision.')

  const rootPath = path.resolve(input.workspaceRoot)
  const reviewPath = path.posix.join(PROFILE_REVIEW_DIR, `${input.reviewId}.md`)
  await mkdir(path.join(rootPath, PROFILE_REVIEW_DIR), { recursive: true })
  await writeFile(resolveWorkspacePath(rootPath, PROFILE_README_PATH), normalizeMarkdown(input.profileMarkdown), 'utf8')
  await writeFile(resolveWorkspacePath(rootPath, reviewPath), renderReviewRecord(input), 'utf8')

  const git = commitGitChanges(rootPath, [PROFILE_README_PATH, input.artifactPath, reviewPath], `profile: approve ${input.workspaceName} revision`)
  const tag = input.tagName ? tagGitRevision(rootPath, input.tagName, `Approved profile version for ${input.workspaceName}`) : null

  return {
    git,
    profilePath: PROFILE_README_PATH,
    reviewPath,
    tag,
  }
}

function renderInitialProfileReadme(name: string): string {
  return [
    `# ${name}`,
    '',
    '> Canonical accepted profile for this Soul workspace. Session outputs remain proposals until review.',
    '',
    '## Current Profile Summary',
    '',
    'No approved profile revision yet.',
    '',
    '## Evidence And Review',
    '',
    '- Proposed changes live in `artifacts/`.',
    '- Human review records live in `reviews/`.',
    '- Evidence descriptors live in `evidence/descriptors/`.',
    '',
    '## Revision Notes',
    '',
    'Approve a profile revision to update this README.',
    '',
  ].join('\n')
}

function renderEvidenceReadme(): string {
  return [
    '# Evidence',
    '',
    'Store source descriptors in `descriptors/`. Keep raw sensitive evidence in `raw/`, which is ignored by the profile git ledger by default.',
    '',
  ].join('\n')
}

function renderReviewRecord(input: ProfileRevisionPromotionInput): string {
  return [
    `# Profile Review ${input.reviewId}`,
    '',
    `- Verdict: ${input.verdict}`,
    `- Artifact: ${input.artifactTitle} (${input.artifactPath})`,
    `- Reviewed At: ${input.now}`,
    '',
    '## Findings',
    renderJsonList(input.findingsJson),
    '',
    '## Risks',
    renderJsonList(input.risksJson),
    '',
  ].join('\n')
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath))
    return
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

async function ensureGitignore(rootPath: string): Promise<void> {
  const filePath = path.join(rootPath, '.gitignore')
  const existing = await readFileIfExists(filePath)
  const missing = PROFILE_GITIGNORE_PATTERNS.filter(pattern => !existing.split(/\r?\n/).includes(pattern))
  if (missing.length === 0)
    return

  const next = [
    existing.trimEnd(),
    existing.trim().length > 0 ? '' : null,
    '# AIWorker profile ledger',
    ...missing,
    '',
  ].filter((line): line is string => line !== null).join('\n')
  await writeFile(filePath, next, 'utf8')
}

async function existingBootstrapPaths(rootPath: string): Promise<string[]> {
  const paths = [PROFILE_README_PATH, '.gitignore', 'evidence/README.md']
  const existing: string[] = []
  for (const item of paths) {
    if (await pathExists(path.join(rootPath, item)))
      existing.push(item)
  }
  return existing
}

function ensureGitInitialCommit(rootPath: string, paths: string[]): GitOperationResult {
  if (!isGitAvailable())
    return { message: 'git is not available on PATH.', status: 'unavailable' }

  if (!isGitRepository(rootPath)) {
    const init = runGit(rootPath, ['init'])
    if (init.status !== 0)
      return { message: init.stderr || init.stdout || 'git init failed.', status: 'failed' }
  }

  configureGitIdentity(rootPath)
  return commitGitChanges(rootPath, paths, 'profile: initialize workspace')
}

function commitGitChanges(rootPath: string, paths: string[], message: string): GitOperationResult {
  if (!isGitAvailable())
    return { message: 'git is not available on PATH.', status: 'unavailable' }
  if (!isGitRepository(rootPath))
    return { message: 'workspace is not a git repository.', status: 'failed' }
  if (paths.length === 0)
    return { hash: currentHead(rootPath), message: 'no bootstrap files to commit.', status: 'skipped' }

  configureGitIdentity(rootPath)
  const add = runGit(rootPath, ['add', '--', ...paths])
  if (add.status !== 0)
    return { message: add.stderr || add.stdout || 'git add failed.', status: 'failed' }

  const diff = runGit(rootPath, ['diff', '--cached', '--quiet'])
  if (diff.status === 0)
    return { hash: currentHead(rootPath), status: 'skipped' }

  const commit = runGit(rootPath, ['commit', '-m', message])
  if (commit.status !== 0)
    return { message: commit.stderr || commit.stdout || 'git commit failed.', status: 'failed' }

  return { hash: currentHead(rootPath), status: 'created' }
}

function tagGitRevision(rootPath: string, tagName: string, message: string): GitOperationResult {
  if (!isGitAvailable())
    return { message: 'git is not available on PATH.', status: 'unavailable' }
  if (!isGitRepository(rootPath))
    return { message: 'workspace is not a git repository.', status: 'failed' }

  const tag = runGit(rootPath, ['tag', '-a', tagName, '-m', message])
  if (tag.status !== 0)
    return { message: tag.stderr || tag.stdout || 'git tag failed.', status: 'failed' }
  return { hash: currentHead(rootPath), status: 'created' }
}

function configureGitIdentity(rootPath: string): void {
  runGit(rootPath, ['config', 'user.name', AIWORKER_GIT_USER])
  runGit(rootPath, ['config', 'user.email', AIWORKER_GIT_EMAIL])
}

function currentHead(rootPath: string): string | undefined {
  const result = runGit(rootPath, ['rev-parse', '--verify', 'HEAD'])
  return result.status === 0 ? result.stdout.trim() : undefined
}

function isGitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}

function isGitRepository(rootPath: string): boolean {
  return runGit(rootPath, ['rev-parse', '--is-inside-work-tree']).status === 0
}

function runGit(cwd: string, args: string[]): { status: number | null, stderr: string, stdout: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return {
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function resolveWorkspacePath(rootPath: string, inputPath: string): string {
  const resolved = path.resolve(rootPath, inputPath)
  const prefix = `${rootPath}${path.sep}`
  if (resolved !== rootPath && !resolved.startsWith(prefix))
    throw new Error(`Path escapes workspace root: ${inputPath}`)
  return resolved
}

function normalizeMarkdown(content: string): string {
  const trimmed = content.trimEnd()
  return `${trimmed}\n`
}

function renderJsonList(items: Record<string, unknown>[]): string {
  if (items.length === 0)
    return '- None.'
  return items.map(item => `- ${JSON.stringify(item)}`).join('\n')
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  }
  catch (error) {
    if (isNoEntryError(error))
      return false
    throw error
  }
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8')
  }
  catch (error) {
    if (isNoEntryError(error))
      return ''
    throw error
  }
}

function isNoEntryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
