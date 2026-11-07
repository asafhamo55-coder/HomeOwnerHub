import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/** The decision card's way into the print view of the decision letter. */
export function PrintArcLetterLink({ arcId }: { arcId: string }) {
  return (
    <Button asChild variant="secondary" size="lg" className="min-h-12 print:hidden">
      <Link href={`/arc/${arcId}/letter`}>
        <Printer aria-hidden />
        Print the letter
      </Link>
    </Button>
  )
}
