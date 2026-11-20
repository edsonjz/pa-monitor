/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { navy: '#1F3864' },
      keyframes: {
        alertBlink: {
          '0%, 100%': { backgroundColor: '#dc2626', borderColor: '#7f1d1d', boxShadow: '0 0 0 0 rgba(220,38,38,.8)' },
          '50%': { backgroundColor: '#fca5a5', borderColor: '#ef4444', boxShadow: '0 0 18px 6px rgba(239,68,68,.9)' },
        },
      },
      animation: { alertBlink: 'alertBlink 0.8s ease-in-out infinite' },
    },
  },
  plugins: [],
};
