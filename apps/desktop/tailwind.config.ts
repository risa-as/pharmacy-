import type { Config } from 'tailwindcss';
import sharedConfig from '../../packages/shared/tailwind.config';

const config: Config = {
  // All token definitions (colours, radius, fonts, darkMode) come from the shared preset
  presets: [sharedConfig],

  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Include shared UI package so its class names are not purged during build
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],

  theme: {
    extend: {
      // Desktop-specific animations (slide-up for modals, scale-in for dropdowns)
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        slideUp: 'slideUp 0.3s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out',
      },
    },
  },

  plugins: [],
};

export default config;
