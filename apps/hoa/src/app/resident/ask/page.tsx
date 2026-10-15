import { ScreenHeader } from '@/components/resident/screen'
import { AskDocsClient } from './AskDocsClient'

export const metadata = { title: 'Ask the Docs' }

export default function ResidentAskPage() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Ask the Docs"
        subtitle="Ask about your community's governing documents. Every answer cites its section — and if the docs don't cover it, you'll be told so rather than given a guess."
      />
      <AskDocsClient />
    </div>
  )
}
