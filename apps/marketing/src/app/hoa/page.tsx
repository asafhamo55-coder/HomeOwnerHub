import type { Metadata } from 'next'
import { Check, Clock } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HubHero } from '@/components/hub/hub-hero'
import { HubPersona } from '@/components/hub/hub-persona'
import { HubFeatures } from '@/components/hub/hub-features'
import { HubCta } from '@/components/hub/hub-cta'
import { HUBS } from '@/components/hub/hub-theme'
import { HeroProductVisual } from '@/components/site/mockups'
import { ViolationDrafterLive } from '@/components/hub/widgets/violation-drafter-live'
import { SHIPPED_HOA_WORKFLOWS } from '@/lib/workflows'
import { SHIPPED_FEATURES } from '@/lib/features'
import { HOA_PRODUCT_NAME, OTHER_HUBS_ENABLED } from '@/lib/hubs'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { GeorgiaFirst } from '@/components/site/georgia-first'
import { STATE_LAW_ANSWERS_NOTE } from '@/lib/state-law'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/hoa']!, path: '/hoa' })

const theme = HUBS.hoa

// Truth rule (BL-002, BL-042): every card and list item on this page is
// something a board can use in apps/hoa today. Unbuilt work goes in
// NOT_YET only, labelled as such.

// Shipped capabilities that aren't AI workflows. lib/features.ts maps each
// to its apps/hoa route, and marketing-truth.test.ts checks them.
const ALSO_INCLUDED = SHIPPED_FEATURES.map((f) => f.text)

// Backlog items (docs/backlog.md). Not available today. Spanish
// announcements (BL-025) and AI ARC review (BL-024/027/079) shipped and moved
// to the workflow cards above (BL-090). The reserve snapshot shipped
// (2026-10-20-1450); projections have not. Electronic ballots are BL-156;
// Georgia condominiums (Condo Act) are on the backlog too.
const NOT_YET = [
  'Reserve fund projections', // BL-037
  'Electronic ballots and written consent', // BL-156
  'Georgia condominium (Condo Act) rules',
]

export default function HoaPage() {
  return (
    <main id="main-content">
      <Nav />

      <HubHero
        theme={theme}
        eyebrow={`${HOA_PRODUCT_NAME} · for volunteer boards · Georgia first`}
        title={
          <>
            Run your HOA{' '}
            <span className="text-foreground">without a</span> <span className="t-serif text-primary">management company.</span>
          </>
        }
        subtitle="Georgia’s SB 406 registration, collections notices, quorum and proxies, the annual report for owners and late fees within the cap. Then covenant questions, violation letters, announcements, inbox replies, minutes, bills and the month-end report. Drafted from your records, approved by the board, cited to the document."
        primaryCta={{ label: 'Start free pilot', href: '/demo' }}
        secondaryCta={{ label: 'See the Georgia tools', href: '#georgia' }}
        visual={<HeroProductVisual />}
        bareVisual
        stats={[
          { value: String(SHIPPED_HOA_WORKFLOWS.length), label: 'AI workflows live' },
          { value: 'Cited', label: 'Every document answer' },
          { value: 'Self-serve', label: 'Setup + roster import' },
        ]}
      />

      <GeorgiaFirst />

      <ViolationDrafterLive />

      {/* 2026-10-19 owner-delegated defaults: no customer quote is
          verified, so the persona card shows product facts instead. The
          bullets are product facts too, not customer results. */}
      <HubPersona
        theme={theme}
        eyebrow="The volunteer treasurer"
        title="Built for the treasurer who runs the HOA after work."
        description={`Volunteer board members have day jobs. ${HOA_PRODUCT_NAME} drafts the paperwork; the board reviews, approves and governs.`}
        facts={{
          title: 'What the board gets today',
          items: [
            'Rule questions answered with the CC&R section cited',
            'Violation letters drafted for the board to approve or reject',
            'Meeting minutes drafted from the transcript',
            'Announcements drafted from a sentence, with a phone preview',
            'A month-end report from the books',
          ],
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
            body: 'Your HOA’s Gmail as one shared inbox. A reply starts drafting when you open an email, next to the home’s balance and open items. Saved replies, and Create from email turns a message into a ticket, violation report or ARC link. Contact details are removed before the AI reads a message.',
          },
          {
            icon: 'Sparkles',
            bar: 'B',
            title: 'Message drafter',
            body: 'Type what you want to tell residents in plain words. The AI fills in the audience, subject, message and timing, and flags missing facts. Preview it on a phone, send it, then see who opened it. Nothing is sent until you press Send.',
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
            body: `HOA-law questions answered with citations to the statute, and it says so when the statute doesn’t cover it. ${STATE_LAW_ANSWERS_NOTE}`,
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
          {
            icon: 'Bot',
            bar: 'C',
            title: 'Resident assistant',
            body: 'Residents chat on the portal’s Ask tab about their balance, their requests, announcements and the rules, with the document section cited. It never acts for the board, and the board turns it on.',
          },
        ]}
      />

      <section className="pb-20 md:pb-28">
        <div className="container-page grid gap-6 md:grid-cols-[1.6fr,1fr]">
          <div className="rounded-2xl border border-border/70 bg-surface p-7 ring-card">
            <p className="eyebrow text-success">Also included</p>
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
            <p className="eyebrow text-muted">Roadmap · not available yet</p>
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
        primary={{ label: 'Book a demo', href: '/demo' }}
        secondary={{ label: 'See pricing', href: '/pricing' }}
        footnote="Six-month free pilot for HOAs · No data migration · Built in Atlanta · Not legal advice"
      />

      <Footer />
    </main>
  )
}
