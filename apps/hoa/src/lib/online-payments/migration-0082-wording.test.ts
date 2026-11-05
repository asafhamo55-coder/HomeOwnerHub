/**
 * The webhook retries a held reversal only because reversals-deps.ts recognises the exact RAISE
 * wording of migration 0082. If the wording changes, retries would silently become ignores and a
 * refund or dispute arriving while the books are closed would be lost. Read-only text check.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(__dirname, '../../../../../migrations/0082_money_integrity.sql'), 'utf8')

describe('0082 books_not_open wording', () => {
  it('reverse_online_payment still raises books_not_open with errcode 55000', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000'/i)
  })
  it('the posting trigger still raises closed_period with errcode 55000', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'closed_period' USING ERRCODE = '55000'/)
  })
})
