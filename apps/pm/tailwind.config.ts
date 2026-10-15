import type { Config } from 'tailwindcss'
import { createTailwindConfig } from '@homeowner-portal/ui/tailwind.config'

// Shared design-system preset (docs/specs/2026-10-15-design-system-v2.md).
// PM Hub only swaps the brand hue (blue); everything else is shared.
const shared = createTailwindConfig('pm')

const config: Config = {
  ...shared,
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
}

export default config
