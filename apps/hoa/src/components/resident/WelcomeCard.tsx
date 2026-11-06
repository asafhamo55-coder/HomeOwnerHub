'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { browserStorage } from '@/lib/guide/first-week'
import {
  HOME_SCREEN_STEPS,
  WELCOME_DISMISSED_EVENT,
  WELCOME_TILES,
  detectPlatform,
  dismissHomeScreenHelper,
  dismissWelcome,
  shouldShowHomeScreenHelper,
  shouldShowWelcome,
  type HomeScreenPlatform,
} from '@/lib/resident-welcome'

type Step = 'none' | 'welcome' | 'home-screen'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

/**
 * First visit on the resident home: "Welcome" with what the main tiles do,
 * then (on a phone, not yet installed) "Put HomeownerHub on your home
 * screen". Each is shown once. Decided after mount so the server render and
 * the first client render agree (nothing).
 */
export function ResidentWelcome({ scope }: { scope: string }) {
  const [step, setStep] = useState<Step>('none')
  const [platform, setPlatform] = useState<HomeScreenPlatform>('other')
  const [canPrompt, setCanPrompt] = useState(false)
  const prompt = useRef<InstallPromptEvent | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const previous = useRef<Step>('none')

  useEffect(() => {
    const storage = browserStorage()
    const onPrompt = (e: Event) => {
      e.preventDefault()
      prompt.current = e as InstallPromptEvent
      setCanPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints))
    if (shouldShowWelcome(storage, scope)) setStep('welcome')
    else if (canShowHomeScreen(storage)) setStep('home-screen')
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [scope])

  // After a tap the button that had focus disappears. Move focus on purpose:
  // to the next card's heading, or, when the cards are done, to the main
  // area (a stable target, so keyboard and screen reader users do not land on <body>).
  // The first appearance on page load never takes focus.
  useEffect(() => {
    const was = previous.current
    previous.current = step
    if (was === 'none') return
    if (step === 'none') document.getElementById('main')?.focus({ preventScroll: true })
    else heading.current?.focus({ preventScroll: true })
  }, [step])

  if (step === 'none') return null

  if (step === 'welcome') {
    return (
      <section aria-labelledby="welcome-heading">
        <Card>
          <CardHeader>
            <CardTitle as="h2" id="welcome-heading" ref={heading} tabIndex={-1} className="text-xl focus:outline-none">
              Welcome to HomeownerHub
            </CardTitle>
            <CardDescription className="text-base">
              This is your community’s home on your phone. Here is what the main buttons below do.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="space-y-3 text-base text-foreground">
              {WELCOME_TILES.map((t) => (
                <li key={t.label}>
                  <span className="font-semibold">{t.label}.</span> {t.plain}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="min-h-12"
                onClick={() => {
                  const storage = browserStorage()
                  dismissWelcome(storage, scope)
                  window.dispatchEvent(new Event(WELCOME_DISMISSED_EVENT))
                  setStep(canShowHomeScreen(storage) ? 'home-screen' : 'none')
                }}
              >
                Got it
              </Button>
              <Button asChild size="lg" variant="secondary" className="min-h-12">
                <Link href="/welcome">Watch the 1-minute video</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    )
  }

  const groups: Array<{ title: string | null; steps: readonly string[] }> =
    platform === 'ios' || platform === 'android'
      ? [{ title: null, steps: HOME_SCREEN_STEPS[platform] }]
      : platform === 'touch'
        ? [
            { title: 'On an iPhone or iPad', steps: HOME_SCREEN_STEPS.ios },
            { title: 'On an Android phone or tablet', steps: HOME_SCREEN_STEPS.android },
          ]
        : []
  function done() {
    dismissHomeScreenHelper(browserStorage())
    setStep('none')
  }
  return (
    <section aria-labelledby="home-screen-heading">
      <Card>
        <CardHeader>
          <CardTitle as="h2" id="home-screen-heading" ref={heading} tabIndex={-1} className="text-xl focus:outline-none">
            Put HomeownerHub on your home screen
          </CardTitle>
          <CardDescription className="text-base">
            Then it opens with one tap, like any other app on your phone. It takes about half a minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map((g) => (
            <div key={g.title ?? 'steps'} className="space-y-2">
              {g.title ? <h3 className="text-base font-semibold text-foreground">{g.title}</h3> : null}
              <ol className="list-decimal space-y-3 pl-6 text-base text-foreground">
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
          <div className="flex flex-col gap-3 sm:flex-row">
            {canPrompt ? (
              <Button
                type="button"
                size="lg"
                className="min-h-12"
                onClick={() => {
                  void prompt.current?.prompt()
                  done()
                }}
              >
                Add it now
              </Button>
            ) : null}
            <Button type="button" size="lg" variant={canPrompt ? 'secondary' : 'default'} className="min-h-12" onClick={done}>
              {canPrompt ? 'Not now' : 'Done, hide this'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

/** On a phone, in the browser (not already installed), and never dismissed. */
function canShowHomeScreen(storage: ReturnType<typeof browserStorage>): boolean {
  if (detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'other') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  const installed = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  return !installed && shouldShowHomeScreenHelper(storage)
}
