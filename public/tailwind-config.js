// ต้องโหลดหลัง cdn.tailwindcss.com แต่ก่อน body render — บอก Tailwind ว่า
// ให้สลับ dark mode ตาม class="dark" บน <html> ที่เราคุมเอง ไม่ใช่ตาม OS preference (ค่า default)
window.tailwind = window.tailwind || {};
tailwind.config = {
  darkMode: 'class',
};
