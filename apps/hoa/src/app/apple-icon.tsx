import { ImageResponse } from 'next/og'
import { LOGO } from '@homeowner-portal/ui/tokens'

// iOS home-screen icon and web-push notification icon (public/sw.js), 180×180
// PNG at /apple-icon. The Ledger mark (BL-094) full-bleed: iOS applies its own
// rounded crop, so the tile has no radius and the glyph sits inside a wider
// safe margin (same as public/brand/icon-touch.svg). Colours from LOGO in
// packages/ui/src/tokens.ts.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const c = LOGO.light
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      <svg width="180" height="180" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill={c.tile} />
        <g transform="translate(3.2 3.2) scale(0.8)">
          <path d="M7 15.5 16 7.5l9 8M21.5 11.5V8" stroke={c.glyph} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M10.5 19.75h11" stroke={c.glyph} strokeWidth="2.75" strokeLinecap="round" fill="none" />
          <path d="M10.5 24.5h6.5" stroke={c.line} strokeWidth="2.75" strokeLinecap="round" fill="none" />
        </g>
      </svg>
      </div>
    ),
    { ...size },
  )
}
