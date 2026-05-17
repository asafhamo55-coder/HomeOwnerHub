import type { Config } from 'tailwindcss'
import sharedConfig from '@homeowner-portal/ui/tailwind.config'

const config: Config = {
  ...sharedConfig,
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    ...sharedConfig.theme,
    extend: {
      ...sharedConfig.theme?.extend,
      colors: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.colors as Record<string, unknown>,
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        ember: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
        },
        ink: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712',
        },
      },
      fontFamily: {
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(31,41,55,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(31,41,55,0.05) 1px, transparent 1px)',
        'radial-spot':
          'radial-gradient(60% 50% at 50% 0%, rgba(37,99,235,0.12) 0%, rgba(249,115,22,0.05) 40%, transparent 70%)',
      },
      animation: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.animation as Record<string, unknown>,
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        'blink': 'blink 1s steps(1) infinite',
        'marquee': 'marquee 55s linear infinite',
      },
      keyframes: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.keyframes as Record<string, unknown>,
        floatSlow: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
        // Translate -50% so the duplicated track wraps seamlessly.
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
    },
  },
}

export default config
