import type { Metadata } from 'next'
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { THEME_INIT_SCRIPT } from '@homeowner-portal/ui'
import { palette } from '@homeowner-portal/ui/tokens'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'

// Same face and weights as the marketing site, so the app and the website
// read as one product.
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'HomeownerHub',
    template: '%s · HomeownerHub',
  },
  description: 'Run your HOA without the paperwork.',
  // PWA / "Add to Home Screen" on iOS. The manifest at app/manifest.ts
  // gives Android Chrome the same treatment. Apple-specific bits live
  // under appleWebApp because iOS Safari ignores some manifest fields.
  applicationName: 'HomeownerHub',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HomeownerHub',
  },
  formatDetection: {
    telephone: false,
  },
  // BL-009: send only our origin as the referrer, even to our own pages, so
  // a record URL (`/inbox/<id>?q=…`) never rides along as `document.referrer`
  // into analytics or anywhere else.
  referrer: 'strict-origin',
  // HomeownerHub mark (BL-098). app/favicon.ico, app/icon.tsx and
  // app/apple-icon.tsx are picked up by file convention; the scalable SVG
  // favicon for modern browsers is added here (`other`, so the file-based
  // icons are not overridden).
  icons: {
    other: [{ rel: 'icon', type: 'image/svg+xml', url: '/brand/icon.svg' }],
  },
}

export const viewport: import('next').Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palette('hoa', 'light').background },
    { media: '(prefers-color-scheme: dark)', color: palette('hoa', 'dark').background },
  ],
  width: 'device-width',
  initialScale: 1,
  // Don't let iOS zoom the chrome on form-input focus — the app should
  // feel native-ish once installed.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${beVietnam.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Pre-paint theme script. Runs synchronously BEFORE any React
          rendering so the .dark class (and a collapsed sidebar) is on
          <html> before paint — no white flash for dark-mode users, no
          sidebar jump. Reads localStorage; falls back to the OS
          color-scheme media query. Source: packages/ui/src/lib/theme-script.ts.
          suppressHydrationWarning above keeps React quiet about the
          className diff this script introduces server→client.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
          }}
        />
      </head>
      <body>
        {children}
        {/* PWA service-worker registrar + update prompt. Renders nothing
            in dev or when no SW update is pending. Defers registration
            until the browser is idle so it never competes with initial
            render. */}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
