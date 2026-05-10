import { AskDocsClient } from './AskDocsClient'

export const metadata = { title: 'Ask the Docs' }

export default function AskTheDocsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">Ask the Docs</h1>
        <p className="text-sm text-muted-fg">
          The Governing Docs Brain answers questions grounded in your
          association&apos;s Declaration, Bylaws, Rules, and amendments. Every
          answer cites the section it came from. If the docs don&apos;t cover
          it, the AI says so rather than guessing.
        </p>
      </header>

      <AskDocsClient />
    </div>
  )
}
