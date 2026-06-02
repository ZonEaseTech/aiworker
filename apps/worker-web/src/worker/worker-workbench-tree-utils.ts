import type { LocalWorker } from '@zonease/aiworker-soul-descriptor'

export function shortWorkerId(workerId: string): string {
  if (workerId.length <= 14)
    return workerId
  return `${workerId.slice(0, 8)}...${workerId.slice(-4)}`
}

export function workerIdentityDetail(worker: LocalWorker, hasDuplicateName: boolean): string {
  if (!hasDuplicateName)
    return 'Soul worker'
  const createdDate = worker.createdAt.slice(0, 10)
  return createdDate
    ? `id ${shortWorkerId(worker.id)} / ${createdDate}`
    : `id ${shortWorkerId(worker.id)}`
}
