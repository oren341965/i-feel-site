/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Heebo', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50:'#f0f5fb', 100:'#dae6f2', 200:'#b4cce5', 300:'#83a8d1',
          400:'#5285ba', 500:'#3868a0', 600:'#285183', 700:'#1e3e66',
          800:'#1a3354', 900:'#0f1f36'
        },
        accent: { 500:'#d4a544', 600:'#b8892e' }
      }
    }
  },
  plugins: []
};