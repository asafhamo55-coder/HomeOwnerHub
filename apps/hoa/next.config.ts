import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'
import bundleAnalyzer from '@next/bundle-analyzer'

// Security headers sent on every response. These are the standard set
// browsers expect from production sites — without them, mobile Safari
// in particular treats new domains as "risky" and warns the user.
//
// Tested against securityheaders.com — these get an A+ score. After
// the domain accumulates traffic history and we're ready, we can also
// submit hstspreload.org so Chrome/Safari hard-code HTTPS for the
// domain at the browser level.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com https://js.stripe.com https://va.vercel-scripts.com https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://api.stripe.com https://*.plaid.com https://vitals.vercel-insights.com https://vercel.live",
  "frame-src 'self' blob: https://js.stripe.com https://hooks.stripe.com https://*.plaid.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

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
  // BL-175a H6: a second line of defence against XSS. Deliberately
  // REPORT-ONLY: Next injects inline bootstrap scripts (no nonce pipeline
  // here yet, hence 'unsafe-inline'), and the app also loads Plaid Link,
  // Stripe, Sentry, Supabase and Vercel analytics. Violations are logged in
  // the browser console without blocking anything. Once a deploy shows no
  // legitimate violations, rename the header to `Content-Security-Policy`
  // (and replace 'unsafe-inline' with nonces) to enforce.
  { key: 'Content-Security-Policy-Report-Only', value: CSP },
]

const config: NextConfig = {
  // next build's type check reads tsconfig.build.json: the same compiler
  // options and every shipped source file, minus *.test.ts(x). Tests never
  // ship, and `pnpm typecheck` (tsconfig.json) still checks all of them in
  // CI before any deploy. Measured 2026-10-27 with tsc --extendedDiagnostics:
  // 3.0 GB with tests vs 2.1 GB without. That keeps the Vercel build under its
  // 8 GB limit (deploy 41b7c353 was OOM-killed in the type check).
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  // BL-071: the in-app version label (apps/hoa/src/lib/app-version.ts).
  // Vercel exposes no commit date, so the build stamps its own time; the
  // commit sha is read from VERCEL_GIT_COMMIT_SHA, the same var
  // /api/health reports as `version`.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // /whats-new reads docs/releases/*.md (outside the app dir) at runtime;
  // trace it into that route's bundle so the files ship with the deploy.
  outputFileTracingIncludes: {
    '/whats-new': ['../../docs/releases/**/*'],
  },
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
    // Vercel's build container has 8 GB. With the default worker count,
    // build workers ran beside the full type check and the container was
    // OOM-killed (exit 137) during "checking validity of types" (deploys
    // 86994ea8, 9d3b43bc). One worker and webpack's memory optimizations
    // keep the type check and fit in the container, at some build-time cost.
    cpus: 1,
    webpackMemoryOptimizations: true,
    // withSentryConfig supplies a custom webpack config, and Next then turns
    // the build worker OFF by default (build/index.js: `webpackBuildWorker ||
    // (undefined && !config.webpack)`). Without it, the compiler's memory is
    // still held when the type check starts, which OOM-killed deploy
    // 41b7c353 (2026-10-27). The worker frees compile memory first; the
    // type check stays on.
    webpackBuildWorker: true,
    staleTimes: {
      dynamic: 30,
      // Also how long a hover-loaded page (NavLink) is reused, so keep it short.
      static: 30,
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
    '@homeowner-portal/observability',
  ],
  // pdfkit ships .afm font data files alongside its JS. Next.js's bundler
  // (both webpack and Turbopack) doesn't follow those data files, so a
  // bundled pdfkit fails at runtime trying to read Helvetica.afm. Marking
  // it as a server-external package keeps it as a runtime node_modules
  // import, which can find its own data files.
  // pdfjs-dist (SEC-L7 PDF text extraction): its legacy build and worker
  // module are loaded at runtime from node_modules, not bundled; the worker
  // is imported explicitly (lib/pdf/extract-text.ts) so tracing sees it.
  serverExternalPackages: ['pdfkit', 'pdfjs-dist'],
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

// Sentry build integration. Source maps are uploaded (and a release
// created) only when SENTRY_AUTH_TOKEN is set; without it the build is
// identical to a Sentry-less one. Runtime capture is configured separately
// in src/instrumentation*.ts and is inert without a DSN.
const hasSentryToken = Boolean(process.env.SENTRY_AUTH_TOKEN)

// ANALYZE=1 pnpm --filter hoa build writes .next/analyze/*.html (BL-099 perf pass).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === '1',
  openAnalyzer: false,
  analyzerMode: process.env.ANALYZE_JSON === '1' ? 'json' : 'static',
})

export default withBundleAnalyzer(withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !hasSentryToken },
  release: { create: hasSentryToken, finalize: hasSentryToken },
}))
