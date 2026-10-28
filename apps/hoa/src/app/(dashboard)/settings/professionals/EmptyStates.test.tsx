import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OfficerRow } from '@/lib/professionals/load'
import { INVITE_FORM_ID, NoProfessionalsYet, NoTreasurerNotice, OFFICERS_LIST_ID } from './EmptyStates'

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

const row = (title: OfficerRow['title'], id = 'u1'): OfficerRow => ({ userId: id, email: null, fullName: 'Board member', title })

describe('professionals empty state (round-8 #5)', () => {
  it('says what the page is for and offers the invite action', () => {
    const html = renderToStaticMarkup(h(NoProfessionalsYet))
    expect(html).toContain('No CPA or attorney yet')
    expect(html).toContain('Invite your CPA or attorney')
    expect(html).toContain(`href="#${INVITE_FORM_ID}"`)
    expect(html).toContain('Invite a CPA or attorney')
  })
})

describe('no-Treasurer notice (round-8 #5)', () => {
  it('prompts an admin to set the Treasurer and explains approval routing', () => {
    const html = renderToStaticMarkup(h(NoTreasurerNotice, { rows: [row(null), row('president', 'u2')], canEdit: true }))
    expect(html).toContain('No Treasurer set')
    expect(html).toContain('money approvals go to them first')
    expect(html).toContain(`href="#${OFFICERS_LIST_ID}"`)
  })

  it('is hidden once a Treasurer exists', () => {
    expect(renderToStaticMarkup(h(NoTreasurerNotice, { rows: [row('treasurer')], canEdit: true }))).toBe('')
  })

  it('shows a board member no action link, only the explanation', () => {
    const html = renderToStaticMarkup(h(NoTreasurerNotice, { rows: [row(null)], canEdit: false }))
    expect(html).toContain('No Treasurer set')
    expect(html).toContain('Ask an admin to set it')
    expect(html).not.toContain('href=')
  })

  it('sends an admin with no board members to the members page', () => {
    const html = renderToStaticMarkup(h(NoTreasurerNotice, { rows: [], canEdit: true }))
    expect(html).toContain('href="/settings/members"')
    expect(html).not.toContain(`href="#${OFFICERS_LIST_ID}"`)
  })
})
