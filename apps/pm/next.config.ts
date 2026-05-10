import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@homeowner-portal/ui', '@homeowner-portal/ai', '@homeowner-portal/db'],
}

export default config
