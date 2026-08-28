/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"IBM Plex Sans"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#f9f9ff',
          dim: '#cfdaf2',
          bright: '#f9f9ff',
          container: {
            lowest: '#ffffff',
            low: '#f0f3ff',
            DEFAULT: '#e7eeff',
            high: '#dee8ff',
            highest: '#d8e3fb',
          },
        },
        on: {
          surface: '#111c2d',
          'surface-variant': '#45464d',
          background: '#111c2d',
        },
        inverse: {
          surface: '#263143',
          'on-surface': '#ecf1ff',
        },
        outline: {
          DEFAULT: '#76777d',
          variant: '#c6c6cd',
        },
        primary: {
          DEFAULT: '#000000',
          container: '#131b2e',
          fixed: {
            DEFAULT: '#dae2fd',
            dim: '#bec6e0',
          },
        },
        secondary: {
          DEFAULT: '#4b41e1',
          container: '#645efb',
          fixed: {
            DEFAULT: '#e2dfff',
            dim: '#c3c0ff',
          },
        },
        tertiary: {
          DEFAULT: '#000000',
          container: '#001a42',
          fixed: {
            DEFAULT: '#d8e2ff',
            dim: '#adc6ff',
          },
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        brand: {
          50: '#f0f3ff',
          100: '#e7eeff',
          200: '#dee8ff',
          300: '#d8e3fb',
          400: '#bec6e0',
          500: '#4b41e1',
          600: '#645efb',
          700: '#3323cc',
          800: '#0f0069',
          900: '#131b2e',
        },
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'unit': '4px',
        'container-padding': '24px',
        'element-gap': '12px',
        'gutter': '16px',
      },
      fontSize: {
        'display-lg': ['30px', { lineHeight: '36px', fontWeight: '600', letterSpacing: '-0.02em' }],
        'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.01em' }],
        'body-sm': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'body-xs': ['12px', { lineHeight: '18px', fontWeight: '400' }],
        'label-mono': ['11px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.05em' }],
        'label-bold': ['12px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.02em' }],
      },
    },
  },
  plugins: [],
};
