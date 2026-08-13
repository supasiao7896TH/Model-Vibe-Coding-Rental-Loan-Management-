import { describe, it, expect } from 'vitest';
import { calculateDueInfo } from '../src/modules/ui-renderer.js';

describe('calculateDueInfo', () => {
  it('ยังไม่ใกล้ครบกำหนด เมื่อเหลือมากกว่า dueSoonDays วัน', () => {
    const today = new Date(2026, 7, 1); // เดือนใน JS Date นับ 0-11 → 7 คือสิงหาคม
    const result = calculateDueInfo(20, today);

    expect(result.daysUntil).toBe(19);
    expect(result.isOverdue).toBe(false);
    expect(result.isDueSoon).toBe(false);
  });

  it('ใกล้ครบกำหนด เมื่อเหลือพอดี dueSoonDays วัน (ค่า default = 3)', () => {
    const today = new Date(2026, 7, 17); // dueDay=20 เหลืออีก 3 วันพอดี
    const result = calculateDueInfo(20, today);

    expect(result.daysUntil).toBe(3);
    expect(result.isDueSoon).toBe(true);
    expect(result.isOverdue).toBe(false);
  });

  it('เลยกำหนดแล้ว เมื่อวันนี้เลยวันครบกำหนดมา', () => {
    const today = new Date(2026, 7, 25); // dueDay=20 → เลยมา 5 วัน
    const result = calculateDueInfo(20, today);

    expect(result.daysUntil).toBe(-5);
    expect(result.isOverdue).toBe(true);
  });

  it('ตรงวันครบกำหนดพอดี นับเป็น "ใกล้ครบกำหนด" ไม่ใช่ "เลยกำหนด"', () => {
    const today = new Date(2026, 7, 20);
    const result = calculateDueInfo(20, today);

    expect(result.daysUntil).toBe(0);
    expect(result.isDueSoon).toBe(true);
    expect(result.isOverdue).toBe(false);
  });

  // เคสนี้คือเหตุผลที่แยกฟังก์ชันนี้ออกมาเทสต่างหาก — ถ้าไม่ clamp ค่า
  // dueDay=31 ในเดือนที่มีแค่ 28 วัน จะกลายเป็นเลขติดลบมั่วๆ (28 - 31 = -3 ก่อนถึงวันจริง)
  it('กัน dueDay=31 ในเดือนกุมภาพันธ์ปีปกติ (28 วัน) ไม่ให้คำนวณผิด', () => {
    const today = new Date(2026, 1, 25); // 25 ก.พ. 2026 (2026 ไม่ใช่ปีอธิกสุรทิน)
    const result = calculateDueInfo(31, today);

    // ต้อง clamp เหลือวันที่ 28 (วันสุดท้ายของเดือน) แทนวันที่ 31 ที่ไม่มีจริง
    expect(result.daysUntil).toBe(3);
    expect(result.isDueSoon).toBe(true);
  });
});
