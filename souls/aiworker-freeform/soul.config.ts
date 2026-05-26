import { capability, defineSoul } from '@zonease/aiworker-soul-app-sdk'

export default defineSoul({
  appId: 'aiworker-freeform',
  capabilities: [
    capability({
      id: 'default',
      name: 'Freeform Session',
      purpose: 'Start an open-ended engine-backed AIWorker session inside a workspace locator.',
    }),
  ],
  description: 'Open-ended Soul for freeform local work.',
  id: 'aiworker-freeform',
  name: 'AIWorker Freeform',
  soulId: 'freeform',
  version: '0.1.0',
})
