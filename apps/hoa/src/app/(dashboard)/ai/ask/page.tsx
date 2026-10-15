import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Button, Page } from '@homeowner-portal/ui'
import { AskDocsClient } from './AskDocsClient'

export const metadata = { title: 'Ask the Docs' }

export default function AskTheDocsPage() {
  return (
    <Page
      width="narrow"
      linkAs={Link}
      title="Ask the Docs"
      description="Answers grounded in your Declaration, Bylaws, Rules and amendments — or in your community records. Every document answer cites the section it came from; if the documents don’t cover it, the assistant says so rather than guessing."
      actions={
        <Button asChild variant="secondary">
          <Link href="/documents/governing">
            <FileText aria-hidden />
            Governing documents
          </Link>
        </Button>
      }
    >
      <AskDocsClient />
    </Page>
  )
}
