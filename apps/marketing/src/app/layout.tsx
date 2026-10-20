import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'
import { SITE_NAME, SITE_ORIGIN } from '@/lib/site'

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

// BL-097: PM and Eviction are not offered right now.
const description = OTHER_HUBS_ENABLED
  ? 'The AI-native operating system for HOA boards, small landlords, and the legal work when tenancies break down. Less paperwork. More peace of mind.'
  : 'The AI-native operating system for self-managed HOA boards. Less paperwork. More peace of mind.'
const shortDescription = OTHER_HUBS_ENABLED
  ? 'AI for HOA boards, landlords, and eviction support. Less paperwork.'
  : 'AI for self-managed HOA boards. Less paperwork.'

export const metadata: Metadata = {
  // The marketing site's own origin after the domain split (lib/site.ts:
  // NEXT_PUBLIC_SITE_URL, falling back to www). Absolutises canonical and
  // OG URLs. The app lives on app.homeownerledger.com (lib/app-origin.ts).
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: {
    default: OTHER_HUBS_ENABLED
      ? 'HomeownerHub — AI for the people who run residential property'
      : 'HomeownerHub — AI for self-managed HOA boards',
    template: `%s · ${SITE_NAME}`,
  },
  description,
  // No canonical here: a layout's alternates are inherited by every page
  // that doesn't set its own, which would point them all at "/". Each page
  // sets its canonical through pageMetadata() (lib/site.ts).
  openGraph: {
    title: SITE_NAME,
    description: shortDescription,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: shortDescription,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-surface text-foreground">{children}</body>
    </html>
  )
}
