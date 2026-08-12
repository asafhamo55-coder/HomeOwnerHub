import { describe, it, expect } from 'vitest'
import { renderTemplate } from './templates'

// Guards the contract send.ts relies on: extraMergeFields values are
// spread into the same flat bag renderTemplate consumes, and an absent
// field renders as empty rather than throwing.
describe('merge bag contract', () => {
  it('renders a per-recipient HTML fragment through a placeholder', () => {
    const bag = {
      owner_name: 'Dana',
      dues_table: '<table><tr><td>$310.00</td></tr></table>',
    }
    const { rendered } = renderTemplate('Hi {{owner_name}}, {{dues_table}}', bag)

    expect(rendered).toBe('Hi Dana, <table><tr><td>$310.00</td></tr></table>')
  })

  it('renders an absent placeholder as empty and reports it', () => {
    const { rendered, missingFields } = renderTemplate('A{{nope}}B', { owner_name: 'Dana' })

    expect(rendered).toBe('AB')
    expect(missingFields).toEqual(['nope'])
  })
})
