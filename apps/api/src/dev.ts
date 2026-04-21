import process from 'node:process'

// Dev helper: default to dashboard mode with ephemeral secrets if env is not pre-set.
process.env.AIWORKER_MODE ??= 'dashboard'
process.env.INTERNAL_SHARED_SECRET ??= 'dev-internal-secret-1234567890'
process.env.AIWORKER_MASTER_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

// eslint-disable-next-line antfu/no-top-level-await -- dev entry point mirrors the production entry
await import('./index')
