'use client'

import { useActionState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { openBooks, type OpenBooksState } from '@/lib/association-setup-actions'

const initial: OpenBooksState = {}

/**
 * "Open the books" (BL-064): one submit adds whatever the association's
 * books are missing — the Operating and Reserve funds, the standard chart
 * of accounts, this year's fiscal period — then returns to `returnTo`.
 * Safe to press twice: it only adds what is missing. Admins only; the
 * action refuses anyone else.
 */
export function OpenBooksForm({
  returnTo,
  variant = 'default',
}: {
  returnTo: string
  variant?: 'default' | 'secondary'
}) {
  const [state, action, pending] = useActionState(openBooks, initial)

  return (
    <form action={action} className="flex flex-col items-center gap-2 sm:items-start">
      <input type="hidden" name="return_to" value={returnTo} />
      <Button type="submit" variant={variant} icon={<BookOpen aria-hidden />} loading={pending}>
        Open the books
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
