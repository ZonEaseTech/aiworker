import { readdirSync, readFileSync, statSync } from 'node:fs'

import { Button } from '@zonease/aiworker-ui/components/button'
import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { HrProfilePanelProof } from './panels/profile-panel'
import { HrHomeRouteSurface } from './routes/hr-route'
import { HrPeopleWidgetProof } from './widgets/people-widget'
import '@zonease/aiworker-ui/styles.css'

describe('HR product web shared component proof', () => {
  it('renders a shared profile shell without moving HR meaning into the component package', () => {
    const html = renderToStaticMarkup(<HrPeopleWidgetProof />)

    expect(html).toContain('People Profile')
    expect(html).toContain('Shared UI')
    expect(html).toContain('HR owns the profile meaning')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="item-content"')
    expect(html).toContain('data-slot="card-description"')
    expect(html).toContain('data-slot="badge"')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('profile-reader-shell')
    expect(html).not.toContain('studio-pill')
  })

  it('renders a shared profile patch panel shell while keeping HR meaning local', () => {
    const html = renderToStaticMarkup(<HrProfilePanelProof />)

    expect(html).toContain('Profile Patch')
    expect(html).toContain('Soul-owned meaning')
    expect(html).toContain('HR Soul App owns the profile patch meaning')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="item-content"')
    expect(html).toContain('data-slot="card-description"')
    expect(html).toContain('data-slot="badge"')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('review-panel-shell')
    expect(html).not.toContain('studio-pill')
  })

  it('renders the HR home route as an app-owned shadcn mounted surface', () => {
    const html = renderToStaticMarkup(<HrHomeRouteSurface />)

    expect(html).toContain('Ben People Profile')
    expect(html).toContain('People Profiles')
    expect(html).toContain('Profile patch ready')
    expect(html).toContain('Primary sources')
    expect(html).toContain('Confirmed Facts')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="table"')
    expect(html).toContain('data-slot="badge"')
    expect(html).not.toContain('hr-people-layout')
    expect(html).not.toContain('profile-reader-shell')
  })

  it('renders an app-owned profile-first workbench route with shadcn primitives', () => {
    const html = renderToStaticMarkup(
      <HrHomeRouteSurface
        profiles={[
          {
            evidenceCount: 4,
            id: 'profile-ben',
            name: 'Ben People Profile',
            nextAction: 'Review README patch',
            reviewStatus: 'Profile patch ready',
            stage: 'Candidate',
            status: 'ready-for-review',
            summary: 'Accepted profile baseline is ready for a source-backed README patch.',
          },
          {
            evidenceCount: 2,
            id: 'profile-stella',
            name: 'Stella People Profile',
            nextAction: 'Capture profile update',
            reviewStatus: 'Profile updated',
            stage: 'Employee',
            status: 'reviewed',
            summary: 'Updated profile with active lifecycle notes.',
          },
        ]}
        selectedProfileId="profile-ben"
      />,
    )

    expect(html).toContain('People Profiles')
    expect(html).toContain('Ben People Profile')
    expect(html).toContain('Current Profile Summary')
    expect(html).toContain('Profile patch ready')
    expect(html).toContain('Review README patch')
    expect(html).toContain('Primary sources')
    expect(html).toContain('Confirmed Facts')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="item"')
    expect(html).toContain('data-slot="button"')
    expect(html).toContain('data-slot="badge"')
    expect(html).toContain('data-slot="table"')
    expect(html).toContain('h-10 w-full justify-between gap-2 overflow-hidden px-3 py-0 whitespace-nowrap')
    expect(html).toContain('max-w-[52%] shrink-0 truncate text-right')
    expect((html.match(/data-slot="card"/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('hr-people-layout')
    expect(html).not.toContain('hr-profile-tools-panel')
  })

  it('renders the HR people workbench as three visible columns by default', () => {
    const html = renderToStaticMarkup(<HrHomeRouteSurface />)

    expect(html).toContain('data-slot="hr-profile-list-column"')
    expect(html).toContain('data-slot="hr-reading-room-column"')
    expect(html).toContain('data-slot="hr-profile-composer-column"')
    expect(html).toContain('data-layout="reading-room-primary"')
    expect(html).toContain('data-hr-child-route="/hr"')
    expect(html).toContain('data-hr-route-action="new-profile"')
    expect(html).toContain('data-hr-profile-id="profile-ben"')
    expect(html).toContain('data-hr-route-path="/hr/profiles/profile-ben"')
    expect(html).toContain('data-slot="hr-composer-pane"')
    expect(html).toContain('data-slot="hr-recent-sessions-list"')
    expect(html).toContain('data-slot="hr-empty-placeholder"')
    expect(html).toContain('hr-reading-room-grid')
    expect(html).toContain('data-left-panel="open"')
    expect(html).toContain('data-right-panel="open"')
    expect(html).not.toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
    expect(html).toContain('data-slot="hr-profile-composer"')
    expect(html).toContain('候选人')
    expect(html).toContain('在职员工')
    expect(html).toContain('离职归档')
    expect(html).toContain('Recent Sessions')
    expect(html).toContain('候选人档案草案')
  })

  it('can consume the shadcn-managed shared UI package directly', () => {
    const html = renderToStaticMarkup(<Button variant="secondary">Review profile</Button>)

    expect(html).toContain('data-slot="button"')
    expect(html).toContain('data-variant="secondary"')
    expect(html).toContain('Review profile')
  })

  it('keeps product web proof surfaces on shared UI and app-owned sources', () => {
    const widgetSource = readFileSync(new URL('./widgets/people-widget.tsx', import.meta.url), 'utf8')
    const panelSource = readFileSync(new URL('./panels/profile-panel.tsx', import.meta.url), 'utf8')
    const routeSource = readFileSync(new URL('./routes/hr-route.tsx', import.meta.url), 'utf8')
    const peopleWorkbenchSource = readSourceTree(new URL('./people-workbench', import.meta.url))

    expect(widgetSource).toContain('@zonease/aiworker-ui/components/card')
    expect(panelSource).toContain('@zonease/aiworker-ui/components/card')
    expect(routeSource).toContain('./people-workbench')
    expect(peopleWorkbenchSource).toContain('@zonease/aiworker-ui/components/card')
    expect(peopleWorkbenchSource).not.toContain('lucide-react')
    expect(peopleWorkbenchSource).not.toContain('apps/web/src')
    expect(peopleWorkbenchSource).not.toContain('../../../../features/i18n')
    expect(peopleWorkbenchSource).toContain('@zonease/aiworker-ui/components/collapsible-group')
    expect(peopleWorkbenchSource).not.toMatch(/@zonease\/aiworker-ui\/components\/collapsible['"]/)
    expect(peopleWorkbenchSource).not.toContain('profileStatusBadgeVariant')
  })
})

function readSourceTree(root: URL): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const url = new URL(`${entry}`, root.href.endsWith('/') ? root : new URL(`${root.href}/`))
      const path = url.pathname
      if (statSync(url).isDirectory())
        return readSourceTree(new URL(`${entry}/`, root.href.endsWith('/') ? root : new URL(`${root.href}/`)))
      if (!/\.(?:ts|tsx)$/.test(path))
        return []
      return readFileSync(url, 'utf8')
    })
    .join('\n')
}
