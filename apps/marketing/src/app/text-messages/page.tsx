import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/text-messages']!, path: '/text-messages' })

// The consent wording is built per association by smsDisclosure() in
// apps/hoa/src/lib/sms-consent.ts. This is that text for a sample
// association name. The portal shows it as a label plus these lines, then
// a "Privacy policy" link in place of the trailing URL.
const SAMPLE_ASSOCIATION = 'Maple Ridge HOA'
const CONSENT_LINES = [
  `By checking this box, I agree to receive text messages from ${SAMPLE_ASSOCIATION}, sent through HomeownerHub, at the mobile number shown above.`,
  'Texts cover association business: urgent notices, reminders about dues and meetings, and announcements from the board.',
  'Message frequency varies. Msg & data rates may apply.',
  'Reply STOP to stop at any time, or HELP for help. You can also turn texts off on this page.',
  'Agreeing is not a condition of anything else.',
]

const SAMPLE_TEXTS = [
  'Maple Ridge HOA: Water will be shut off Tuesday 9am to noon for a main repair on Elm Court. Please store water ahead of time. Reply STOP to opt out',
  'Maple Ridge HOA: Reminder, your quarterly dues of $325 are due Friday. You can pay in the resident portal. Reply STOP to opt out',
  'Maple Ridge HOA: The board meets Thursday at 7pm in the clubhouse. The agenda is in the portal under Meetings. Reply STOP to opt out',
  'Maple Ridge HOA: The board approved your architectural application with conditions. Open the portal to read the letter. Reply STOP to opt out',
]

const STEPS = [
  'Go to the resident portal at www.homeownerledger.com and sign in with the email link your association sent you.',
  'Open Account, then Text messages.',
  'Check that the mobile number shown is yours. If not, fix it under My contact details first.',
  'Read the agreement. The box starts empty. Nothing is turned on for you.',
  'Tick the box that says "I agree to receive text messages".',
  'Press "Turn on text messages". You will see "Texts are on".',
]

function ConsentBox() {
  return (
    <figure className="not-prose my-8">
      <div
        className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
        role="img"
        aria-label="Picture of the text message sign-up box in the resident portal. The checkbox is empty."
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Text messages</p>
        <div className="mt-3 rounded-xl border border-border/70 bg-background p-4">
          <p className="text-sm text-foreground">
            Texts are off. Get urgent notices and reminders by text at <span className="font-semibold">(404) 555-0142</span>.
          </p>
          <p className="mt-1 text-xs text-muted">Not your mobile number? Change it under My contact details above first.</p>
          <div className="mt-4 flex items-start gap-3">
            <span aria-hidden className="mt-0.5 inline-block size-5 shrink-0 rounded border-2 border-border bg-white" />
            <div>
              <p className="text-sm font-medium text-foreground">I agree to receive text messages</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {CONSENT_LINES.join(' ')}{' '}
                <span className="font-medium text-primary underline">Privacy policy</span>
              </p>
            </div>
          </div>
          <span className="mt-4 inline-block rounded-lg bg-primary/40 px-4 py-2 text-sm font-semibold text-primary-fg">
            Turn on text messages
          </span>
          <p className="mt-2 text-xs text-muted">The button stays grey until the box is ticked.</p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        This is the sign-up box as residents see it, shown with a sample association name. The words are built for each
        association and use its own name in place of {SAMPLE_ASSOCIATION}.
      </figcaption>
    </figure>
  )
}

export default function TextMessagesPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <PageHero
          eyebrow="Text message alerts"
          title="Text message alerts"
          subtitle="How residents choose to get texts from their HOA, and how to stop them."
        />

        <section className="section pt-0 md:pt-0">
          <div className="container-page">
            <article className="prose prose-ink prose-lg mx-auto max-w-3xl text-lg leading-relaxed text-foreground-secondary">
              <p className="text-base text-foreground-secondary">Last updated: November 6, 2026</p>

              <h2 id="who">Who sends the texts</h2>
              <p>
                Your own HOA sends them, through HomeownerHub. HomeownerHub is operated by Hamo Earny LLC. We only text
                residents of an association that uses HomeownerHub, and only after the resident says yes.
              </p>

              <h2 id="what">What kinds of texts</h2>
              <p>Texts cover association business:</p>
              <ul>
                <li>Urgent notices, such as a water shutoff or a road closure.</li>
                <li>Reminders about dues and meetings.</li>
                <li>Announcements from the board.</li>
                <li>Updates on your own requests, such as an architectural application decision.</li>
              </ul>
              <p>We do not send ads. We do not text for other companies.</p>
              <p>Here are samples of what a text looks like:</p>
              <ul className="not-prose my-4 space-y-3">
                {SAMPLE_TEXTS.map((t) => (
                  <li key={t} className="rounded-2xl rounded-bl-sm border border-border bg-surface p-4 text-base text-foreground">
                    {t}
                  </li>
                ))}
              </ul>

              <h2 id="sign-up">How you sign up</h2>
              <p>
                You sign up yourself, inside the resident portal. A board member cannot turn texts on for you. There is
                no other way to sign up.
              </p>
              <ol>
                {STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p>This is the box you will see at step 5:</p>
              <ConsentBox />
              <p>
                We save the date you agreed and the exact words you saw, so we can show your agreement if anyone asks.
              </p>

              <h2 id="not-required">Agreeing is never required</h2>
              <p>
                You do not have to agree to texts to live in your community, use the portal, pay dues or get any other
                service. You will still get email and portal notices. Agreeing is not a condition of anything else.
              </p>

              <h2 id="frequency">How often</h2>
              <p>Message frequency varies. It depends on what is happening in your community.</p>

              <h2 id="rates">Cost</h2>
              <p>Message and data rates may apply. Those come from your mobile carrier. HomeownerHub does not charge you for texts.</p>

              <h2 id="stop-help">STOP, START and HELP</h2>
              <ul>
                <li>
                  <strong>To stop:</strong> reply STOP to any text. Or open Account, then Text messages in the portal and
                  press &quot;Stop text messages&quot;. It takes effect right away.
                </li>
                <li>
                  <strong>To start again:</strong> reply START, or turn texts on again in the portal.
                </li>
                <li>
                  <strong>For help:</strong> reply HELP. You will get this reply: &quot;HomeownerHub alerts for your HOA.
                  Reply STOP to stop. Help: support@homeownerledger.com&quot;.
                </li>
              </ul>

              <h2 id="contact">Contact</h2>
              <p>
                Questions or trouble? Email <a href="mailto:support@homeownerledger.com">support@homeownerledger.com</a>.
              </p>

              <h2 id="policies">Our policies</h2>
              <p>
                We do not share your mobile number or your agreement to receive texts with third parties or affiliates
                for their marketing. Read the <Link href="/privacy#text-messages">privacy policy</Link> and the{' '}
                <Link href="/terms#text-messages">terms of service</Link>.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
