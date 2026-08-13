// ค่าคงที่ของทั้งแอป — แก้ตรงนี้ที่เดียว มีผลทั้งโปรเจกต์
export const AppConfig = {
  DB_NAME: 'condoRentalDB',
  DB_VERSION: 2,

  STORES: {
    ROOMS: 'rooms',
    TRANSACTIONS: 'transactions',
    DOCUMENTS: 'documents',
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

  // หมวดหมู่ค่าใช้จ่าย ใช้ตอนบันทึกธุรกรรมประเภท expense และจัดกลุ่มในรายงานภาษี
  EXPENSE_CATEGORIES: [
    'ค่าส่วนกลาง',
    'ค่าไฟฟ้า (จ่ายหลวง)',
    'ค่าน้ำประปา',
    'ค่าอินเทอร์เน็ต',
    'ค่าซ่อมบำรุง',
    'คืนเงินมัดจำ',
    'อื่นๆ',
  ],

  DEPOSIT_STATUS: {
    RETURNED: 'returned',
    DEDUCTED: 'deducted',
    PENDING: 'pending',
  },

  // ไฟล์เอกสาร/รูปในคลังเอกสารต่อห้อง ห้ามเกินไฟล์ละ 5MB (เก็บเป็น base64 ใน IndexedDB)
  DOC_MAX_SIZE_BYTES: 5 * 1024 * 1024,

  // อัตราหักค่าใช้จ่ายเหมาสำหรับเงินได้ค่าเช่า (ภ.ง.ด. 90 เงินได้ประเภท 5) — หักได้ 30% ของรายรับ
  TAX_DEDUCTION_RATE: 0.3,

  THEME_STORAGE_KEY: 'condo-theme',

  // เตือนล่วงหน้ากี่วันก่อนถึงวันครบกำหนด
  DUE_SOON_DAYS: 3,

  // สัญญาเช่าใกล้หมดอายุ เตือนล่วงหน้ากี่วัน
  CONTRACT_DUE_SOON_DAYS: 45,

  // ห้องเริ่มต้น 4 ห้อง (สร้างให้อัตโนมัติตอนเปิดแอปครั้งแรก ถ้ายังไม่มีข้อมูล)
  DEFAULT_ROOMS: [
    { id: 'room-1', roomNumber: '101' },
    { id: 'room-2', roomNumber: '102' },
    { id: 'room-3', roomNumber: '201' },
    { id: 'room-4', roomNumber: '202' },
  ],
};
