import type { NextConfig } from 'next'

const config: NextConfig = {
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
}

export default config
