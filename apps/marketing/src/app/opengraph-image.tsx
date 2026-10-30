import { ImageResponse } from 'next/og'
import { SITE_DISPLAY_HOST } from '@/lib/site'

// The default share image for every marketing page (file convention: it
// applies to this segment and all below it). Text only, in the brand blue,
// so it needs no font or image fetch at build time.

export const alt = 'HomeownerHub: AI for self-managed HOA boards'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#ffffff',
          color: '#0f172a',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 44, fontWeight: 700 }}>
          <span>Homeowner</span>
          <span style={{ color: '#4B27C9' }}>Hub</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            AI runs the paperwork.
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            The board runs the HOA.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: '#475569' }}>
            {`For self-managed HOA boards · Georgia first · ${SITE_DISPLAY_HOST}`}
          </div>
        </div>
        <div style={{ display: 'flex', height: 12, width: '100%', background: '#4B27C9', borderRadius: 6 }} />
      </div>
    ),
    size,
  )
}
