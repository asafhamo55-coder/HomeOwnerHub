import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/** The hearing card's way into the print view of the hearing notice. */
export function PrintHearingNoticeLink({ violationId }: { violationId: string }) {
  return (
    <Button asChild variant="secondary" size="lg" className="min-h-12 print:hidden">
      <Link href={`/violations/${violationId}/hearing-notice`}>
        <Printer aria-hidden />
        Print the notice
      </Link>
    </Button>
  )
}
