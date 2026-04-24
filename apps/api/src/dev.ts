import process from 'node:process'

// Dev helper: worker 模式默认值 + 临时 secret,便于 bun dev 直接起来。
process.env.AIWORKER_MODE ??= 'worker'
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
