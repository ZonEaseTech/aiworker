import type { SoulWorkbenchContext } from './types'

import { getSpecializedWorkbenchRenderer } from './renderers'

export function SoulWorkbenchRenderer({ context }: { context: SoulWorkbenchContext }) {
  const Renderer = getSpecializedWorkbenchRenderer(context.workbench)
  return Renderer ? <Renderer context={context} /> : null
}
