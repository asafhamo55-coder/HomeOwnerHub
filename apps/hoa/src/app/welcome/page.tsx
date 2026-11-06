import type { Metadata } from 'next'
import Link from 'next/link'
import { TRANSCRIPT } from './transcript'

// Public, no-sign-in page (middleware PUBLIC_PREFIXES). It is the link a board
// sends in the invitation email: a short video, then the same steps in words.
// The video is generic HomeownerHub (only its opening and closing cards name a
// community), so one page serves every community. Captions are burned into the
// picture (open captions), so there is no <track>. Files live in
// public/welcome/ and are built by tools/welcome-video/render.mjs, which also
// writes ./transcript.ts from the narration script.
export const metadata: Metadata = {
  title: 'Getting started',
  description: 'A short video and plain steps for getting started with HomeownerHub.',
}

export const dynamic = 'force-static'

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Open the invitation email',
    body: 'It comes from HomeownerHub and was sent by your board. Tap the button that says Accept your invitation. The link works for 24 hours. If it stops working, ask your board to send a new one. If you already have an account, the email may say Log in instead.',
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
    body: 'The tabs at the bottom are Home, Dues, Requests, Ask and Account. Dues shows what you owe and your statement. Requests sends a note to the board. On Home, Community lets you book a space, answer polls and talk with neighbors, if your board turned it on.',
  },
  {
    title: 'Pay your dues',
    body: 'The Pay screen shows the ways your board accepts payment, such as Zelle or a check.',
  },
  {
    title: 'If you get stuck',
    body: 'Tap the Help button at the top of any page. It says Hello and your first name. You can also tap Ask to chat with your assistant, or ask your board.',
  },
]

export default function WelcomePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 text-foreground sm:py-12">
      {/* The logo is the real brand asset. The page colours (text, button) come from the app theme tokens, which follow the product app, not the marketing site. */}
      <header className="mb-6">
        <img src="/brand-site/logo-full.svg" alt="HomeownerHub" width={238} height={40} className="h-10 w-auto dark:hidden" />
        <img src="/brand-site/logo-full-dark.svg" alt="HomeownerHub" width={238} height={40} className="hidden h-10 w-auto dark:block" />
      </header>
      <h1 className="text-3xl font-bold tracking-tight">Getting started with HomeownerHub</h1>
      <p className="mt-3 text-lg text-foreground-secondary">Watch the short video, or read the steps below.</p>

      <div className="mt-6">
        {/* Phones get the vertical cut, wide screens the landscape cut. The hidden one never downloads (preload none).
            The words on screen are open captions, so there is no caption track. */}
        <video
          className="mx-auto w-full max-w-sm rounded-2xl bg-black md:hidden"
          controls
          playsInline
          preload="none"
          poster="/welcome/poster.jpg"
          aria-label="Getting started with HomeownerHub, with the words on screen"
        >
          <source src="/welcome/welcome.mp4" type="video/mp4" />
        </video>
        <video
          className="hidden w-full rounded-2xl bg-black md:block"
          controls
          playsInline
          preload="none"
          poster="/welcome/poster-land.jpg"
          aria-label="Getting started with HomeownerHub, with the words on screen"
        >
          <source src="/welcome/welcome-landscape.mp4" type="video/mp4" />
        </video>
        <p className="mt-2 text-base text-foreground">The screens in the video use pretend names and amounts.</p>
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

      <section className="mt-12 border-t border-border pt-8" aria-labelledby="transcript">
        <h2 id="transcript" className="text-2xl font-semibold">
          Read the video instead
        </h2>
        <div className="mt-4 space-y-5">
          {TRANSCRIPT.map((scene) => (
            <div key={scene.title}>
              <h3 className="text-xl font-semibold">{scene.title}</h3>
              {scene.lines.map((line) => (
                <p key={line} className="mt-1 text-lg leading-relaxed text-foreground-secondary">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
