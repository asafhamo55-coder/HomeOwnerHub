import { ScreenHeader } from '@/components/resident/screen'
import { resolveResidentAssistant } from '@/lib/resident-assistant/server'
import { AskDocsClient } from './AskDocsClient'
import { ResidentAssistantClient } from './ResidentAssistantClient'

export const metadata = { title: 'Ask' }
export const dynamic = 'force-dynamic'

// BL-096: the resident assistant chat when the board's "Resident assistant"
// switch is on (off until the board turns it on). Off, impersonating, no
// linked home, or no model configured:
// today's single-question Ask the Docs.
export default async function ResidentAskPage() {
  const gate = await resolveResidentAssistant()

  if (!gate.on) {
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

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Ask"
        subtitle="Your assistant for dues, requests, meetings and your community's rules. It can only see your own account."
      />
      <ResidentAssistantClient storageKey={`hoa.resident-assistant.v1.${gate.scope.orgId}.${gate.scope.userId ?? 'anon'}`} />
    </div>
  )
}
