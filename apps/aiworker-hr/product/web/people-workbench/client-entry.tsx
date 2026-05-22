import { createRoot, hydrateRoot } from 'react-dom/client'

import { readHrHostDataFromDocument } from './app'
import { HrPeopleWorkbenchSurface } from './surface'

const root = document.getElementById('aiworker-hr-root')

if (root) {
  const hostData = readHrHostDataFromDocument(document)
  const app = <HrPeopleWorkbenchSurface initialHostData={hostData} />
  if (root.hasChildNodes() && !hostData.routePrefix.startsWith('standalone://'))
    hydrateRoot(root, app)
  else
    createRoot(root).render(app)
}
