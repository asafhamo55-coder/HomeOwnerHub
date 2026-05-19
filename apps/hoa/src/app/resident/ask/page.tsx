import { PageHeader } from '@homeowner-portal/ui'
import { AskDocsClient } from './AskDocsClient'

export const metadata = { title: 'Ask the Docs' }

export default function ResidentAskPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Ask the Docs"
        description="Ask a question about your association's governing documents. Every answer cites the section it came from. If the docs don't cover it, you'll get told so rather than a guess."
      />

      <AskDocsClient />
    </div>
  )
}
