// ต้องโหลดหลัง cdn.tailwindcss.com แต่ก่อน body render — บอก Tailwind ว่า
// ให้สลับ dark mode ตาม class="dark" บน <html> ที่เราคุมเอง ไม่ใช่ตาม OS preference (ค่า default)
// theme.extend.colors.brand ก็อปมาจาก Monitor-log-sheet-boardman (V29.85) ของพี่ A เอง
window.tailwind = window.tailwind || {};
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Thai', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          900: '#134e4a',
        },
      },
    },
  },
};
