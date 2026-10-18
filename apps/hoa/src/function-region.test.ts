import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// BL-074: the production database (Supabase project xwdjsxfskvreguyvryhc)
// lives in West US (Oregon), AWS us-west-2. Vercel's default function
// region is iad1 (Washington DC); production responses were stamped
// `x-vercel-id: iad1::iad1::…`, so every Supabase round trip from a page
// render crossed the continent (~70 ms each, and a board page makes many,
// several of them in series). pdx1 (Portland) is the Vercel region in the
// same AWS region as the database.
//
// If the database ever moves, move this with it — the pair is what matters.
const DATABASE_REGION_VERCEL_EQUIVALENT = 'pdx1'

describe('hoa function region', () => {
  it('runs server functions next to the database', () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as {
      regions?: string[]
    }
    expect(config.regions).toEqual([DATABASE_REGION_VERCEL_EQUIVALENT])
  })
})
