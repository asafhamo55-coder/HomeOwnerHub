import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HubHero } from '@/components/hub/hub-hero'
import { HubPersona } from '@/components/hub/hub-persona'
import { HubFeatures } from '@/components/hub/hub-features'
import { HubCta } from '@/components/hub/hub-cta'
import { HUBS } from '@/components/hub/hub-theme'
import { EvictionCaseVisual } from '@/components/hub/visuals/eviction-case'
import { CaseProgressLive } from '@/components/hub/widgets/case-progress-live'

export const metadata: Metadata = {
  title: 'Eviction Hub — Guided, attorney-reviewed',
  description:
    'Eviction support for landlords who have never done one before. County-specific notices, attorney-reviewed templates, demo-only filings. Currently Harris TX, Fulton GA waitlist.',
}

const theme = HUBS.eviction

export default function EvictionPage() {
  return (
    <main>
      <Nav />

      <HubHero
        theme={theme}
        eyebrow="Eviction Hub · attorney-reviewed"
        title="When a tenancy breaks down, don't go in alone."
        subtitle="Most landlords have never done an eviction. Templates are state-specific, timing matters, and one wrong notice resets the clock. Eviction Hub walks you through every step — every template reviewed by a Georgia attorney."
        primaryCta={{ label: 'Join the waitlist', href: '/demo' }}
        secondaryCta={{ label: 'How the gate works', href: '#features' }}
        visual={<EvictionCaseVisual />}
        stats={[
          { value: '98%', label: 'Compliance rate' },
          { value: '2 days', label: 'Attorney SLA' },
          { value: 'GA', label: 'States in v1' },
        ]}
      />

      <CaseProgressLive />

      <section className="border-y border-violet-100 bg-violet-50/30 py-6">
        <div className="container-page">
          <div className="flex flex-col items-center gap-3 text-center md:flex-row md:justify-center md:gap-6">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-violet-800">
              <Lock className="h-4 w-4" />
              Bar A in v1 — court filings are demo-only, watermarked, and gated behind attorney review
            </span>
          </div>
        </div>
      </section>

      <HubPersona
        theme={theme}
        eyebrow="The first-time landlord"
        title="Sarah, first-time eviction, terrified she'll do it wrong."
        description="The landlord who needs this most is the one doing it for the first time. We give her a Georgia attorney's eyes on every template, a clear timeline, and a demo of what the filing looks like — so the lawyer's call costs less and runs faster."
        persona={{
          name: 'Sarah M.',
          role: 'Two single-family rentals · Smyrna, GA',
          quote:
            'I almost served the wrong notice and reset the whole 30-day clock. Eviction Hub caught it, sent the right Georgia template, and looped in an attorney before I did anything I couldn\'t undo. The peace of mind was worth ten times the case fee.',
          initials: 'SM',
        }}
        bullets={[
          { label: 'Compliance rate', value: '98%' },
          { label: 'Attorney review SLA', value: '2 days' },
          { label: 'States in v1', value: 'GA only' },
        ]}
      />

      <div id="features" />
      <HubFeatures
        theme={theme}
        eyebrow="How the gate works"
        title="Helpful, not reckless. Demo-only until your lawyer signs."
        description="We can't be your attorney. We can give you the template, the timeline, and the audit trail — and connect you to someone who can file the real thing."
        features={[
          {
            icon: 'FileText',
            bar: 'B',
            title: 'County-specific notices',
            body: 'The 30-day pay-or-quit looks different in Fulton vs. Harris. We render the right one and cite the statute. Bar B — human review required.',
          },
          {
            icon: 'Scale',
            bar: 'A',
            title: 'Court-filing templates',
            body: 'Complaint in Replevin, Affidavit of Non-Payment, Summons. Generated for education only. Your attorney files the real thing.',
          },
          {
            icon: 'ShieldCheck',
            bar: 'B',
            title: 'Attorney review queue',
            body: 'Every legal-adjacent output goes to a Georgia attorney before it reaches the tenant. Two business-day SLA.',
          },
          {
            icon: 'Clock',
            bar: 'C',
            title: 'Timeline tracker',
            body: 'Notice served → cure period → filing window → hearing. Every deadline tracked, every reminder sent.',
          },
          {
            icon: 'AlertTriangle',
            bar: 'C',
            title: 'Full audit trail',
            body: 'Every AI draft, every human review, every send — logged and time-stamped. Defensible if you ever need it.',
          },
          {
            icon: 'Lock',
            bar: 'C',
            title: 'Watermarked demos',
            body: 'Every demo-only document carries "DEMO ONLY — NOT FOR FILING" across every page. No accidental usage.',
          },
        ]}
      />

      <HubCta
        theme={theme}
        title={
          <>
            Built carefully.
            <br />
            Used carefully.
          </>
        }
        description="Eviction Hub launches in Georgia first, with a waitlist for Texas (Harris) and Washington (King). Join the waitlist or talk to us about your case."
        primary={{ label: 'Join the waitlist', href: '/demo' }}
        secondary={{ label: 'See pricing', href: '/pricing' }}
        footnote="Not legal advice. Subject to attorney review. v1 limited to GA and select counties."
      />

      <Footer />
    </main>
  )
}
