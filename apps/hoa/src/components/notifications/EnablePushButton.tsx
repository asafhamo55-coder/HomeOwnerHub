'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { Alert, Button, useToast } from '@homeowner-portal/ui'
import { applicationServerKey } from '@/lib/push-key'
import {
  deletePushSubscription,
  savePushSubscription,
} from '@/lib/push-subscriptions'

/**
 * Opt-in control for Web Push — "tell me on my phone when a resident
 * opens a ticket", with the app closed and the device's own sound.
 *
 * The interesting part of this component is not the happy path (ask
 * permission, subscribe, POST the subscription); it is the five ways it
 * can legitimately be unavailable, each of which needs a DIFFERENT
 * message. Collapsing them into one "push isn't supported" is what makes
 * this feature read as broken:
 *
 *   needs-home-screen  iOS, not installed. Fixable by the user in 20s.
 *   unsupported        no Push API and not an iOS we can talk into one.
 *   not-configured     no VAPID key in this build. Nothing the user can do.
 *   unavailable        VAPID fine, push_subscriptions table not applied yet.
 *   blocked            permission denied; only browser settings can undo it.
 *
 * See docs/superpowers/specs/2026-08-31-ticket-notifications-design.md.
 */

type PushState =
  | 'checking'
  | 'unsupported'
  | 'needs-home-screen'
  | 'not-configured'
  | 'blocked'
  | 'off'
  | 'on'

interface Props {
  /**
   * Devices already stored for this user, or null when the server could
   * not read the table at all (0053 unapplied). null is what drives the
   * "not available yet" copy — without it the card would cheerfully
   * report "on" for a subscription nothing will ever push to.
   */
  storedDeviceCount: number | null
}

/**
 * iPadOS 13+ reports itself as "Macintosh" in the UA string, so the
 * classic /iPhone|iPad/ test misses every iPad. A Mac with a touch
 * screen does not exist, which makes maxTouchPoints the reliable
 * discriminator.
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
}

/** True when launched from the Home Screen rather than in a browser tab. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari predates display-mode and still sets this non-standard
  // flag; it is the only signal on older iOS versions.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * navigator.serviceWorker.ready never rejects and never times out — if
 * no worker is registered it simply hangs forever. That is the normal
 * state in development (ServiceWorkerRegister registers in production
 * only) and also happens right after a hard refresh, and an un-timed
 * await would leave the button spinning with no explanation.
 */
async function readyRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

