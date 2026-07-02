import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF6EF",
        "cream-dark": "#F1EADF",
        ink: "#1C1917",
        "ink-soft": "#57534E",
        coral: "#E8604C",
        "coral-dark": "#D14A36",
        sage: "#8A9A7B",
      },
    },
  },
  plugins: [],
};
export default config;
