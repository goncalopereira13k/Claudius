/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        parchment: "#eae4d3",
        ink:       "#221c11",
        stone:     "#cfc2a0",
        ash:       "#6e6350",
        gold:      "#c19a3d",
        bronze:    "#8a5f14",
        tablet:    "#faf7ee",
      },
      fontFamily: {
        cinzel: ["Cinzel", "'Trajan Pro'", "serif"],
      },
    },
  },
  plugins: [],
};
