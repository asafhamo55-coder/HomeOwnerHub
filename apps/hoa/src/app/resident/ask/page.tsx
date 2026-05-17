import { AskDocsClient } from './AskDocsClient'

export const metadata = { title: 'Ask the Docs' }

export default function ResidentAskPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Ask the Docs</h1>
        <p className="text-sm text-muted">
          Ask a question about your association's governing documents.
          Every answer cites the section it came from. If the docs don't
          cover it, you'll get told so rather than a guess.
        </p>
      </header>

      <AskDocsClient />
    </div>
  )
}
