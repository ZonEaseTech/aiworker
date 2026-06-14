import { existsSync } from 'node:fs'

const deletedPaths = [
  'apps/worker-cli',
  'apps/worker-web',
  'packages/worker-daemon',
  'packages/worker-runtime',
  'packages/engine-bridge',
  'packages/engine-projection',
  'packages/worker-control-protocol',
  'apps/host-web',
  'apps/host-cli',
  'packages/storage-sqlite',
  'packages/ui',
  'packages/fs-layout',
  'packages/cli-doctor',
  'packages/host-control',
]

const offenders = deletedPaths.filter(path => existsSync(path))
if (offenders.length)
  throw new Error(`legacy Worker surfaces must stay deleted: ${offenders.join(', ')}`)

console.log('soul/app boundary ok: no AIWorker-owned Worker runtime surfaces')
