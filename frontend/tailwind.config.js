/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0a192f',
        accent: '#00c9b1',
        card: '#1b2d45',
        'text-light': '#e0e0e0',
        'button-dark': '#0f223d',
      },
      boxShadow: {
        'accent-glow': '0 0 15px rgba(0,201,177,0.7)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.3)', opacity: '0.8' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        vibrate: {
          '0%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-1px, 1px)' },
          '40%': { transform: 'translate(-1px, -1px)' },
          '60%': { transform: 'translate(1px, 1px)' },
          '80%': { transform: 'translate(1px, -1px)' },
          '100%': { transform: 'translate(0)' },
        },
        'vibrate-ring': {
          '0%': { transform: 'scale(0.9)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(0.9)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        vibrate: 'vibrate 0.2s linear infinite',
        'vibrate-ring': 'vibrate-ring 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
