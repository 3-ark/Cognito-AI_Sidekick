/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/sidePanel/index.html",
  ],
  theme: {
    extend: {
      borderColor: {
        'subtle-light': 'rgba(0, 0, 0, 0.3)',
        'subtle-dark': 'rgba(255, 255, 255, 0.3)',
      },
      fontFamily: {
        bas: ['Bruno Ace SC', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('tailwind-scrollbar-hide'),
    require('tailwind-scrollbar'),
  ],
}
