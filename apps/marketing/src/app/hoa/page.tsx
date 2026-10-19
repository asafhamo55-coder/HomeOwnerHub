import type { Metadata } from 'next'
import { Check, Clock } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HubHero } from '@/components/hub/hub-hero'
import { HubPersona } from '@/components/hub/hub-persona'
import { HubFeatures } from '@/components/hub/hub-features'
import { HubCta } from '@/components/hub/hub-cta'
import { HUBS } from '@/components/hub/hub-theme'
import { HoaDashboardVisual } from '@/components/hub/visuals/hoa-dashboard'
import { ViolationDrafterLive } from '@/components/hub/widgets/violation-drafter-live'
import { SHIPPED_HOA_WORKFLOWS } from '@/lib/workflows'

export const metadata: Metadata = {
  title: 'HOA Hub — AI for volunteer boards',
  description:
    'Run a self-managed HOA without a management company. Covenant Brain, violation letters, AI minutes, bill scan, accounting and a month-end board report — all in one place.',
}

const theme = HUBS.hoa

// Truth rule (BL-002, BL-042): every card and list item on this page is
// something a board can use in apps/hoa today. Unbuilt work goes in
// NOT_YET only, labelled as such.

// Shipped capabilities that aren't AI workflows, each mapped to its route.
const ALSO_INCLUDED = [
  'Import your roster from CSV or Excel, CINC exports included, with a row-by-row preview', // /properties/import
  'Set up the association and open the books yourself, from Accounting', // association-setup
  'Monthly board packet, reported as of month end', // /meetings/[id]/packet
  'Month-end board report emailed to the board on the 1st', // BL-073
  '⌘K search across owners, units, violations, ARC, tickets, documents and meetings', // /api/search
  'A built-in user guide with step-by-step articles, and Ask the guide', // /help, /api/help/ask
  'Dues, reminders and a resident ledger in your association’s own time zone', // /dues, BL-043
  'Download all your data any time, as one zip of spreadsheets', // /settings/data
  'Mobile inspection mode: walk the community, photograph issues, drafts land in Approvals', // /inspect, BL-028
  'Follow-up violation letters (second notice, hearing, fine, decision), through Approvals', // /violations/[id] FollowUpLetterDialog
  'Payment plans and recurring journal entries in Accounting', // /accounting/payment-plans, /accounting/recurring, BL-080/081
]

// Backlog items (docs/backlog.md). Not available today. Spanish
// announcements (BL-025) and AI ARC review (BL-024/027/079) shipped and moved
// to the workflow cards above (BL-090).
const NOT_YET = [
  'Reserve fund tracking and projections', // BL-037
]

