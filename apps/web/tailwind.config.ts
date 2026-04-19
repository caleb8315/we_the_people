import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {
          50: '#f7f8fa',
          100: '#eceef3',
          200: '#d6dae3',
          700: '#2a2f3a',
          800: '#171a22',
          900: '#0b0d12',
          950: '#070910',
        },
        brand: {
          50: '#ecfdf5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        warn: {
          400: '#fbbf24',
          500: '#f59e0b',
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
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(255,255,255,0.06)',
        ring: '0 0 0 2px rgba(16,185,129,0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
