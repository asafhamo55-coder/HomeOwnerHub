import { ImageResponse } from 'next/og'

// Browser tab favicon. 32×32 PNG, rendered at request time so it stays
// brand-locked without committing a binary file. Shared Ledger "L" mark
// across all apps — drops the stroke width so the L stays legible at
// this size.

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: '6px',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11 7.5v17M11 24.5h12"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="square"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
