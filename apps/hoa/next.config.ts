import type { NextConfig } from 'next'

const config: NextConfig = {
  // Workspace UI/AI/db packages ship raw TS — let Next compile them.
  transpilePackages: ['@homeowner-portal/ui', '@homeowner-portal/ai', '@homeowner-portal/db'],
  images: {
    remotePatterns: [
      // Supabase Storage signed URLs for violation photos.
      { protocol: 'https', hostname: 'xwdjsxfskvreguyvryhc.supabase.co' },
    ],
  },
}

export default config
