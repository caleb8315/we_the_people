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
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          700: '#27272a',
          800: '#18181b',
          900: '#09090b',
          950: '#030304',
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
        sans: [
          'Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.55' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg': ['18px', { lineHeight: '1.5' }],
        'xl': ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.3' }],
        '3xl': ['30px', { lineHeight: '1.2' }],
        '4xl': ['36px', { lineHeight: '1.15' }],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
        glow: '0 0 20px rgba(16,185,129,0.15)',
        ring: '0 0 0 2px rgba(16,185,129,0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
export default config;
