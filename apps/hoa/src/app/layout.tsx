import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

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
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  // Don't let iOS zoom the chrome on form-input focus — the app should
  // feel native-ish once installed.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
