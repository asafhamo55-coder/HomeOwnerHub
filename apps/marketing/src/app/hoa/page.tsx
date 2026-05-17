import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HubHero } from '@/components/hub/hub-hero'
import { HubPersona } from '@/components/hub/hub-persona'
import { HubFeatures } from '@/components/hub/hub-features'
import { HubCta } from '@/components/hub/hub-cta'
import { HUBS } from '@/components/hub/hub-theme'
import { HoaDashboardVisual } from '@/components/hub/visuals/hoa-dashboard'
import { ViolationDrafterLive } from '@/components/hub/widgets/violation-drafter-live'

export const metadata: Metadata = {
  title: 'HOA Hub — AI for volunteer boards',
  description:
    'Run a self-managed HOA without a management company. Covenant Brain, Violation Drafter, Minutes Engine, Reserve Live — all in one place.',
}

const theme = HUBS.hoa

export default function HoaPage() {
  return (
    <main>
      <Nav />

      <HubHero
        theme={theme}
        eyebrow="HOA Hub · for volunteer boards"
        title="Run your HOA without a management company."
        subtitle="Covenant questions, violation notices, minutes, reserve fund — drafted by AI, approved by the board, cited to the document. Built with Madison Park HOA."
        primaryCta={{ label: 'Book a 10-min board demo', href: '/demo' }}
        secondaryCta={{ label: 'See the workflows', href: '#features' }}
        visual={<HoaDashboardVisual />}
        stats={[
          { value: '9', label: 'AI workflows' },
          { value: '32+', label: 'Hours saved / mo' },
          { value: '15 min', label: 'Onboarding' },
        ]}
      />

      <ViolationDrafterLive />

      <HubPersona
        theme={theme}
        eyebrow="The volunteer treasurer"
        title="Linda, 58, runs a 180-home HOA on Tuesday nights."
        description="She has a real job. Eight to twelve unpaid hours a week on HOA paperwork was unsustainable. HOA Hub does the paperwork; Linda governs."
        persona={{
          name: 'Linda Jackson',
          role: 'Treasurer, Madison Park HOA · Johns Creek, GA',
          quote:
            "I got my Tuesday nights back. Covenant Brain answers in seconds with the section cited. Minutes are written the night of the meeting. We caught a $4,200 reserve discrepancy in week three.",
          initials: 'LJ',
        }}
        bullets={[
          { label: 'Hours saved / mo', value: '32+' },
          { label: 'Questions answered', value: '247' },
          { label: 'First Aha', value: '15 min' },
        ]}
      />

      <div id="features" />
      <HubFeatures
        theme={theme}
        eyebrow="HOA workflows"
        title="Nine AI workflows. Every one labeled."
        description="Every output cites its source. Every action is logged. The board sees exactly what the AI did and why."
        features={[
          {
            icon: 'BookOpen',
            bar: 'C',
            title: 'Covenant Brain',
            body: 'Ask any rule question in plain English. Get the answer in 4 seconds with the exact CC&R section cited.',
          },
          {
            icon: 'FileText',
            bar: 'B',
            title: 'Violation Drafter',
            body: 'Photo + caption in. A legally formatted notice out. Board taps approve — sent in two minutes.',
          },
          {
            icon: 'Calendar',
            bar: 'B',
            title: 'Minutes Engine',
            body: 'Records the meeting. Drafts board-ready minutes. Captures every motion, vote, and decision.',
          },
          {
            icon: 'PiggyBank',
            bar: 'B',
            title: 'Reserve Live',
            body: 'Real-time reserve fund projection. Updates with every invoice. Flags shortfalls before they hurt.',
          },
          {
            icon: 'ClipboardCheck',
            bar: 'B',
            title: 'ARC Recommender',
            body: 'Architectural review packets prepared with citations. Faster decisions, fewer board disagreements.',
          },
          {
            icon: 'Globe',
            bar: 'C',
            title: 'Multilingual Comms',
            body: 'Every outbound email auto-translated to each resident\'s preferred language. No more "did you get my notice?"',
          },
          {
            icon: 'MessageSquare',
            bar: 'C',
            title: 'Resident Portal',
            body: 'Residents ask the AI before they email the board. 60%+ of questions resolved without escalation.',
          },
          {
            icon: 'Bot',
            bar: 'B',
            title: 'Board Copilot',
            body: 'Pre-meeting brief: what happened, what\'s pending, what needs a vote. Ten minutes saves ninety.',
          },
          {
            icon: 'Hammer',
            bar: 'B',
            title: 'Vendor Oracle',
            body: 'Past spend, ratings, and the recommended vendor for the next job. No more "who did we use last time?"',
          },
        ]}
      />

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
