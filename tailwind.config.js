/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#050816',
        panel: '#0d1326',
        accent: '#3dd9ff',
        accentSoft: '#7ef9ff',
        warning: '#ff9f43',
        danger: '#ff5a5f',
        success: '#2dd4bf',
        glow: '#101b31',
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(61,217,255,0.25), 0 0 18px rgba(61,217,255,0.3)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(125,211,252,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.08) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
