import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 3Lines Brand Blues
        primary: {
          DEFAULT: '#1a5f7a',
          dark: '#134b61',
          light: '#2980b9',
          50: '#e6f0f3',
          100: '#cce1e8',
          200: '#99c3d1',
          300: '#66a5ba',
          400: '#3387a3',
          500: '#1a5f7a',
          600: '#154c62',
          700: '#10394a',
          800: '#0b2631',
          900: '#051319',
        },
        // Status & Accent Colors
        success: {
          DEFAULT: '#27ae60',
          light: '#2ecc71',
          dark: '#1e8449',
        },
        danger: {
          DEFAULT: '#e74c3c',
          light: '#ec7063',
          dark: '#c0392b',
        },
        warning: {
          DEFAULT: '#f39c12',
          light: '#f5b041',
          dark: '#d68910',
        },
        info: {
          DEFAULT: '#3498db',
          light: '#5dade2',
          dark: '#2980b9',
        },
        purple: {
          DEFAULT: '#9b59b6',
          light: '#af7ac5',
          dark: '#7d3c98',
        },
        // Neutrals
        body: {
          dark: '#2c3e50',
          light: '#ffffff',
        },
        text: {
          gray: '#94a3b8',
          muted: '#718096',
        },
        border: {
          light: '#cbd5e0',
          dark: '#333333',
        },
        surface: {
          light: '#f7fafc',
          dark: '#1a1a1a',
          darker: '#0d0d0d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],    // 12px
        sm: ['0.875rem', { lineHeight: '1.4' }],   // 14px
        base: ['1rem', { lineHeight: '1.6' }],     // 16px
        lg: ['1.125rem', { lineHeight: '1.6' }],   // 18px
        xl: ['1.25rem', { lineHeight: '1.5' }],    // 20px
        '2xl': ['1.5rem', { lineHeight: '1.3' }],  // 24px - H4
        '3xl': ['1.875rem', { lineHeight: '1.3' }], // 30px - H3
        '4xl': ['2.25rem', { lineHeight: '1.3' }],  // 36px - H2
        '5xl': ['3rem', { lineHeight: '1.3' }],     // 48px - H1
      },
      spacing: {
        '4.5': '18px',
        '18': '72px',
      },
      borderRadius: {
        'sm': '4px',   // Inputs, buttons
        'DEFAULT': '8px', // Cards
        'lg': '12px',  // Modals, cards
        'xl': '16px',  // Hero sections
      },
      boxShadow: {
        'card': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 6px 12px rgba(0, 0, 0, 0.15)',
        'modal': '0 10px 25px rgba(0, 0, 0, 0.2)',
      },
      maxWidth: {
        'dashboard': '1200px',
        'report': '800px',
      },
    },
  },
  plugins: [],
};

export default config;
