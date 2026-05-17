import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@homeowner-portal/ui'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default config
