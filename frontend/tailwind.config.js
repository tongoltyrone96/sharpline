/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0D14',
        panel: '#111520',
        'panel-2': '#0E121B',
        raise: '#161B27',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
