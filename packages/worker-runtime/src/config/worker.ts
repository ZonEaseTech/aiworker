import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerHome } from '@zonease/aiworker-fs-layout'
import { defaultWorkerMigrationsFolder } from '@zonease/aiworker-storage-sqlite/worker'
import { z } from 'zod'

function blankEnvValueAsUnset<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess(value => value === '' ? undefined : value, inner)
}

const schema = z.object({
  PORT: blankEnvValueAsUnset(z.coerce.number().int().min(1).default(9217)),
  AIWORKER_WORKER_HOST: blankEnvValueAsUnset(z.string().min(1).default('127.0.0.1')),
  WORKER_DB_PATH: blankEnvValueAsUnset(z.string().default(() => path.join(resolveAiworkerHome(), 'aiworker.db'))),
  WORKER_MIGRATIONS_FOLDER: blankEnvValueAsUnset(z.string().default(() => defaultWorkerMigrationsFolder)),
  WORKER_WORKSPACE_ROOT: blankEnvValueAsUnset(z.string().default(() => path.join(resolveAiworkerHome(), 'workers'))),
  AIWORKER_LOCAL_TOKEN: blankEnvValueAsUnset(z.string().min(16).optional()),
})

export type WorkerEnv = z.infer<typeof schema>

let cached: WorkerEnv | null = null

export function __resetWorkerEnvCacheForTest(): void {
  cached = null
}

export function getWorkerEnv(): WorkerEnv {
  if (cached)
    return cached
  cached = Object.freeze(schema.parse(process.env))
  return cached
}

export const workerEnv: WorkerEnv = new Proxy({} as WorkerEnv, {
  get(_target, prop) {
    return getWorkerEnv()[prop as keyof WorkerEnv]
  },
  has(_target, prop) {
    return prop in getWorkerEnv()
  },
  ownKeys() {
    return Reflect.ownKeys(getWorkerEnv())
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getWorkerEnv(), prop)
  },
})