export default function HoaPage() {
  return (
    <main>
      <Nav />

      <HubHero
        theme={theme}
        eyebrow="HOA Hub · for volunteer boards"
        title="Run your HOA without a management company."
        subtitle="Covenant questions, violation letters, minutes, bills and the month-end report — drafted by AI, approved by the board, cited to the document. Built with Madison Park HOA."
        primaryCta={{ label: 'Book a 10-min board demo', href: '/demo' }}
        secondaryCta={{ label: 'See the workflows', href: '#features' }}
        visual={<HoaDashboardVisual />}
        stats={[
          { value: String(SHIPPED_HOA_WORKFLOWS.length), label: 'AI workflows live' },
          { value: 'Cited', label: 'Every document answer' },
          { value: 'Self-serve', label: 'Setup + roster import' },
        ]}
      />

      <ViolationDrafterLive />

      {/* BL-090: only the opening of Linda's reference quote (as on the
          homepage), with no metrics. The bullets are product facts, not
          customer results. */}
      <HubPersona
        theme={theme}
        eyebrow="The volunteer treasurer"
        title="Built for the treasurer who runs the HOA after work."
        description="Volunteer board members have day jobs. HOA Hub drafts the paperwork; the board reviews, approves and governs."
        persona={{
          name: 'Linda',
          role: 'Treasurer, Madison Park HOA',
          quote: 'I got my Tuesday nights back. Covenant Brain answers in seconds with the section cited.',
          initials: 'L',
        }}
        bullets={[
          { label: 'Every document answer', value: 'Cited' },
          { label: 'Approve or reject a draft', value: '1 click' },
          { label: 'Announcements', value: 'EN + ES' },
        ]}
      />

      <div id="features" />
      <HubFeatures
        theme={theme}
        eyebrow="HOA workflows"
        title="The AI workflows a board uses today. Every one labeled."
        description="Every output cites its source. Every draft waits for the board. The board sees exactly what the AI did and why."
        features={[
          {
            icon: 'BookOpen',
            bar: 'C',
            title: 'Covenant Brain',
            body: 'Ask any rule question in plain English. The answer cites the CC&R section, and says so when your documents don’t cover it.',
          },
          {
            icon: 'FileText',
            bar: 'B',
            title: 'Violation Drafter',
            body: 'Photo + caption in. A drafted letter with the rule cited waits in Approvals: approve or reject in one click. Approving never emails the homeowner by itself.',
          },
          {
            icon: 'Calendar',
            bar: 'B',
            title: 'AI meeting minutes',
            body: 'Paste the meeting transcript. AI drafts board-ready minutes; the board edits and approves. Each meeting’s packet reports the month as of month end.',
          },
          {
            icon: 'Receipt',
            bar: 'B',
            title: 'Bill scan',
            body: 'Scan a vendor bill. The AI reads the vendor, invoice number, dates, total and account into Approvals. Fix anything before you approve; nothing is entered until then.',
          },
          {
            icon: 'Bot',
            bar: 'B',
            title: 'Board Copilot',
            body: 'Ask about your community — who’s overdue, open violations, an owner’s contact, recent meetings — and get answers from your records and documents.',
          },
          {
            icon: 'Mail',
            bar: 'B',
            title: 'Shared inbox',
            body: 'Your HOA’s Gmail as one shared inbox, with AI reply drafts. Contact details are removed before the AI reads a message.',
          },
          {
            icon: 'Hammer',
            bar: 'B',
            title: 'Vendors and bids',
            body: 'Vendor onboarding, AI-written requests for proposal, and the bids that come back compared side by side.',
          },
          {
            icon: 'Scale',
            bar: 'C',
            title: 'State-law answers',
            body: 'HOA-law questions answered with citations to the statute. Georgia today; Florida is being added.',
          },
          {
            icon: 'ClipboardCheck',
            bar: 'B',
            title: 'AI ARC review',
            body: 'Residents can check a request against your guidelines before submitting. The board gets a cited review, findings from the photos and editable decision letters. The board decides.',
          },
          {
            icon: 'Globe',
            bar: 'B',
            title: 'Spanish announcements',
            body: 'Add an AI-drafted Spanish version to an announcement. The board reads it, can edit it, and confirms it before anything is sent.',
          },
          {
            icon: 'MessageSquare',
            bar: 'C',
            title: 'Resident Portal',
            body: 'Residents see their balance and statement, file ARC and maintenance requests, and ask the governing documents before they email the board.',
          },
        ]}
      />

      <section className="pb-20 md:pb-28">
        <div className="container-page grid gap-6 md:grid-cols-[1.6fr,1fr]">
          <div className="rounded-2xl border border-border/70 bg-surface p-7 ring-card">
            <p className="text-sm font-semibold uppercase tracking-wider text-success">Also included</p>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {ALSO_INCLUDED.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-foreground-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border/70 bg-subtle/40 p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">Roadmap · not available yet</p>
            <ul className="mt-4 space-y-2.5">
              {NOT_YET.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <HubCta
        theme={theme}
        title={
          <>
            Stop volunteering for paperwork.
            <br />
            Start governing.
          </>
        }
        description="Ten minutes is all we need. We pre-load your CC&R, show you Covenant Brain answering your actual rules, and let the board decide."
        primary={{ label: 'Book a board demo', href: '/demo' }}
        secondary={{ label: 'See pricing', href: '/pricing' }}
        footnote="Six-month free pilot for HOAs · No data migration · Built in Atlanta"
      />

      <Footer />
    </main>
  )
}
