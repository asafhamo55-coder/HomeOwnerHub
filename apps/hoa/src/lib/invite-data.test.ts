import { describe, expect, it } from 'vitest'
import { buildInviteData, loadInviteNames } from './invite-data'

function db(opts: { assoc?: string | null; org?: string | null; throws?: boolean }) {
  return {
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'order', 'limit']) b[op] = () => b
      b.maybeSingle = async () => ({ data: opts.org ? { name: opts.org } : null })
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        (opts.throws
          ? Promise.reject(new Error('down'))
          : Promise.resolve({ data: t === 'associations' && opts.assoc ? [{ name: opts.assoc }] : [] })
        ).then(res, rej)
      return b
    },
  }
}

describe('invite data for the email template', () => {
  it('passes org_name and association_name with the invited name', async () => {
    const names = await loadInviteNames(db({ assoc: 'Madison Park', org: 'Madison Park HOA' }), 'o1', 'Madison Park HOA')
    expect(buildInviteData('Pat Lee', names)).toEqual({
      full_name: 'Pat Lee',
      org_name: 'Madison Park HOA',
      association_name: 'Madison Park',
    })
  })

  it('falls back to the HOA name when there is no association, reading it when not given', async () => {
    const names = await loadInviteNames(db({ org: 'Oak HOA' }), 'o1')
    expect(buildInviteData(null, names)).toEqual({ org_name: 'Oak HOA', association_name: 'Oak HOA' })
  })

  it('sends nothing, and never throws, when no name can be read', async () => {
    const names = await loadInviteNames(db({ throws: true }), 'o1')
    expect(buildInviteData(null, names)).toBeUndefined()
  })
})
