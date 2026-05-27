// Fallback page served by the service worker when a navigation
// request can't reach the network AND the page isn't in the runtime
// cache. Intentionally minimal — no data fetches, no client features
// that need the network — so it always renders correctly offline.

import Link from 'next/link'

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
        background: '#FAFBFD',
        color: '#111827',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 24px',
            background: '#4F46E5',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M11 7.5v17M11 24.5h12"
              stroke="#FFFFFF"
              strokeWidth="3"
              strokeLinecap="square"
              fill="none"
            />
          </svg>
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
            color: '#6B7280',
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
              background: '#4F46E5',
              color: 'white',
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
              color: '#6B7280',
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
