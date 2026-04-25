import type { FSWatcher } from 'node:fs'

import type { WatchEvent, WatchEventType } from './types'

import { watch } from 'node:fs'
import { join } from 'node:path'

type WatchEventHandler = (event: WatchEvent) => void

function resolveKind(path: string): 'skill' | 'memory' {
  return path.includes('/skills/') || path.includes('\\skills\\') ? 'skill' : 'memory'
}

/**
 * Debounced directory watcher for `<home>/skills/` + `<home>/memories/`.
 * Callers register handlers via `on()` and invoke `start()` lazily. Safe to
 * start() multiple times — noop after the first call.
 */
export class FilesystemWatcher {
  private watchers: FSWatcher[] = []
  private handlers: WatchEventHandler[] = []
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private debounceMs: number
  private home: string
  private running = false

  constructor(options: { home: string, debounceMs?: number }) {
    this.home = options.home
    this.debounceMs = options.debounceMs ?? 100
  }

  on(handler: WatchEventHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx !== -1)
        this.handlers.splice(idx, 1)
    }
  }

  private emit(event: WatchEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event)
      }
      catch {
        // Ignore handler errors
      }
    }
  }

  private watchDir(dir: string): FSWatcher | null {
    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename)
          return

        const fullPath = join(dir, filename)
        const key = fullPath

        const existing = this.debounceTimers.get(key)
        if (existing)
          clearTimeout(existing)

        const timer = setTimeout(() => {
          this.debounceTimers.delete(key)
          const watchEventType: WatchEventType = eventType === 'rename' ? 'add' : 'modify'

          this.emit({
            type: watchEventType,
            path: fullPath,
            kind: resolveKind(fullPath),
            timestamp: Date.now(),
          })
        }, this.debounceMs)

        this.debounceTimers.set(key, timer)
      })

      return watcher
    }
    catch {
      return null
    }
  }

  async start(): Promise<void> {
    if (this.running)
      return

    this.running = true

    const skillsDir = join(this.home, 'skills')
    const memoriesDir = join(this.home, 'memories')

    const w1 = this.watchDir(skillsDir)
    const w2 = this.watchDir(memoriesDir)

    if (w1)
      this.watchers.push(w1)
    if (w2)
      this.watchers.push(w2)
  }

  stop(): void {
    this.running = false

    for (const watcher of this.watchers) {
      try {
        watcher.close()
      }
      catch {
        // Ignore close errors
      }
    }
    this.watchers = []

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  get isRunning(): boolean {
    return this.running
  }
}
