import type { CreateWorkerInput, UpdateWorkerInput, Worker, WorkerConfig, WorkerSummary } from '@aiworker/shared'

import { AppError } from '../../shared'

/**
 * PLAN-004 3.1: replaced by registry service.
 *
 * The dashboard fleet/registry surface is being rewritten in subtask 3.1 to
 * operate on the new `registered_workers` table and to contact each worker's
 * HTTP API for config / secrets rather than reaching into a central vault.
 * Until 3.1 lands the routes defined here short-circuit with 503 so the rest
 * of the codebase still compiles and the worker-side changes in 2.1 are not
 * blocked by the in-flight dashboard redesign.
 */

function notImplemented(): never {
  throw new AppError('SERVICE_UNAVAILABLE', 503, 'Dashboard fleet service is under replacement by PLAN-004 3.1 (registered workers).')
}

export async function createWorker(_input: CreateWorkerInput): Promise<Worker> {
  return notImplemented()
}

export function getWorker(_id: string): Worker | null {
  return notImplemented()
}

export function getWorkerBySlug(_slug: string): Worker | null {
  return notImplemented()
}

export function listWorkers(): Worker[] {
  return notImplemented()
}

export function listWorkerSummaries(): WorkerSummary[] {
  return notImplemented()
}

export function getRedactedConfig(_workerId: string): WorkerConfig | null {
  return notImplemented()
}

export async function getResolvedConfig(_workerId: string): Promise<WorkerConfig | null> {
  return notImplemented()
}

export async function updateWorker(_id: string, _input: UpdateWorkerInput): Promise<Worker> {
  return notImplemented()
}

export async function deleteWorker(_id: string): Promise<void> {
  return notImplemented()
}

export function setContainerId(_workerId: string, _containerId: string | null) {
  return notImplemented()
}
