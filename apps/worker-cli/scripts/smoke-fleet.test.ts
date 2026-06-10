import { describe, expect, it } from 'bun:test'

import { DEV_SAMPLING_WORKER_CREATE_ENV, withDevSamplingCatalogEnv } from '../../../scripts/worker-create-catalog-view'
import { smokeFleetWorkerCreateArgs } from './smoke-fleet'

describe('smoke:fleet worker create contract', () => {
  it('keeps worker create args public and injects the internal dev-sampling catalog env', () => {
    expect(smokeFleetWorkerCreateArgs('w-hr', 'hr-manager')).toEqual([
      'worker',
      'create',
      'w-hr',
      '--app',
      'hr-manager',
    ])
    expect(withDevSamplingCatalogEnv({ AIWORKER_HOME: '/tmp/home' })).toMatchObject({
      AIWORKER_HOME: '/tmp/home',
      ...DEV_SAMPLING_WORKER_CREATE_ENV,
    })
  })
})
