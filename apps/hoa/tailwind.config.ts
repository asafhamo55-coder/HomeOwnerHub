import type { Config } from 'tailwindcss'
import sharedConfig from '@homeowner-portal/ui/tailwind.config'

const config: Config = {
  ...sharedConfig,
  // Class strategy: dark mode toggles by adding `.dark` to <html>.
  // CSS variable overrides in globals.css under the `.dark` selector
  // do the actual theming — same Tailwind token names, different
  // HSL values, no per-component dark: variants required for the
  // 80%+ of UI that already uses semantic tokens.
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
}

export default config
