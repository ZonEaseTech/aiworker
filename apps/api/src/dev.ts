import process from 'node:process'

// Dev helper: default to dashboard mode with ephemeral secrets if env is not pre-set.
process.env.AIWORKER_MODE ??= 'dashboard'
process.env.INTERNAL_SHARED_SECRET ??= 'dev-internal-secret-1234567890'
process.env.AIWORKER_MASTER_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

// Re-export `index.ts`'s default `{ fetch, port }` so Bun's auto-serve picks
// up the port. Without re-exporting, `bun src/dev.ts` runs `boot()` (which
// only logs "listening on :PORT") and then exits before binding because the
// entry module has no default export of its own.
// eslint-disable-next-line antfu/no-top-level-await -- dev entry point mirrors the production entry
const indexModule = await import('./index')

export default indexModule.default
export const { app } = indexModule
