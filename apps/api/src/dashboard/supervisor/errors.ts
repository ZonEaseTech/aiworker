/**
 * Supervisor error shapes kept in their own module so consumers (the registry
 * route layer) can `instanceof`-check them without pulling in
 * `dashboardConfig`. The config module `.parse()`s at import time and expects
 * `AIWORKER_MODE`/`AIWORKER_MASTER_KEY` — not something test harnesses should
 * have to set just because they touch the registry routes.
 */

export class LaunchTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LaunchTimeoutError'
  }
}

export class LaunchFailedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'LaunchFailedError'
  }
}
