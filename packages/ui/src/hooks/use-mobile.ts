import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function getMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerMobileSnapshot() {
  return false
}

function subscribeMobileSnapshot(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY)

  mql.addEventListener('change', onStoreChange)

  return () => mql.removeEventListener('change', onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeMobileSnapshot,
    getMobileSnapshot,
    getServerMobileSnapshot,
  )
}
