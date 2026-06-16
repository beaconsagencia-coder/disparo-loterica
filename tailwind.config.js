/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta neutra com acento estratégico (estilo Apple)
        ink: {
          DEFAULT: "#1d1d1f",
          soft: "#424245",
          muted: "#86868b",
        },
        canvas: "#f5f5f7",
        accent: {
          DEFAULT: "#0a84ff",
          hover: "#0070e0",
        },
        success: "#34c759",
        warning: "#ff9f0a",
        danger: "#ff453a",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.08)",
        bento: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Inter",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
