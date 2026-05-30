import process from 'node:process'

// micro-app 挂载/就绪等待上限。默认 45s 容忍高系统负载（load≈15 下 15s 会 flake）；
// CI/本地可经 AIWORKER_BROWSER_MOUNT_TIMEOUT_MS 调整。
export const MOUNT_TIMEOUT_MS = Number.parseInt(process.env.AIWORKER_BROWSER_MOUNT_TIMEOUT_MS ?? '', 10) || 45_000
