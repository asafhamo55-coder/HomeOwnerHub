import { ImageResponse } from 'next/og'
import { LOGO } from '@homeowner-portal/ui/tokens'
import { MARK } from '@homeowner-portal/ui/brand'

// 32×32 PNG at /icon: the PWA manifest icon and the web-push notification
// badge (public/sw.js). Draws the HomeownerHub mark (BL-098: an H whose
// crossbar is a roof, with a door) from the same geometry as BrandMark and
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
        <rect width="32" height="32" rx={MARK.tileRadius} fill={c.tile} />
        <path d={MARK.stems.d} stroke={c.glyph} strokeWidth={MARK.stems.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d={MARK.roof.d} stroke={c.glyph} strokeWidth={MARK.roof.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x={MARK.door.x} y={MARK.door.y} width={MARK.door.width} height={MARK.door.height} rx={MARK.door.rx} fill={c.line} />
      </svg>
      </div>
    ),
    { ...size },
  )
}
