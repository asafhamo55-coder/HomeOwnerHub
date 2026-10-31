'use client'

// location.reload() re-requests the current URL. The service worker serves
// /offline at the original URL, so this retries the page the user wanted.
export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        background: 'hsl(var(--primary))',
        color: 'hsl(var(--primary-fg))',
        padding: '10px 18px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 14,
        border: 0,
        cursor: 'pointer',
      }}
    >
      Try again
    </button>
  )
}
