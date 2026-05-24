import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HubHero } from '@/components/hub/hub-hero'
import { HubPersona } from '@/components/hub/hub-persona'
import { HubFeatures } from '@/components/hub/hub-features'
import { HubCta } from '@/components/hub/hub-cta'
import { HUBS } from '@/components/hub/hub-theme'
import { PmRentVisual } from '@/components/hub/visuals/pm-rent-card'
import { RentTimelineLive } from '@/components/hub/widgets/rent-timeline-live'

export const metadata: Metadata = {
  title: 'PM Hub — For small landlords',
  description:
    'Zero-touch rent collection. Delinquency Coach. Lease Q&A. Predictive maintenance. Free for one property; paid tiers from $19/mo.',
}

const theme = HUBS.pm

export default function LandlordsPage() {
  return (
    <main>
      <Nav />

      <HubHero
        theme={theme}
        eyebrow="PM Hub · for 2–50 unit landlords"
        title="Rent that collects itself."
        subtitle="Ledger PM is the operating system for landlords with one to fifty units. Zero-touch rent, AI-drafted lease answers, late-rent coaching that doesn't go straight to threats."
        primaryCta={{ label: 'Start free', href: '/demo' }}
        secondaryCta={{ label: 'See features', href: '#features' }}
        visual={<PmRentVisual />}
        stats={[
          { value: '$0', label: 'Free tier' },
          { value: '94%', label: 'On-time rate' },
          { value: '12 min', label: 'Weekly load' },
        ]}
      />

      <RentTimelineLive />

      <HubPersona
        theme={theme}
        eyebrow="The micro-landlord"
        title="Four units, a day job, and a Venmo group chat that's not working."
        description="Most landlords aren't operating at AppFolio scale. Two to ten units is a side income, not a career. PM Hub gives you the parts that matter without the enterprise tax."
        persona={{
          name: 'Daniel R.',
          role: 'Four single-family rentals · Marietta, GA',
          quote:
            'I was tracking rent in a spreadsheet and chasing payments on Venmo. PM Hub auto-collects, sends reminders, and tells me when something\'s actually wrong. I check in on Sunday for ten minutes and I\'m done.',
          initials: 'DR',
        }}
        bullets={[
          { label: 'Avg. minutes / week', value: '12' },
          { label: 'Rent collected on-time', value: '94%' },
          { label: 'Setup time', value: '< 1 hr' },
        ]}
      />

      <div id="features" />
      <HubFeatures
        theme={theme}
        eyebrow="PM workflows"
        title="The 7 features that replace your spreadsheet."
        description="Every workflow tells you what bar it ships at. Rent collection is production; tenant risk scoring is demo-only and we say so."
        features={[
          {
            icon: 'Wallet',
            bar: 'C',
            title: 'Zero-touch rent collection',
            body: 'ACH + card. Auto-receipts. Late fees applied per your state rules. Money in your account, not lost in DMs.',
          },
          {
            icon: 'AlertCircle',
            bar: 'B',
            title: 'Delinquency Coach',
            body: 'Day 5 to day 30: notices, follow-ups, payment-plan offers. Calibrated by tenant history, not a blanket script.',
          },
          {
            icon: 'FileSearch',
            bar: 'C',
            title: 'Lease & Document Q&A',
            body: '"What does Section 4.2 say about pet deposits?" — answered in 3 seconds, with the lease section cited.',
          },
          {
            icon: 'Wrench',
            bar: 'B',
            title: 'Predictive Maintenance',
            body: 'Component-failure forecasting 30–60 days out. Budget for the HVAC before it dies in July.',
          },
          {
            icon: 'Globe',
            bar: 'C',
            title: 'Multilingual Comms',
            body: 'Tenant prefers Spanish? Every outbound message is translated automatically. Audit trail on every send.',
          },
          {
            icon: 'ClipboardList',
            bar: 'B',
            title: 'Budget Anomaly Detection',
            body: 'Flags spend more than 10% over budget YTD. Before tax season, not during.',
          },
          {
            icon: 'ShieldCheck',
            bar: 'A',
            title: 'Tenant Risk Score',
            body: 'Conversational tenant screening with audit trail. Demo only in v1 — we won\'t pretend it\'s production until it is.',
          },
        ]}
      />

      <HubCta
        theme={theme}
        title={
          <>
            Stop chasing rent.
            <br />
            Start managing.
          </>
        }
        description="Free for one property. $19/mo for 2–10 units. $49/mo for 11–50. No setup fees, no implementation team, no contract."
        primary={{ label: 'Start free', href: '/demo' }}
        secondary={{ label: 'See pricing', href: '/pricing' }}
        footnote="Free tier · No credit card · 2 minutes to first dollar collected"
      />

      <Footer />
    </main>
  )
}
