import type { Config } from 'tailwindcss';

const config: Config = {
  // Always light: the old media-based dark mode left most sections half-styled.
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f7575', // Faramace brand colour
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        ink: {
          900: '#06201f',
          950: '#031413',
        },
        accent: {
          DEFAULT: '#F59E0B',
          hover: '#D97706',
          soft: '#FEF3C7',
        },
      },
      fontFamily: {
        cairo: ['var(--font-cairo)'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        lift: '0 2px 4px rgba(15, 23, 42, 0.04), 0 24px 48px -16px rgba(15, 23, 42, 0.22)',
        glow: '0 30px 80px -20px rgba(15, 117, 117, 0.55)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out both',
        'fade-in-up': 'fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 6s ease-in-out infinite',
        'dash-flow': 'dashFlow 1.2s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        dashFlow: { to: { strokeDashoffset: '-16' } },
      },
    },
  },
  plugins: [],
};

export default config;
