import type { Config } from 'tailwindcss';

/**
 * Static hex/HSL values for NativeWind (mobile) — no CSS variable references.
 * Metro bundler resolves these at compile time; CSS custom properties are not supported.
 */
export const staticTokens = {
  colors: {
    // Brand
    primary:   { DEFAULT: '#0F7575', light: '#1CABAC', dark: '#0B5E5E' },
    // Semantic
    success:   '#2D8A52',
    warning:   '#C47820',
    danger:    '#B03030',
    info:      '#2B6F8F',
    // Dark mode variants (for NativeWind colorScheme switching)
    'primary-dark': '#1CABAC',
    'success-dark': '#44C47A',
    'warning-dark': '#D4934A',
    'danger-dark':  '#D86B6B',
    'info-dark':    '#5B9FBE',
  },
} as const;

const config: Config = {
  darkMode: 'class', // REQUIRED — class strategy for all platforms

  // Minimal content glob; each consuming app overrides this with its own paths
  content: ['./src/**/*.{ts,tsx}'],

  theme: {
    extend: {
      colors: {
        // CSS-variable-based colours (Web + Desktop only; NativeWind uses staticTokens above)
        background:   'hsl(var(--background) / <alpha-value>)',
        foreground:   'hsl(var(--foreground) / <alpha-value>)',

        card: {
          DEFAULT:    'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT:    'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT:    'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
        },

        border: 'hsl(var(--border) / <alpha-value>)',
        input:  'hsl(var(--input) / <alpha-value>)',
        ring:   'hsl(var(--ring) / <alpha-value>)',
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      fontFamily: {
        // Arabic-first stack; Latin fallbacks for numeric data
        sans: ['IBM Plex Sans Arabic', 'Cairo', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
    },
  },

  plugins: [],
};

export default config;
