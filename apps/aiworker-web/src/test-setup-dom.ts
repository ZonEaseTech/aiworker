// DOM setup for effect-exercising tests using happy-dom Window.
// Assigns all window properties to globalThis so React DOM and radix-ui find them.
import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/' })

// Copy all own properties from the happy-dom window onto globalThis
for (const key of Object.getOwnPropertyNames(win)) {
  if (key === 'undefined' || key === 'globalThis')
    continue
  try {
    const descriptor = Object.getOwnPropertyDescriptor(win, key)
    if (descriptor && !Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, { ...descriptor, configurable: true })
  }
  catch {
    // skip non-configurable / non-writable keys
  }
}

// React needs IS_REACT_ACT_ENVIRONMENT to enable act() support
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Ensure requestAnimationFrame is available (React scheduler uses it)
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = clearTimeout as unknown as typeof cancelAnimationFrame
}
