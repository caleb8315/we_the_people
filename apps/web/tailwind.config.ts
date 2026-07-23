import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Civic light theme — navy + teal + flare coral.
        // Avoids purple gradients and cream/terracotta AI defaults.
        canvas: {
          DEFAULT: '#eef3f7',
          50: '#f7fafc',
          100: '#e8eef4',
          200: '#d5e0ea',
        },
        paper: '#ffffff',
        ink: {
          DEFAULT: '#0b1f3a',
          900: '#071525',
          800: '#0b1f3a',
          700: '#163255',
          600: '#274866',
          500: '#3d5a73',
          400: '#6b8296',
          300: '#9aafc0',
          200: '#c7d5e0',
          100: '#e4ebf1',
        },
        signal: {
          DEFAULT: '#0f9b8e',
          50: '#e7f8f6',
          100: '#c7f0eb',
          200: '#8edfd5',
          300: '#4fc7b9',
          400: '#1fad9f',
          500: '#0f9b8e',
          600: '#0b7d72',
          700: '#0a635b',
        },
        flare: {
          DEFAULT: '#e4572e',
          50: '#fff1ec',
          100: '#ffd9cc',
          200: '#ffb399',
          300: '#f8895f',
          400: '#ef6a3f',
          500: '#e4572e',
          600: '#c74420',
          700: '#a3361a',
        },
        // Keep amber aliases mapped to flare so existing components stay coherent.
        amber: {
          50: '#fff1ec',
          100: '#ffd9cc',
          200: '#ffb399',
          300: '#f8895f',
          400: '#ef6a3f',
          500: '#e4572e',
          600: '#c74420',
          700: '#a3361a',
        },
        charcoal: {
          900: '#0b1f3a',
          800: '#122a34',
          700: '#1c3550',
        },
        brand: {
          50: '#e7f8f6',
          100: '#c7f0eb',
          200: '#8edfd5',
          300: '#4fc7b9',
          400: '#1fad9f',
          500: '#0f9b8e',
          600: '#0b7d72',
          700: '#0a635b',
        },
        warn: {
          50: '#fff8e8',
          100: '#ffefc2',
          200: '#ffe08a',
          300: '#ffcf4d',
          400: '#f5b820',
          500: '#e0a00d',
          600: '#b87f08',
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
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
        card: '0 1px 2px rgba(11, 31, 58, 0.04), 0 8px 24px -12px rgba(11, 31, 58, 0.14)',
        'card-hover': '0 2px 4px rgba(11, 31, 58, 0.06), 0 16px 36px -14px rgba(11, 31, 58, 0.2)',
        'pill-nav': '0 10px 30px -8px rgba(11, 31, 58, 0.4)',
        ring: '0 0 0 2px rgba(15, 155, 142, 0.45)',
      },
      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseBar: {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '1' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -1%, 0) scale(1.03)' },
        },
      },
      animation: {
        'rise-in': 'riseIn 0.7s ease-out both',
        'rise-in-delay': 'riseIn 0.8s ease-out 0.12s both',
        'rise-in-late': 'riseIn 0.85s ease-out 0.24s both',
        'pulse-bar': 'pulseBar 2.4s ease-in-out infinite',
        drift: 'drift 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
