// ค่าคงที่ของทั้งแอป — แก้ตรงนี้ที่เดียว มีผลทั้งโปรเจกต์
export const AppConfig = {
  DB_NAME: 'condoRentalDB',
  DB_VERSION: 1,

  STORES: {
    ROOMS: 'rooms',
    TRANSACTIONS: 'transactions',
  },

  TRANSACTION_TYPE: {
    RENT: 'rent',
    LOAN: 'loan',
    EXPENSE: 'expense',
  },

  TRANSACTION_STATUS: {
    PAID: 'paid',
    UNPAID: 'unpaid',
  },

  THEME_STORAGE_KEY: 'condo-theme',

  // เตือนล่วงหน้ากี่วันก่อนถึงวันครบกำหนด
  DUE_SOON_DAYS: 3,

  // ห้องเริ่มต้น 4 ห้อง (สร้างให้อัตโนมัติตอนเปิดแอปครั้งแรก ถ้ายังไม่มีข้อมูล)
  DEFAULT_ROOMS: [
    { id: 'room-1', roomNumber: '101' },
    { id: 'room-2', roomNumber: '102' },
    { id: 'room-3', roomNumber: '201' },
    { id: 'room-4', roomNumber: '202' },
  ],
};
