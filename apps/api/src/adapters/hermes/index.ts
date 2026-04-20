import type { HermesMemory, HermesSkill, WatchEvent } from './types'

import consola from 'consola'

import { HermesApiClient } from './api-client'
import { scanMemories, scanSkills } from './fs-scanner'
import { HermesWatcher } from './watcher'

export { HermesApiClient } from './api-client'
export { scanMemories, scanSkills } from './fs-scanner'
export type { HermesMemory, HermesSkill, WatchEvent } from './types'
export { HermesWatcher } from './watcher'

export interface HermesAdapterOptions {
  apiUrl: string
  hermesHome: string
  timeoutMs?: number
  debounceMs?: number
}

export class HermesAdapter {
  readonly client: HermesApiClient
  readonly watcher: HermesWatcher
  private readonly hermesHome: string

  constructor(options: HermesAdapterOptions) {
    this.hermesHome = options.hermesHome
    this.client = new HermesApiClient({
      baseUrl: options.apiUrl,
      timeoutMs: options.timeoutMs,
    })
    this.watcher = new HermesWatcher({
      hermesHome: options.hermesHome,
      debounceMs: options.debounceMs,
    })
  }

  async scanSkills(): Promise<HermesSkill[]> {
    return scanSkills(this.hermesHome)
  }

  async scanMemories(): Promise<HermesMemory[]> {
    return scanMemories(this.hermesHome)
  }

  onWatch(handler: (event: WatchEvent) => void): () => void {
    return this.watcher.on(handler)
  }

  async start(): Promise<void> {
    await this.watcher.start()
    consola.info('[hermes] Adapter started, watching for file changes')
  }

  stop(): void {
    this.watcher.stop()
    consola.info('[hermes] Adapter stopped')
  }
}
