// "The books aren't open" — the shared failure for any action that posts to
// the ledger and finds no open fiscal period, chart of accounts or funds
// (BL-072). It replaced "run pnpm seed:accounting", a step no board can take.
//
// The `code` lets a form swap the toast for BooksNotOpenNotice, which offers
// "Open the books" (an org admin, `openBooks`) or the admins list (board).
// Plain module, not 'use server', so client components can import the copy.

export const BOOKS_NOT_OPEN_CODE = 'books_not_open' as const

export const BOOKS_NOT_OPEN_MESSAGE =
  'Your association’s books aren’t open yet, so nothing can be posted to the ledger. Open the books first.'

/** What "Open the books" adds — shown next to the button. */
export const OPEN_BOOKS_ADDS =
  'Opening the books adds whatever is missing — Operating and Reserve funds, a standard chart of accounts and this year’s fiscal period — and never changes what is already there.'

export interface BooksNotOpenFailure {
  ok: false
  error: string
  code: typeof BOOKS_NOT_OPEN_CODE
  /** Only an org admin may open the books (`openBooks` refuses anyone else). */
  canOpenBooks: boolean
  /** Never a field problem; present so callers can read it off any failure. */
  fieldErrors?: undefined
}

export function booksNotOpen(role: 'admin' | 'board'): BooksNotOpenFailure {
  return { ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: BOOKS_NOT_OPEN_CODE, canOpenBooks: role === 'admin' }
}

export function isBooksNotOpen(r: { ok: boolean; code?: string }): r is BooksNotOpenFailure {
  return !r.ok && r.code === BOOKS_NOT_OPEN_CODE
}
