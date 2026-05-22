import { Button } from '@zonease/aiworker-ui/components/button'
import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { QaReleasePanelProof } from './panels/release-panel'
import { QaReleaseWidgetProof } from './widgets/release-widget'
import '@zonease/aiworker-ui/styles.css'

describe('QA product web shared component proof', () => {
  it('renders a shared release widget shell without moving QA meaning into the component package', () => {
    const html = renderToStaticMarkup(<QaReleaseWidgetProof />)

    expect(html).toContain('Release Readiness')
    expect(html).toContain('Shared UI')
    expect(html).toContain('QA owns release verdict meaning')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="item-content"')
    expect(html).toContain('data-slot="card-description"')
    expect(html).toContain('data-slot="badge"')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('release-widget-shell')
    expect(html).not.toContain('studio-pill')
  })

  it('renders a shared release panel shell while keeping QA verdict meaning local', () => {
    const html = renderToStaticMarkup(<QaReleasePanelProof />)

    expect(html).toContain('Release Gate Review')
    expect(html).toContain('Soul-owned verdict')
    expect(html).toContain('QA Soul App decides pass, risk, and blocker semantics')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="item-content"')
    expect(html).toContain('data-slot="card-description"')
    expect(html).toContain('data-slot="badge"')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('release-panel-shell')
    expect(html).not.toContain('studio-pill')
  })

  it('can consume the shadcn-managed shared UI package directly', () => {
    const html = renderToStaticMarkup(<Button variant="secondary">Review release</Button>)

    expect(html).toContain('data-slot="button"')
    expect(html).toContain('data-variant="secondary"')
    expect(html).toContain('Review release')
  })
})
