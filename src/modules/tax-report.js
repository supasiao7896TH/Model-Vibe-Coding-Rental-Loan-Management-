import { AppConfig } from './app-config.js';

// รายงานสรุปรายได้ประจำปี สำหรับยื่นภาษี ภ.ง.ด. 90 (เงินได้ประเภท 5 — ค่าเช่าทรัพย์สิน)
// นับเฉพาะธุรกรรมที่ "จ่ายแล้ว" (status === paid) เพราะรายการที่ยังไม่จ่ายไม่ใช่เงินที่รับ/จ่ายจริง
// รายรับ = ค่าเช่า (rent), รายจ่าย = ผ่อนธนาคาร + ค่าใช้จ่ายอื่นๆ (loan + expense)
export function buildTaxReport(rooms, transactions, year) {
  const yearTx = transactions.filter(
    (t) => t.month?.startsWith(year) && t.status === AppConfig.TRANSACTION_STATUS.PAID
  );

  let totalIncome = 0;
  let totalExpense = 0;

  const rows = rooms.map((room) => {
    const roomTx = yearTx.filter((t) => t.roomId === room.id);
    const income = roomTx
      .filter((t) => t.type === AppConfig.TRANSACTION_TYPE.RENT)
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = roomTx
      .filter((t) => t.type !== AppConfig.TRANSACTION_TYPE.RENT)
      .reduce((sum, t) => sum + t.amount, 0);

    totalIncome += income;
    totalExpense += expense;

    return {
      roomId: room.id,
      roomNumber: room.roomNumber,
      tenantName: room.tenantName || '',
      income,
      expense,
      net: income - expense,
    };
  });

  const deduction = Math.round(totalIncome * AppConfig.TAX_DEDUCTION_RATE);

  return {
    year,
    rows,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    deduction,
    netTaxable: totalIncome - deduction,
  };
}
