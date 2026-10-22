/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      // iOS dark-mode system colors (UIKit dynamic colors, dark variant)
      colors: {
        ios: {
          blue: "#0a84ff",
          green: "#30d158",
          indigo: "#5e5ce6",
          orange: "#ff9f0a",
          pink: "#ff375f",
          purple: "#bf5af2",
          red: "#ff453a",
          teal: "#40c8e0",
          yellow: "#ffd60a",
          gray: "#8e8e93",
          bg: "#000000",
          surface: "#1c1c1e",
          elevated: "#2c2c2e",
          separator: "rgba(84,84,88,0.65)",
          label: "#ffffff",
          secondary: "rgba(235,235,245,0.6)",
          tertiary: "rgba(235,235,245,0.3)",
          fill: "rgba(120,120,128,0.36)",
          "fill-2": "rgba(120,120,128,0.32)",
          "fill-3": "rgba(118,118,128,0.24)",
          "fill-4": "rgba(118,118,128,0.18)",
        },
      },
      borderRadius: {
        "ios-module": "22px",
      },
    },
  },
  plugins: [],
}
