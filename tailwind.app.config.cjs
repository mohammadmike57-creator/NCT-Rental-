/** Tailwind build for the website (compiled at build time; no runtime CDN). */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { light: '#64748b', DEFAULT: '#475569', dark: '#334155' },
        secondary: '#10B981',
      },
      animation: { 'gradient-move': 'gradient-move 15s ease infinite' },
      keyframes: {
        'gradient-move': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};
