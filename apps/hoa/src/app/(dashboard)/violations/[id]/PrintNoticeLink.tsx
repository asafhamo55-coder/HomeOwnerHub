import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/** The "Notice as sent" card's way into the print view of the letter. */
export function PrintNoticeLink({ violationId }: { violationId: string }) {
  return (
    <Button asChild variant="secondary" size="lg" className="min-h-12 print:hidden">
      <Link href={`/violations/${violationId}/letter`}>
        <Printer aria-hidden />
        Print / Save as PDF
      </Link>
    </Button>
  )
}
