import { ImageResponse } from 'next/og'

// iOS home-screen icon. 180×180 PNG. Rendered at request time by
// Next's ImageResponse so no binary file is committed and the icon
// stays in sync with the brand colors / letterform.
//
// Design — Concept B from the brand exploration:
//   - Indigo-600 background (matches --primary in globals.css)
//   - White "L" letterform (square-cap strokes, 8% corner radius)
//   - No text, no extras — Apple gives ~10pt rounded crop on top.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#4F46E5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // iOS automatically rounds + crops to ~22% radius. We render
          // a square canvas; the OS handles the shape.
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11 7.5v17M11 24.5h12"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="square"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
