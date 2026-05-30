import { afterEach } from 'vitest'

afterEach(async () => {
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})

declare global {
  // eslint-disable-next-line vars-on-top
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

if (typeof globalThis.IS_REACT_ACT_ENVIRONMENT === 'undefined')
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
