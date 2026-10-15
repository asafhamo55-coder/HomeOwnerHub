import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { THEME_INIT_SCRIPT } from '@homeowner-portal/ui'
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
    default: 'Eviction Hub',
    template: '%s · Eviction Hub',
  },
  description: 'Compliant eviction filings without the law-firm bill.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Pre-paint theme (light/dark/system) + collapsed-rail restore, so
            there is no flash. Same script as HOA Hub. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
