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

        // Brand direct color tokens. Heritage palette per CLAUDE.md:
        // Drafting Cream + Foreman Black + Steel Blue + Safety Vest
        // Orange. Existing tokens keep their names so every existing
        // component re-skins automatically; the values now point at
        // the heritage palette instead of the older blue-navy spec.
        tbb: {
          navy: "#2E4057",            // Steel Blue (structural)
          "navy-700": "#25364A",
          "navy-900": "#1A2733",
          cream: "#F5F1E8",           // Drafting Cream
          "cream-200": "#FAF7EE",
          "cream-50": "#FCFAF5",
          blue: "#E87722",            // Safety Vest Orange (CTAs)
          "blue-600": "#D86614",
          "blue-700": "#B85510",
          "blue-100": "#FDEBD8",
          "blue-light": "#F4A56E",
          "blue-light-200": "#FAD0AC",
          steel: "#2E4057",           // explicit Steel Blue alias
          orange: "#E87722",          // explicit Safety Vest Orange alias
          ink: "#1A1A1A",             // Foreman Black
          "ink-2": "#333333",
          "ink-3": "#666666",
          "ink-4": "#999999",
          line: "#CCCCCC",
          "line-soft": "#E5E5E5",
          "bg-soft": "#EADFC7",       // page canvas — deeper cream
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
        // Per the TBB brand spec ("one typeface only — Arial"), the
        // `font-mono` alias intentionally points at the same Arial stack.
        // This keeps every existing eyebrow / timestamp / label visually
        // consistent across the app even where authors reached for
        // `font-mono` historically. True monospace (for inline <code>
        // technical strings) still renders via the browser default on
        // the <code>/<kbd>/<samp>/<pre> elements, not this alias.
        mono: [
          "Arial",
          '"Helvetica Neue"',
          "Helvetica",
          "system-ui",
          "sans-serif",
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
        // Heritage shadows: structural ones tinted Steel Blue, CTA
        // shadow tinted Safety Vest Orange so primary buttons glow.
        "tbb-xs": "0 1px 2px rgba(46, 64, 87, 0.06)",
        "tbb-sm": "0 2px 6px rgba(46, 64, 87, 0.10)",
        "tbb-md": "0 8px 20px rgba(46, 64, 87, 0.14)",
        "tbb-lg": "0 18px 40px rgba(46, 64, 87, 0.18)",
        "tbb-cta": "0 8px 24px rgba(232, 119, 34, 0.40)",
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
