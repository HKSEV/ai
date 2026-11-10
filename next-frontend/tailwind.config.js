/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",       // App Router를 쓸 때
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",     // Pages Router를 쓸 때
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}", // 컴포넌트 폴더가 있을 때
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