export function EnablePushButton({ storedDeviceCount }: Props) {
  const toast = useToast()
  const [state, setState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read at module-eval time on the server and inlined into the bundle by
  // Next — process.env is not enumerable in the browser, so this has to
  // be the literal member expression, not a computed lookup.
  const vapidKey = applicationServerKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return

    // Order matters. iOS Safari has no PushManager at all until the app
    // is installed, so the generic "unsupported" test would fire first
    // and hide the one instruction that actually fixes it.
    if (isIOS() && !isStandalone()) {
      setState('needs-home-screen')
      return
    }
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      typeof Notification === 'undefined'
    ) {
      setState('unsupported')
      return
    }
    if (!vapidKey) {
      setState('not-configured')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    if (Notification.permission !== 'granted') {
      setState('off')
      return
    }

    // Permission is granted, but that alone does not mean this device
    // has a live subscription — the browser can drop one on its own, and
    // the user may have granted permission on a previous visit that
    // never completed. Ask the registration.
    const registration = await readyRegistration()
    const existing = await registration?.pushManager.getSubscription()
    setState(existing ? 'on' : 'off')
  }, [vapidKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setState('blocked')
        return
      }
      if (permission !== 'granted') {
        // 'default' — the user dismissed the prompt without choosing.
        // Not an error; they can tap again.
        setState('off')
        return
      }

      const registration = await readyRegistration()
      if (!registration) {
        setError(
          'The app is still starting up in the background. Reload the page and try again.',
        )
        return
      }

      // Reuse an existing subscription rather than subscribing twice:
      // subscribe() with a different applicationServerKey throws, and
      // re-subscribing needlessly rotates the endpoint, orphaning the
      // stored row.
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required by every browser. It is a promise that each push we
          // send results in a visible notification; the SW's push
          // handler keeps that promise even for an unreadable payload.
          userVisibleOnly: true,
          applicationServerKey: vapidKey!,
        }))

      const json = subscription.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!json.endpoint || !p256dh || !auth) {
        setError('This browser returned an incomplete subscription. Try again.')
        return
      }

      const result = await savePushSubscription({
        endpoint: json.endpoint,
        p256dh,
        auth,
        // Only so a person can recognise the device in a future list.
        userAgent: navigator.userAgent.slice(0, 500),
      })
      if (!result.ok) {
        // The browser is subscribed but we cannot store it, so no push
        // will ever arrive. Undo the browser side rather than leave a
        // dead subscription claiming to be "on".
        await subscription.unsubscribe().catch(() => {})
        setError(result.error)
        setState('off')
        return
      }

      setState('on')
      toast({ tone: 'success', message: 'Notifications on for this device.' })
    } catch (err) {
      // Safari throws here when the site is not installed, and Chrome
      // throws for a malformed key. Both are already handled above, so
      // anything landing here is genuinely unexpected.
      console.error('enable push failed', err)
      setError('Could not turn on notifications on this device.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      const registration = await readyRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe().catch(() => {})
        // Unsubscribing locally is what actually stops the notifications;
        // the row is cleanup. A failed delete is worth surfacing but must
        // not leave the UI claiming push is still on.
        const result = await deletePushSubscription(endpoint)
        if (!result.ok) setError(result.error)
      }
      setState('off')
      toast({ tone: 'info', message: 'Notifications off for this device.' })
    } catch (err) {
      console.error('disable push failed', err)
      setError('Could not turn off notifications on this device.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') {
    return <p className="text-sm text-muted">Checking this device…</p>
  }

  if (state === 'needs-home-screen') {
    return (
      <Alert variant="info" title="One setup step on iPhone and iPad">
        <div className="space-y-2 text-sm">
          <p>
            Apple only sends notifications to apps that have been added to the
            Home Screen — not to sites open in a Safari tab. It takes about
            twenty seconds:
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              Tap the Share button{' '}
              <Share className="inline h-3.5 w-3.5 align-text-bottom" /> in
              Safari's toolbar.
            </li>
            <li>Choose "Add to Home Screen", then "Add".</li>
            <li>
              Open HOA Hub from the new Home Screen icon and come back to this
              page — the button to turn notifications on will be here.
            </li>
          </ol>
          <p className="text-muted">
            Requires iOS 16.4 or later. Until then you will still see every
            ticket in the app; only the phone alert is missing.
          </p>
        </div>
      </Alert>
    )
  }

  if (state === 'unsupported') {
    return (
      <Alert variant="info" title="Not available in this browser">
        This browser cannot receive push notifications. Tickets still appear in
        the app — try a recent Chrome, Edge, Firefox, or Safari to get the
        phone alert as well.
      </Alert>
    )
  }

  if (state === 'not-configured') {
    return (
      <Alert variant="warning" title="Not switched on yet">
        Push notifications have not been configured for this deployment
        (NEXT_PUBLIC_VAPID_PUBLIC_KEY is unset). Tickets still appear in the
        app.
      </Alert>
    )
  }

  if (state === 'blocked') {
    return (
      <Alert variant="warning" title="Notifications are blocked">
        This browser is set to block notifications from HOA Hub. Allow them in
        the browser's site settings for this page, then reload — we cannot ask
        again from here once you have said no.
      </Alert>
    )
  }

  const serverUnavailable = storedDeviceCount === null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'on' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={disable}
            loading={busy}
            disabled={busy}
          >
            <BellOff className="h-3.5 w-3.5" />
            Turn off on this device
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={enable}
            loading={busy}
            disabled={busy || serverUnavailable}
          >
            <Bell className="h-3.5 w-3.5" />
            Turn on for this device
          </Button>
        )}

        <span className="text-sm text-muted">
          {state === 'on'
            ? 'On for this device.'
            : 'Off — you will still see tickets in the app.'}
          {storedDeviceCount && storedDeviceCount > 0
            ? ` ${storedDeviceCount} device${storedDeviceCount === 1 ? '' : 's'} registered on your account.`
            : ''}
        </span>
      </div>

      {serverUnavailable ? (
        <Alert variant="warning" title="Not available yet">
          Notification storage has not been set up on the server yet, so there
          is nowhere to record this device. Tickets still appear in the app.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error" title="Could not update notifications">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
