import type { MountedMicroAppHostData } from '@zonease/aiworker-soul-protocol'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'micro-app': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        'baseroute'?: string
        'data'?: MountedMicroAppHostData
        'destroy'?: boolean | string
        'name'?: string
        'router-mode'?: 'native' | 'native-scope' | 'pure' | 'search' | string
        'url'?: string
      }
    }
  }
}
