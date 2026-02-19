/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0f1117',
          sidebar: '#1a1d27',
          card: '#21263a',
          border: '#2e3350',
        },
        accent: {
          blue: '#4f8ef7',
          green: '#22d3a5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
