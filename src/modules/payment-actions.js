// บันทึกจ่าย/รับเงินแบบกดปุ่มเดียว (quick-pay ผ่อนธนาคาร / quick-collect ค่าเช่า)
// pure function ล้วนๆ — ไม่แตะ StorageEngine/StateStore เอง เพื่อให้เทสได้โดยไม่ต้องมี IndexedDB จริง

// ถ้าห้องนี้มีธุรกรรมประเภทนี้ของเดือนนี้อยู่แล้ว (เช่น เคยบันทึกไว้แบบ "ยังไม่จ่าย") ให้แก้ตัวเดิมเป็น "จ่ายแล้ว"
// แทนที่จะสร้างซ้ำ — กันไม่ให้กดปุ่มซ้ำแล้วมีธุรกรรมซ้อนกันหลายรายการในเดือนเดียว
export function upsertMonthlyPayment(transactions, { roomId, type, month, amount }) {
  const existingIndex = transactions.findIndex(
    (t) => t.roomId === roomId && t.type === type && t.month === month
  );
  const base = existingIndex >= 0
    ? transactions[existingIndex]
    : { id: `tx-${Date.now()}`, roomId, type, month, note: '', category: '' };

  const record = { ...base, amount, status: 'paid' };
  const nextTransactions = existingIndex >= 0
    ? transactions.map((t, i) => (i === existingIndex ? record : t))
    : [...transactions, record];

  return { record, transactions: nextTransactions };
}
