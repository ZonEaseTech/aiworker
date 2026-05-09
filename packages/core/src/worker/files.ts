import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface LocalFileWriteInput {
  path: string
  content: string
}

export interface LocalWorkspaceFileEntry {
  path: string
  kind: 'file' | 'directory'
  size: number | null
  mtime: number | null
  hash: string | null
}

export class LocalWorkspaceFiles {
  readonly #root: string

  constructor(root: string) {
    this.#root = path.resolve(root)
  }

  get root(): string {
    return this.#root
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.#root, { recursive: true })
  }

  resolve(inputPath: string): string {
    const resolved = path.resolve(this.#root, inputPath)
    const prefix = `${this.#root}${path.sep}`
    if (resolved !== this.#root && !resolved.startsWith(prefix))
      throw new Error(`Path escapes workspace root: ${inputPath}`)
    return resolved
  }

  async write(input: LocalFileWriteInput): Promise<LocalWorkspaceFileEntry> {
    const resolved = this.resolve(input.path)
    await mkdir(path.dirname(resolved), { recursive: true })
    await writeFile(resolved, input.content)
    return this.describe(input.path)
  }

  async read(inputPath: string): Promise<string> {
    return readFile(this.resolve(inputPath), 'utf8')
  }

  async delete(inputPath: string): Promise<void> {
    await rm(this.resolve(inputPath), { force: true, recursive: true })
  }

  async describe(inputPath: string): Promise<LocalWorkspaceFileEntry> {
    const resolved = this.resolve(inputPath)
    const info = await stat(resolved)
    const kind = info.isDirectory() ? 'directory' : 'file'
    const content = kind === 'file' ? await readFile(resolved) : null
    return {
      path: inputPath,
      kind,
      size: kind === 'file' ? info.size : null,
      mtime: Math.trunc(info.mtimeMs),
      hash: content ? createHash('sha256').update(content).digest('hex') : null,
    }
  }

  async list(dir = ''): Promise<LocalWorkspaceFileEntry[]> {
    await this.ensureRoot()
    const base = this.resolve(dir)
    const names = await readdir(base)
    return Promise.all(names.map(name => this.describe(path.posix.join(dir, name))))
  }
}
