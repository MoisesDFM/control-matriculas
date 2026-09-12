import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      keyframes: {
        'pulse-danger': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgba(220,38,38,0)' },
        },
      },
      animation: { 'pulse-danger': 'pulse-danger 1.8s ease-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
