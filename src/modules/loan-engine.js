// คำนวณสินเชื่อแบบลดต้นลดดอก (amortization) — pure functions ล้วนๆ เทสได้โดยไม่ต้องเปิดเบราว์เซอร์
// สูตร: ดอกเบี้ยรายเดือน = ยอดคงเหลือ x (อัตราดอกเบี้ยต่อปี / 12) แล้วเงินงวดที่เหลือหลังหักดอกเบี้ยคือส่วนตัดต้น

// ห้องต้องกรอกครบ 4 ช่องนี้ถึงจะคำนวณยอดคงเหลือปัจจุบันได้: ยอดตั้งต้น, อัตราดอกเบี้ย, เดือนที่บันทึกยอดนั้น, ค่างวดรายเดือน
// เช็คแบบนี้ (ไม่ใช่ truthy เฉยๆ) เพราะ loanRate=0 (สินเชื่อดอกเบี้ย 0%) เป็นค่าที่ถูกต้อง ไม่ใช่ "ยังไม่กรอก"
function hasLoanTrackingData(room) {
  return Boolean(
    room.loanBalance > 0 &&
    room.loanRate !== undefined && room.loanRate !== null && room.loanRate !== '' &&
    room.loanBalanceAsOf &&
    room.loanMonthlyPayment > 0
  );
}

// ยอดคงเหลือ ณ ปัจจุบัน — เดินสูตรลดต้นลดดอกทีละเดือนจาก "ยอดคงเหลือ ณ เดือนที่บันทึกไว้" มาจนถึงเดือนปัจจุบัน
export function calcLoanCurrentBalance(room, today = new Date()) {
  if (!hasLoanTrackingData(room)) return null;

  const monthlyRate = room.loanRate / 100 / 12;
  let remaining = room.loanBalance;
  const [asOfYear, asOfMonth] = room.loanBalanceAsOf.split('-').map(Number);
  const monthsElapsed = (today.getFullYear() - asOfYear) * 12 + ((today.getMonth() + 1) - asOfMonth);

  for (let i = 0; i < monthsElapsed && remaining > 0.5; i++) {
    const interest = remaining * monthlyRate;
    const principal = room.loanMonthlyPayment - interest;
    if (principal <= 0) break; // ค่างวดไม่พอจ่ายดอกเบี้ย เงินต้นไม่มีวันลดลง — หยุดกันลูปไม่รู้จบ
    remaining = Math.max(remaining - principal, 0);
  }
  return Math.round(remaining);
}

// ตารางผ่อนชำระ N เดือนข้างหน้า นับจากเดือนปัจจุบัน + จำนวนเดือนทั้งหมดที่เหลือกว่าจะหมดหนี้ (สูงสุด 600 เดือน กันลูปไม่รู้จบ)
export function calcLoanSchedule(room, previewMonths, today = new Date()) {
  const currentBalance = calcLoanCurrentBalance(room, today);
  if (currentBalance === null) return { schedule: [], totalMonths: 0, currentBalance: 0 };

  const monthlyRate = room.loanRate / 100 / 12;

  let totalMonths = 0;
  let tempRemaining = currentBalance;
  while (tempRemaining > 0.5 && totalMonths < 600) {
    const interest = tempRemaining * monthlyRate;
    const principal = room.loanMonthlyPayment - interest;
    if (principal <= 0) break;
    tempRemaining = Math.max(tempRemaining - principal, 0);
    totalMonths++;
  }

  const schedule = [];
  let remaining = currentBalance;
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  for (let i = 0; i < previewMonths && remaining > 0.5; i++) {
    const interest = remaining * monthlyRate;
    const principal = Math.min(room.loanMonthlyPayment - interest, remaining);
    if (principal <= 0) break;
    remaining = Math.max(remaining - principal, 0);
    schedule.push({
      month: `${year}-${String(month).padStart(2, '0')}`,
      interest: Math.round(interest),
      principal: Math.round(principal),
      balance: Math.round(remaining),
    });
    month++;
    if (month > 12) { month = 1; year++; }
  }

  return { schedule, totalMonths, currentBalance };
}
