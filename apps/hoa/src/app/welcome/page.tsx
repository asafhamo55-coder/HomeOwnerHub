import type { Metadata } from 'next'
import Link from 'next/link'

// Public, no-sign-in page (middleware PUBLIC_PREFIXES). It is the link a board
// sends in the invitation email: a one-minute video, then the same steps in
// words. The video is generic HomeownerHub (only its opening card names a
// community), so one page serves every community. Files live in
// public/welcome/ and are built by tools/welcome-video/render.mjs.
export const metadata: Metadata = {
  title: 'Getting started',
  description: 'A short video and plain steps for getting started with HomeownerHub.',
}

export const dynamic = 'force-static'

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Open the invitation email',
    body: 'Your board sent it to you. Tap the button that says Accept your invitation. The link works for 24 hours. If it stops working, ask your board to send a new one.',
  },
  {
    title: 'Sign in',
    body: 'The link signs you in. You do not need a password. Next time, tap Email me a link on the sign-in page, or choose a password if you prefer.',
  },
  {
    title: 'Add it to your phone',
    body: 'On an iPhone, open the page in Safari, tap the Share button, then tap Add to Home Screen. On an Android phone, open Chrome, tap the menu, then tap Add to Home screen or Install app.',
  },
  {
    title: 'Look around',
    body: 'The tabs at the bottom are Home, Dues, Requests, Ask and Account. Dues shows what you owe and your statement. Requests sends a note to the board. Under Community on Home you can book a space, answer polls and talk with neighbors.',
  },
  {
    title: 'Need help?',
    body: 'Tap the Help button at the top of any page. It says Hello and your first name. You can also tap Ask to chat with your assistant, or ask your board.',
  },
]

const videoClass = 'w-full rounded-2xl bg-black'

export default function WelcomePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 text-foreground sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight">Getting started with HomeownerHub</h1>
      <p className="mt-3 text-lg text-foreground-secondary">Watch the one-minute video, or read the steps below.</p>

      <div className="mt-6">
        {/* Phones get the vertical cut, wide screens the landscape cut. The hidden one never downloads (preload none). */}
        <video
          className={`${videoClass} mx-auto max-w-sm md:hidden`}
          controls
          playsInline
          preload="none"
          poster="/welcome/poster.jpg"
          aria-label="Getting started with HomeownerHub, with captions"
        >
          <source src="/welcome/welcome.mp4" type="video/mp4" />
          <track kind="captions" src="/welcome/welcome.vtt" srcLang="en" label="English" default />
        </video>
        <video
          className={`${videoClass} hidden md:block`}
          controls
          playsInline
          preload="none"
          poster="/welcome/poster-land.jpg"
          aria-label="Getting started with HomeownerHub, with captions"
        >
          <source src="/welcome/welcome-landscape.mp4" type="video/mp4" />
          <track kind="captions" src="/welcome/welcome.vtt" srcLang="en" label="English" default />
        </video>
        <p className="mt-2 text-base text-muted">The screens in the video use pretend names and amounts.</p>
      </div>

      <h2 className="mt-10 text-2xl font-semibold">Get started</h2>
      <ol className="mt-4 space-y-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-fg" aria-hidden>
              {i + 1}
            </span>
            <div>
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="mt-1 text-lg leading-relaxed text-foreground-secondary">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-6 text-xl font-semibold text-primary-fg no-underline hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
