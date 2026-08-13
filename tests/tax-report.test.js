import { describe, it, expect } from 'vitest';
import { buildTaxReport } from '../src/modules/tax-report.js';

describe('buildTaxReport', () => {
  const rooms = [{ id: 'r1', roomNumber: '101', tenantName: 'สมชาย' }];

  const transactions = [
    { roomId: 'r1', type: 'rent', month: '2026-01', amount: 10000, status: 'paid' },
    { roomId: 'r1', type: 'loan', month: '2026-01', amount: 6000, status: 'paid' },
    { roomId: 'r1', type: 'expense', month: '2026-02', amount: 1000, status: 'paid' },
    { roomId: 'r1', type: 'rent', month: '2026-03', amount: 10000, status: 'unpaid' }, // ยังไม่จ่าย → ไม่นับ
    { roomId: 'r1', type: 'rent', month: '2025-12', amount: 9000, status: 'paid' }, // คนละปี → ไม่นับ
  ];

  it('นับเฉพาะธุรกรรมที่จ่ายแล้วของปีที่เลือก แยกรายรับ(ค่าเช่า)กับรายจ่าย(อื่นๆ)', () => {
    const report = buildTaxReport(rooms, transactions, '2026');

    expect(report.totalIncome).toBe(10000);
    expect(report.totalExpense).toBe(7000);
    expect(report.totalNet).toBe(3000);
    expect(report.rows).toEqual([
      { roomId: 'r1', roomNumber: '101', tenantName: 'สมชาย', income: 10000, expense: 7000, net: 3000 },
    ]);
  });

  it('หักค่าใช้จ่ายเหมา 30% จากรายได้รวม ไม่ใช่จากกำไรสุทธิ', () => {
    const report = buildTaxReport(rooms, transactions, '2026');

    expect(report.deduction).toBe(3000); // round(10000 * 0.30)
    expect(report.netTaxable).toBe(7000); // 10000 - 3000
  });

  it('ปีที่ไม่มีธุรกรรมเลยได้รายงานเป็นศูนย์ทั้งหมด ไม่พัง', () => {
    const report = buildTaxReport(rooms, transactions, '2099');

    expect(report.totalIncome).toBe(0);
    expect(report.deduction).toBe(0);
    expect(report.rows[0]).toMatchObject({ income: 0, expense: 0, net: 0 });
  });
});
