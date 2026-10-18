import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Button, EmptyState } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { OPEN_BOOKS_ADDS } from '@/lib/accounting/books-not-open'
import { OpenBooksForm } from './OpenBooksForm'

export { OPEN_BOOKS_ADDS }

/**
 * The association exists but its books are incomplete: no fiscal period,
 * no chart of accounts or no funds (BL-064). The sibling of
 * `AssociationNotSetUp`, with the same split:
 *   - an org admin gets "Open the books" (`setUpAssociationCore`, which
 *     only adds what is missing);
 *   - a board member is sent to Members, where the admins are listed.
 *
 * Use only after the read SUCCEEDED and found nothing; a failed read is
 * `LoadFailed`.
 */
export async function BooksNotOpen({
  title,
  needFor,
  returnTo,
  icon = <BookOpen aria-hidden />,
  variant,
}: {
  title: string
  /** Why this page needs the missing piece, one sentence. */
  needFor: string
  returnTo: string
  icon?: React.ReactNode
  variant?: 'dashed' | 'plain' | 'compact'
}) {
  const ctx = await getCurrentUserRole()
  const isAdmin = ctx?.role === 'admin'

  return isAdmin ? (
    <EmptyState
      variant={variant}
      icon={icon}
      title={title}
      description={`${needFor} ${OPEN_BOOKS_ADDS}`}
      action={<OpenBooksForm returnTo={returnTo} />}
    />
  ) : (
    <EmptyState
      variant={variant}
      icon={icon}
      title={title}
      description={`${needFor} Only an admin of your HOA can open the books — ask one to open this page.`}
      action={<SeeAdminsButton />}
    />
  )
}

export function SeeAdminsButton({ variant = 'secondary' }: { variant?: 'default' | 'secondary' }) {
  return (
    <Button asChild variant={variant}>
      <Link href="/settings/members">See your HOA’s admins</Link>
    </Button>
  )
}
