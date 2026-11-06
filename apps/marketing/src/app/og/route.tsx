import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { SITE_DISPLAY_HOST } from '@/lib/site'

// Per-page share image: the page title on the brand violet card, 1200x630.
// pageMetadata() (lib/site.ts) points every page's Open Graph and Twitter
// image here as /og?title=<page title>. System font only, so there is no
// font fetch at request time. The title is clamped so a long or hostile
// query string can't blow up the layout or the render cost.

const MAX_TITLE = 90

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('title') ?? ''
  const clean = raw.replace(/\s+/g, ' ').trim()
  const title = clean ? (clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean) : 'AI for self-managed HOA boards'
  const fontSize = title.length > 60 ? 56 : title.length > 36 ? 68 : 80

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
          background: 'linear-gradient(135deg, #3b0764 0%, #6b21a8 55%, #7e22ce 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 40, fontWeight: 700 }}>
          <span>Homeowner</span>
          <span style={{ color: '#e9d5ff' }}>Hub</span>
        </div>
        <div style={{ display: 'flex', fontSize, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{title}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#f0e8ff' }}>
          <span>AI for self-managed HOA boards</span>
          <span>{SITE_DISPLAY_HOST}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400' },
    },
  )
}
