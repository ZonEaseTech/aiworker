import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { HrProfilePanelProof } from './panels/profile-panel'
import { HrPeopleWidgetProof } from './widgets/people-widget'

describe('HR product web shared component proof', () => {
  it('renders a shared profile shell without moving HR meaning into the component package', () => {
    const html = renderToStaticMarkup(<HrPeopleWidgetProof />)

    expect(html).toContain('People Profile')
    expect(html).toContain('Shared UI')
    expect(html).toContain('HR owns the profile meaning')
  })

  it('renders a shared review panel shell while keeping HR review meaning local', () => {
    const html = renderToStaticMarkup(<HrProfilePanelProof />)

    expect(html).toContain('Profile Review')
    expect(html).toContain('Soul-owned meaning')
    expect(html).toContain('HR Soul App decides what the review means')
  })
})
