import type { Config } from 'tailwindcss'
import { createTailwindConfig } from '@homeowner-portal/ui/tailwind.config'

// Shared design-system preset (docs/specs/2026-10-15-design-system-v2.md).
// Colour variables, light + dark (`.dark` on <html>), come from
// packages/ui/src/tokens.ts — do not redeclare them in globals.css.
const shared = createTailwindConfig('hoa')

const config: Config = {
  ...shared,
  theme: {
    ...shared.theme,
    extend: {
      ...shared.theme?.extend,
      // Board floor: `text-xs` is 14px here (the preset default is 13px).
      // Boards are often older volunteers on phones. One change, no
      // per-screen edits. Marketing keeps the preset default.
      fontSize: {
        ...(shared.theme?.extend?.fontSize as Record<string, unknown>),
        xs: ['0.875rem', { lineHeight: '1.25rem' }],
      },
    },
  },
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
}

export default config
