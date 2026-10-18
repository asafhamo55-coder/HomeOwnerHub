'use client'

import Link from 'next/link'
import { Alert, Button } from '@homeowner-portal/ui'
import { OPEN_BOOKS_ADDS } from '@/lib/accounting/books-not-open'
import { OpenBooksForm } from './OpenBooksForm'

/**
 * Inline "the books aren't open" state for a form whose action returned
 * `books_not_open` (BL-072) — Generate dues, Add a due, Record payment,
 * Mark a bill paid. The client sibling of `BooksNotOpen`: an org admin gets
 * "Open the books" (back to `returnTo` afterwards), a board member the admins.
 *
 * It renders a <form> of its own, so place it OUTSIDE the calling form.
 */
export function BooksNotOpenNotice({ canOpenBooks, returnTo }: { canOpenBooks: boolean; returnTo: string }) {
  return (
    <Alert
      variant="warning"
      title="The books aren’t open yet"
      actions={
        canOpenBooks ? (
          <OpenBooksForm returnTo={returnTo} />
        ) : (
          <Button asChild variant="secondary">
            <Link href="/settings/members">See your HOA’s admins</Link>
          </Button>
        )
      }
    >
      {canOpenBooks
        ? `Dues and payments post to the association’s ledger, so its books have to be open first. ${OPEN_BOOKS_ADDS}`
        : 'Dues and payments post to the association’s ledger, so its books have to be open first. Only an admin of your HOA can open the books — ask one to do it.'}
    </Alert>
  )
}
