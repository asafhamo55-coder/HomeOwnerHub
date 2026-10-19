import { ImageResponse } from 'next/og'
import { LOGO } from '@homeowner-portal/ui/tokens'

// 32×32 PNG at /icon: the PWA manifest icon and the web-push notification
// badge (public/sw.js). Draws the Ledger mark (BL-094) — same geometry as
// public/brand/logo-mark.svg; colours from LOGO in packages/ui/src/tokens.ts.
// The browser-tab favicon itself is app/favicon.ico (16/32/48).

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  const c = LOGO.light
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7.5" fill={c.tile} />
        <path d="M7 15.5 16 7.5l9 8M21.5 11.5V8" stroke={c.glyph} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M10.5 19.75h11" stroke={c.glyph} strokeWidth="2.75" strokeLinecap="round" fill="none" />
        <path d="M10.5 24.5h6.5" stroke={c.line} strokeWidth="2.75" strokeLinecap="round" fill="none" />
      </svg>
      </div>
    ),
    { ...size },
  )
}
