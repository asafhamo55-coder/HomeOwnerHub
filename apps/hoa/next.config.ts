import type { NextConfig } from 'next'

// Security headers sent on every response. These are the standard set
// browsers expect from production sites — without them, mobile Safari
// in particular treats new domains as "risky" and warns the user.
//
// Tested against securityheaders.com — these get an A+ score. After
// the domain accumulates traffic history and we're ready, we can also
// submit hstspreload.org so Chrome/Safari hard-code HTTPS for the
// domain at the browser level.
const SECURITY_HEADERS = [
  // 2-year HSTS with subdomains + preload eligibility. Combined with
  // the Vercel-provisioned cert this earns the green-padlock + no
  // "risky" indicators on iOS / Android.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Stop MIME-sniffing attacks. Sends 'nosniff' so browsers respect
  // the Content-Type we declare.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Clickjacking protection — disallow all framing of any HOA Hub
  // page. We don't embed in third-party iframes anywhere.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Don't leak full URLs to third parties on outbound navigation.
  // strict-origin-when-cross-origin sends the origin only, no path.
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Disable powerful platform APIs we don't use. Removes the risk of
  // a compromised dependency calling getUserMedia etc.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // Speeds up DNS resolution for outbound origins (e.g. Supabase) on
  // first paint. Doesn't lower security; nice perf touch.
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const config: NextConfig = {
  // Client-side Router Cache tuning. Next 15 defaults `dynamic` to 0s,
  // which means every navigation to a dynamic (auth + per-org DB) page
  // throws away the <Link prefetch> payload and re-fetches from the
  // server on click — the brief flash between pages. Giving dynamic
  // pages a short reuse window lets an in-viewport/hover prefetch (and
  // any recently-visited page) satisfy the click instantly from memory,
  // so the destination paints immediately with no server round-trip.
  //
  // Trade-off: a page can serve up to `dynamic` seconds stale when
  // navigated back to. Mutations that call revalidatePath/revalidateTag
  // or router.refresh() still bust the cache, so writes stay correct;
  // only passive re-navigation within the window reuses cached content.
  // 30s is a comfortable balance for a dashboard — raise it for snappier
  // back-nav, lower it if any page must always show second-fresh data.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    // Next 15 defaults server-action bodies to 1 MB, which silently rejects
    // every real phone photo (a typical iPhone HEIC is 2-4 MB) before the
    // app's own validation ever runs. `ATTACHMENT_MAX_BYTES`
    // (apps/hoa/src/lib/attachment-rules.ts) is 10 MB and is what residents
    // are told and what the server action itself enforces — raise the
    // platform ceiling to match so it doesn't silently undercut the limit
    // the app already agreed to.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Workspace UI/AI/db packages ship raw TS — let Next compile them.
  transpilePackages: [
    '@homeowner-portal/ui',
    '@homeowner-portal/ai',
    '@homeowner-portal/db',
    '@homeowner-portal/workflows',
  ],
  // pdfkit ships .afm font data files alongside its JS. Next.js's bundler
  // (both webpack and Turbopack) doesn't follow those data files, so a
  // bundled pdfkit fails at runtime trying to read Helvetica.afm. Marking
  // it as a server-external package keeps it as a runtime node_modules
  // import, which can find its own data files.
  serverExternalPackages: ['pdfkit'],
  images: {
    remotePatterns: [
      // Supabase Storage signed URLs for violation photos.
      { protocol: 'https', hostname: 'xwdjsxfskvreguyvryhc.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        // Apply the security header set to every route.
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default config
