// Fallback page served by the service worker when a navigation
// request can't reach the network AND the page isn't in the runtime
// cache. Intentionally minimal — no data fetches, no client features
// that need the network — so it always renders correctly offline.

import Link from 'next/link'
import { LedgerMark } from '@homeowner-portal/ui'

export const metadata = { title: 'Offline' }

// Don't try to render this dynamically — must be static so it caches
// cleanly in the SW.
export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 24px', display: 'flex' }}>
          <LedgerMark className="size-16" />
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 12px',
            letterSpacing: '-0.01em',
          }}
        >
          You're offline
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'hsl(var(--muted))',
            margin: '0 0 24px',
            lineHeight: 1.5,
          }}
        >
          HOA Hub needs an internet connection to load this page. Check
          your Wi-Fi or cellular, then try again.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/*
            Plain anchor so it bypasses Next's prefetch + client router
            (both pointless offline). location.reload would also work
            but we want a Link that the user can right-click → open.
          */}
          <a
            href="/"
            style={{
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-fg))',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Try again
          </a>
          <Link
            href="/"
            style={{
              color: 'hsl(var(--muted))',
              padding: '10px 18px',
              borderRadius: 8,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
