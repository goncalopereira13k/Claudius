/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: "#faf8f3",
        ink:       "#14110c",
        stone:     "#d4c9a8",
        ash:       "#7a6f5a",
        gold:      "#c9a84c",
        bronze:    "#8b6914",
        tablet:    "#f0ead9",
      },
      fontFamily: {
        cinzel: ["Cinzel", "'Trajan Pro'", "serif"],
      },
    },
  },
  plugins: [],
};
