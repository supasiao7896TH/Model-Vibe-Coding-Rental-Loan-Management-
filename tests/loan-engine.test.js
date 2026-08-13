import { describe, it, expect } from 'vitest';
import { calcLoanCurrentBalance, calcLoanSchedule } from '../src/modules/loan-engine.js';

describe('calcLoanCurrentBalance', () => {
  it('คืนค่า null ถ้ายังกรอกข้อมูลสินเชื่อไม่ครบ', () => {
    expect(calcLoanCurrentBalance({ loanMonthlyPayment: 10000 })).toBeNull();
    expect(calcLoanCurrentBalance({ loanBalance: 500000, loanRate: 6, loanBalanceAsOf: '2026-01' })).toBeNull();
  });

  it('ลดต้นลดดอกถูกต้องหลังผ่านไป 3 เดือน', () => {
    const room = { loanMonthlyPayment: 10000, loanBalance: 500000, loanRate: 6, loanBalanceAsOf: '2026-01' };
    const today = new Date(2026, 3, 1); // เมษายน 2026 → ผ่านมาแล้ว 3 เดือน

    // เดือน 1: ดอกเบี้ย 500000*0.005=2500, ตัดต้น 7500, เหลือ 492500
    // เดือน 2: ดอกเบี้ย 2462.5, ตัดต้น 7537.5, เหลือ 484962.5
    // เดือน 3: ดอกเบี้ย 2424.8125, ตัดต้น 7575.1875, เหลือ 477387.3125 → ปัดเป็น 477387
    expect(calcLoanCurrentBalance(room, today)).toBe(477387);
  });

  it('ยอดคงเหลือไม่ติดลบ แม้ผ่านมาหลายเดือนเกินกว่าจะผ่อนหมด', () => {
    const room = { loanMonthlyPayment: 10000, loanBalance: 20000, loanRate: 0, loanBalanceAsOf: '2026-01' };
    const today = new Date(2026, 11, 1); // ผ่านไป 11 เดือน แต่หนี้หมดตั้งแต่เดือนที่ 2
    expect(calcLoanCurrentBalance(room, today)).toBe(0);
  });
});

describe('calcLoanSchedule', () => {
  it('เดินตารางผ่อนจนหมดหนี้ที่อัตราดอกเบี้ย 0% ได้ค่าที่แน่นอน', () => {
    const room = { loanMonthlyPayment: 1000, loanBalance: 3000, loanRate: 0, loanBalanceAsOf: '2026-01' };
    const today = new Date(2026, 0, 1); // เดือนเดียวกับที่บันทึกยอด → monthsElapsed = 0

    const { schedule, totalMonths, currentBalance } = calcLoanSchedule(room, 5, today);

    expect(currentBalance).toBe(3000);
    expect(totalMonths).toBe(3);
    expect(schedule).toHaveLength(3); // previewMonths=5 แต่หนี้หมดใน 3 เดือน เลยได้แค่ 3 แถว
    expect(schedule.map((row) => row.balance)).toEqual([2000, 1000, 0]);
    expect(schedule.every((row) => row.interest === 0)).toBe(true);
  });

  it('คืนตารางว่างเมื่อไม่มีข้อมูลสินเชื่อให้คำนวณ', () => {
    const result = calcLoanSchedule({ loanMonthlyPayment: 5000 }, 12);
    expect(result).toEqual({ schedule: [], totalMonths: 0, currentBalance: 0 });
  });
});
