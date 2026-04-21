import type { CreateWorkerInput, UpdateWorkerInput, Worker, WorkerConfig, WorkerSummary } from '@aiworker/shared'

import { AppError } from '../../shared'

// PLAN-004 3.1-3.2: Manager switches from owning worker config/secrets to
// registering existing workers and proxying to their own HTTP APIs. Subtask
// 1.3 removed the underlying `workers` / `worker_configs` / `worker_secrets`
// tables from fleet.db; every legacy helper below is now a typed stub that
// preserves the call signatures consumed by `routes.ts` and `supervisor/*`
// but throws at runtime. Subtask 3.1 replaces these with a registry client
// and subtask 3.2 rewrites the service against `registered_workers`.

function notImplemented(fn: string): never {
  throw AppError.internal(`Fleet service "${fn}" pending PLAN-004 3.1-3.2 rewrite`)
}

// PLAN-004 3.2: replace with registry insert + worker /info validation.
export async function createWorker(_input: CreateWorkerInput): Promise<Worker> {
  notImplemented('createWorker')
}

// PLAN-004 3.2: replace with registry lookup.
export function getWorker(_id: string): Worker | null {
  notImplemented('getWorker')
}

// PLAN-004 3.2: replace with registry lookup by displayName/baseUrl.
export function getWorkerBySlug(_slug: string): Worker | null {
  notImplemented('getWorkerBySlug')
}

// PLAN-004 3.2: replace with registry list.
export function listWorkers(): Worker[] {
  notImplemented('listWorkers')
}

// PLAN-004 3.2: replace with registry list + cached /info projection.
export function listWorkerSummaries(): WorkerSummary[] {
  notImplemented('listWorkerSummaries')
}

// PLAN-004 3.2: replace with proxy call to worker `GET /api/worker/config`.
export function getRedactedConfig(_workerId: string): WorkerConfig | null {
  notImplemented('getRedactedConfig')
}

// PLAN-004 3.2: replace with proxy call to worker `GET /api/worker/config`
// (resolved configs never leave the worker under PLAN-004).
export async function getResolvedConfig(_workerId: string): Promise<WorkerConfig | null> {
  notImplemented('getResolvedConfig')
}

// PLAN-004 3.2: replace with registry patch + proxy PUT to worker `/config`.
export async function updateWorker(_id: string, _input: UpdateWorkerInput): Promise<Worker> {
  notImplemented('updateWorker')
}

// PLAN-004 3.2: replace with registry row delete (worker itself untouched).
export async function deleteWorker(_id: string): Promise<void> {
  notImplemented('deleteWorker')
}

// PLAN-004 3.4: MANAGER_CAN_LAUNCH-gated supervisor will track container ids
// separately from the registry; until then the hook is a no-op stub.
export function setContainerId(_workerId: string, _containerId: string | null): void {
  notImplemented('setContainerId')
}
