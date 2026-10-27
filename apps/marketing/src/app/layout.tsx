import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { JsonLd } from '@/components/site/json-ld'
import { MotionProvider } from '@/components/site/motion-provider'
import { organizationLd } from '@/lib/jsonld'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'
import { SITE_NAME, SITE_ORIGIN } from '@/lib/site'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Display face, used only for the one italic phrase in a headline.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-display',
  display: 'swap',
})

const jetbrainsMono =JetBrains_Mono({
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

const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION?.trim() || undefined

export const metadata: Metadata = {
  // The marketing site's own origin (lib/site.ts: NEXT_PUBLIC_SITE_URL,
  // falling back to www.homeownerledger.online). Absolutises canonical and
  // OG URLs. The app lives on www.homeownerledger.com (lib/app-origin.ts).
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  // Google Search Console ownership tag (OA-35). Omitted when the env var is unset.
  ...(GSC_VERIFICATION ? { verification: { google: GSC_VERIFICATION } } : {}),
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>
      <body className="bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <JsonLd data={organizationLd()} />
        <MotionProvider>{children}</MotionProvider>
        <Analytics />
      </body>
    </html>
  )
}
