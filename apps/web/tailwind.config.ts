import type { Config } from 'tailwindcss';
import sharedConfig from '../../packages/shared/tailwind.config';

const config: Config = {
  // All token definitions (colours, radius, fonts, darkMode) come from the shared preset
  presets: [sharedConfig],

  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    // Include shared UI package so its class names are not purged during build
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    extend: {},
  },

  plugins: [],
};

export default config;
