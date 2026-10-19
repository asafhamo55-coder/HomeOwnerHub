import { ImageResponse } from 'next/og'
import { LOGO } from '@homeowner-portal/ui/tokens'
import { MARK } from '@homeowner-portal/ui/brand'

// iOS home-screen icon and web-push notification icon (public/sw.js), 180×180
// PNG at /apple-icon. The HomeownerHub mark (BL-098) full-bleed: iOS applies
// its own rounded crop, so the tile has no radius and the glyph sits inside a
// wider safe margin (same as public/brand/icon-touch.svg). Geometry from
// BrandMark; colours from LOGO in packages/ui/src/tokens.ts.

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
          <path d={MARK.stems.d} stroke={c.glyph} strokeWidth={MARK.stems.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d={MARK.roof.d} stroke={c.glyph} strokeWidth={MARK.roof.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x={MARK.door.x} y={MARK.door.y} width={MARK.door.width} height={MARK.door.height} rx={MARK.door.rx} fill={c.line} />
        </g>
      </svg>
      </div>
    ),
    { ...size },
  )
}
