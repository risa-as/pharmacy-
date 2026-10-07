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
        // Navy from the logo: headings and dark bands.
        ink: {
          50: '#eef1fb',
          100: '#dce2f5',
          600: '#1c2f86',
          700: '#0b1f73',
          800: '#0a1a5c',
          900: '#0a1446',
          950: '#060b2e',
        },
        // Leaf green from the logo: small highlights only.
        accent: {
          DEFAULT: '#4cc157',
          hover: '#3fae4a',
          soft: '#e6f7e8',
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
