import process from 'node:process'

/**
 * Default env for `bun test`. The worker-mode config schema requires
 * `AIWORKER_MASTER_KEY` to be a 64-hex-char string; tests that exercise
 * modules transitively importing `workerEnv` rely on this default.
 * Individual tests may override before their own imports load.
 */
if (process.env.AIWORKER_MASTER_KEY === undefined) {
  process.env.AIWORKER_MASTER_KEY
    = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
}
