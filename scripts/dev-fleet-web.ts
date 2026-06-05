import { join, resolve } from 'node:path'

export interface DevFleetEntry {
  apiPort: number
  appId: string
  soulName: string
  tmuxSession: string
  vitePort: number
  workerId: string
}

export interface DevFleetManifest {
  generatedAt: string
  home: string
  workers: Array<{
    apiUrl: string
    soul: string
    tmuxSession: string
    webUrl: string
    workerId: string
  }>
}

export const DEV_FLEET_TOPOLOGY: readonly DevFleetEntry[] = [
  {
    apiPort: 9217,
    appId: 'aiworker-freeform',
    soulName: 'AIWorker Freeform',
    tmuxSession: 'aiworker-vite-freeform',
    vitePort: 5173,
    workerId: 'dev-aiworker-freeform',
  },
  {
    apiPort: 9218,
    appId: 'google-ads',
    soulName: '谷歌推广',
    tmuxSession: 'aiworker-vite-google-ads',
    vitePort: 5174,
    workerId: 'dev-google-ads',
  },
  {
    apiPort: 9219,
    appId: 'hr-manager',
    soulName: '人事经理',
    tmuxSession: 'aiworker-vite-hr-manager',
    vitePort: 5175,
    workerId: 'dev-hr-manager',
  },
  {
    apiPort: 9220,
    appId: 'product-manager',
    soulName: '产品经理',
    tmuxSession: 'aiworker-vite-product-manager',
    vitePort: 5176,
    workerId: 'dev-product-manager',
  },
  {
    apiPort: 9221,
    appId: 'software-support',
    soulName: '软件客服',
    tmuxSession: 'aiworker-vite-software-support',
    vitePort: 5177,
    workerId: 'dev-software-support',
  },
] as const

export function buildManifest(input: { generatedAt: string, home: string, host: string }): DevFleetManifest {
  return {
    generatedAt: input.generatedAt,
    home: input.home,
    workers: DEV_FLEET_TOPOLOGY.map(entry => ({
      apiUrl: `http://${input.host}:${entry.apiPort}`,
      soul: entry.appId,
      tmuxSession: entry.tmuxSession,
      webUrl: `http://${input.host}:${entry.vitePort}`,
      workerId: entry.workerId,
    })),
  }
}

export function validateWorkerApp(input: {
  expectedAppId: string
  row: {
    appId: string
    id: string
  }
}): void {
  if (input.row.appId !== input.expectedAppId) {
    throw new Error(
      `worker id ${input.row.id} already exists for app ${input.row.appId}, expected ${input.expectedAppId}`,
    )
  }
}

function repoRoot(): string {
  return resolve(import.meta.dir, '..')
}

function aiworkerHome(): string {
  return process.env.AIWORKER_HOME || join(process.env.HOME || '.', '.aiworker-dev')
}

function manifestPath(home = aiworkerHome()): string {
  return join(home, 'dev-fleet-web.json')
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode !== 'start' && mode !== 'status' && mode !== 'clean') {
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  }

  repoRoot()
  manifestPath()
  throw new Error(`dev fleet web ${mode} command is unavailable in this incremental skeleton`)
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
