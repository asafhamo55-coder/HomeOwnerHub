import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@homeownerhub/ui', '@homeownerhub/ai', '@homeownerhub/db'],
}

export default config
