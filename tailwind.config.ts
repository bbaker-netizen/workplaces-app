import type { Config } from "tailwindcss";

/**
 * The Business Builders by Workplaces — design tokens wired into Tailwind.
 * See app/globals.css for the canonical CSS variable definitions, and the
 * design skill at .../business-builders-design for the source-of-truth
 * brand spec.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // shadcn semantic tokens (driven by CSS vars in globals.css).
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // TBB direct color tokens. Reference these in components as
        // `bg-tbb-navy`, `text-tbb-blue`, etc.
        tbb: {
          navy: "#14385B",
          "navy-700": "#1B4A77",
          "navy-900": "#0C2740",
          cream: "#EFE6D7",
          "cream-200": "#F7F1E6",
          "cream-50": "#FBF8F2",
          blue: "#2C6CB0",
          "blue-600": "#2560A0",
          "blue-700": "#1E5189",
          "blue-100": "#E2ECF7",
          "blue-light": "#6FA8DC",
          "blue-light-200": "#C9DEF1",
          ink: "#14181D",
          "ink-2": "#2A323B",
          "ink-3": "#5A6470",
          "ink-4": "#8B95A1",
          line: "#D6DDE5",
          "line-soft": "#E8ECF1",
          "bg-soft": "#F4F6F9",
          success: "#2E8B57",
          warning: "#D89F2F",
          danger: "#C0392B",
        },
      },
      fontFamily: {
        // One typeface only — Arial. Display sizes use weight 900 for the
        // brand's "factory sign" energy; body uses weight 400/700.
        sans: [
          "Arial",
          '"Helvetica Neue"',
          "Helvetica",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Arial",
          '"Helvetica Neue"',
          "Helvetica",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
        script: ['"Pacifico"', '"Brush Script MT"', "cursive"],
      },
      fontSize: {
        // TBB scale — explicit pixel sizes mapped to Tailwind keys.
        "tbb-xs": ["0.75rem", { lineHeight: "1.25" }],
        "tbb-small": ["0.875rem", { lineHeight: "1.45" }],
        "tbb-body": ["1rem", { lineHeight: "1.45" }],
        "tbb-lead": ["1.125rem", { lineHeight: "1.6" }],
        "tbb-h4": ["1.25rem", { lineHeight: "1.25" }],
        "tbb-h3": ["1.625rem", { lineHeight: "1.25" }],
        "tbb-h2": ["2.25rem", { lineHeight: "1.1" }],
        "tbb-h1": ["3rem", { lineHeight: "1.1" }],
        "tbb-display": ["4.5rem", { lineHeight: "1.1" }],
      },
      letterSpacing: {
        "tbb-tight": "-0.02em",
        "tbb-caps": "0.08em",
        "tbb-wide": "0.04em",
      },
      borderRadius: {
        // TBB radii — pill is reserved for buttons/badges.
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
        pill: "9999px",
      },
      boxShadow: {
        // All TBB shadows are navy-tinted, soft, downward.
        "tbb-xs": "0 1px 2px rgba(20, 56, 91, 0.06)",
        "tbb-sm": "0 2px 6px rgba(20, 56, 91, 0.08)",
        "tbb-md": "0 8px 20px rgba(20, 56, 91, 0.10)",
        "tbb-lg": "0 18px 40px rgba(20, 56, 91, 0.14)",
        "tbb-cta": "0 6px 18px rgba(44, 108, 176, 0.30)",
      },
      transitionTimingFunction: {
        "tbb-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
        "tbb-out": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "tbb-fast": "120ms",
        "tbb-base": "180ms",
        "tbb-slow": "280ms",
      },
      maxWidth: {
        "tbb-container": "1200px",
        "tbb-narrow": "880px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
