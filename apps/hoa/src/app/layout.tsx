import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { THEME_INIT_SCRIPT } from '@homeowner-portal/ui'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'HOA Hub',
    template: '%s · HOA Hub',
  },
  description: 'Run your HOA without the paperwork.',
  // PWA / "Add to Home Screen" on iOS. The manifest at app/manifest.ts
  // gives Android Chrome the same treatment. Apple-specific bits live
  // under appleWebApp because iOS Safari ignores some manifest fields.
  applicationName: 'HOA Hub',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HOA Hub',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: import('next').Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0D11' },
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
      className={`${inter.variable} ${jetbrainsMono.variable}`}
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
