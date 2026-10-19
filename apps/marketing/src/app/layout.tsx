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
  metadataBase: new URL('https://ledger.ai'),
  title: {
    default: 'HomeownerHub — AI for the people who run residential property',
    template: '%s · HomeownerHub',
  },
  description:
    'The AI-native operating system for HOA boards, small landlords, and the legal work when tenancies break down. Less paperwork. More peace of mind.',
  openGraph: {
    title: 'HomeownerHub',
    description:
      'AI for HOA boards, landlords, and eviction support. Less paperwork.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-surface text-foreground">{children}</body>
    </html>
  )
}
