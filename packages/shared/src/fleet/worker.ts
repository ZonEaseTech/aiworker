import type { WorkerConfig } from './config'

/** Lifecycle of a worker within the fleet. */
export type WorkerStatus = 'active' | 'paused' | 'archived'

/** Live state of the docker container that hosts a worker. */
export type WorkerContainerState = 'running' | 'stopped' | 'restarting' | 'created' | 'exited' | 'unknown'

/**
 * A worker is the operational identity of one agent in the fleet.
 *
 * `id` is an immutable short token (`w_` + 12 Crockford base32 chars, e.g. `w_k7hp3m2nq8fz`)
 * that appears in webhook URLs registered with external platforms; once issued it
 * must never change. `slug` is a human-chosen alias used inside the dashboard.
 */
export interface Worker {
  id: string
  slug: string
  name: string
  description?: string
  status: WorkerStatus
  containerId?: string
  containerImage: string
  configVersion: number
  createdAt: string
  updatedAt: string
}

/** Compact projection of a worker suitable for list views. */
export interface WorkerSummary {
  id: string
  slug: string
  name: string
  status: WorkerStatus
  enabledChannels: string[]
  brainCount: number
  executorType: WorkerConfig['executor']['engine']
  containerState?: WorkerContainerState
  lastActivityAt?: string
}

/** Payload accepted by the dashboard when creating a new worker. */
export interface CreateWorkerInput {
  name: string
  /** Optional; auto-derived from `name` when omitted. */
  slug?: string
  description?: string
  config: WorkerConfig
}

/** Partial update payload for an existing worker. */
export interface UpdateWorkerInput {
  name?: string
  slug?: string
  description?: string
  status?: WorkerStatus
  config?: WorkerConfig
}

/** Regex for validating the immutable worker id token. */
export const WORKER_ID_PATTERN = /^w_[0-9a-hjkmnp-tv-z]{12}$/

/** Crockford base32 alphabet used when minting new worker ids. */
export const WORKER_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
