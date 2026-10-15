import type { Config } from 'tailwindcss'
import { createTailwindConfig } from '@homeowner-portal/ui/tailwind.config'

// Shared design-system preset (docs/specs/2026-10-15-design-system-v2.md).
// Colour variables, light + dark (`.dark` on <html>), come from
// packages/ui/src/tokens.ts — do not redeclare them in globals.css.
const shared = createTailwindConfig('hoa')

const config: Config = {
  ...shared,
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
}

export default config
