/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        surface: {
          DEFAULT: "#121216",
          muted: "#18181c",
          border: "#27272a",
          hover: "#222228",
        },
        primary: {
          DEFAULT: "#8b5cf6",
          hover: "#7c3aed",
        },
        text: {
          primary: "#f8fafc",
          secondary: "#a1a1aa",
          muted: "#71717a",
        },
        status: {
          green: "#22c55e",
          red: "#ef4444",
          amber: "#f59e0b",
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      }
    },
  },
  plugins: [],
}
