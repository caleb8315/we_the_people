import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light canvas theme inspired by the Crosscheck brand refresh
        // (April 2026). `ink` is primary text, `paper` is the card
        // surface, `canvas` is the page background.
        canvas: {
          DEFAULT: '#f6f7fa',
          50: '#fafbfd',
          100: '#f1f3f7',
          200: '#e5e8ef',
        },
        paper: '#ffffff',
        ink: {
          DEFAULT: '#0f172a',
          900: '#0b1220',
          800: '#111827',
          700: '#1f2937',
          600: '#374151',
          500: '#4b5563',
          400: '#6b7280',
          300: '#9ca3af',
          200: '#cbd2db',
          100: '#e5e8ef',
        },
        // Warm amber accent — our single attention color (replaces the
        // old monochrome white CTA). Use sparingly (<= 2 per screen).
        amber: {
          50: '#fff9eb',
          100: '#fef1c7',
          200: '#fde08a',
          300: '#fbc84f',
          400: '#fbb024',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Neutral dark for the floating pill nav + hero tabs.
        charcoal: {
          900: '#0f1216',
          800: '#15181d',
          700: '#1f232a',
        },
        // Kept: green = high confidence, amber/warn = medium, rose = contested.
        // All tuned for legibility on the new light canvas.
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        warn: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        ok: {
          400: '#34d399',
          500: '#10b981',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.55' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg': ['18px', { lineHeight: '1.55' }],
        'xl': ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.3' }],
        '3xl': ['30px', { lineHeight: '1.2' }],
        '4xl': ['36px', { lineHeight: '1.15' }],
        '5xl': ['44px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        card: '22px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        'card-hover': '0 2px 4px rgba(15, 23, 42, 0.06), 0 16px 36px -14px rgba(15, 23, 42, 0.18)',
        'pill-nav': '0 10px 30px -8px rgba(15, 23, 42, 0.35)',
        ring: '0 0 0 2px rgba(245, 158, 11, 0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
