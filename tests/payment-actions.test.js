import { describe, it, expect } from 'vitest';
import { upsertMonthlyPayment } from '../src/modules/payment-actions.js';

describe('upsertMonthlyPayment', () => {
  it('สร้างธุรกรรมใหม่แบบจ่ายแล้ว เมื่อยังไม่มีธุรกรรมประเภทนี้ของเดือนนี้', () => {
    const { record, transactions } = upsertMonthlyPayment([], {
      roomId: 'room-1',
      type: 'rent',
      month: '2026-08',
      amount: 8000,
    });

    expect(record).toMatchObject({ roomId: 'room-1', type: 'rent', month: '2026-08', amount: 8000, status: 'paid' });
    expect(record.id).toMatch(/^tx-/);
    expect(transactions).toEqual([record]);
  });

  it('แก้ธุรกรรมเดิม (เช่น ที่ยังไม่จ่าย) ของห้อง/ประเภท/เดือนเดียวกัน แทนที่จะสร้างซ้ำ', () => {
    const existing = [
      { id: 'tx-1', roomId: 'room-1', type: 'loan', month: '2026-08', amount: 5000, status: 'unpaid', note: '', category: '' },
      { id: 'tx-2', roomId: 'room-1', type: 'rent', month: '2026-08', amount: 8000, status: 'paid', note: '', category: '' },
    ];

    const { record, transactions } = upsertMonthlyPayment(existing, {
      roomId: 'room-1',
      type: 'loan',
      month: '2026-08',
      amount: 5000,
    });

    expect(record.id).toBe('tx-1'); // แก้ตัวเดิม ไม่สร้าง id ใหม่
    expect(record.status).toBe('paid');
    expect(transactions).toHaveLength(2); // ไม่เพิ่มจำนวนรายการ
    expect(transactions.find((t) => t.id === 'tx-1')).toMatchObject({ status: 'paid', amount: 5000 });
    expect(transactions.find((t) => t.id === 'tx-2')).toEqual(existing[1]); // รายการอื่นไม่ถูกแตะ
  });

  it('ไม่ปนกันข้ามห้อง แม้ประเภท/เดือนเดียวกัน', () => {
    const existing = [
      { id: 'tx-1', roomId: 'room-1', type: 'rent', month: '2026-08', amount: 8000, status: 'unpaid', note: '', category: '' },
    ];

    const { record, transactions } = upsertMonthlyPayment(existing, {
      roomId: 'room-2',
      type: 'rent',
      month: '2026-08',
      amount: 7500,
    });

    expect(record.roomId).toBe('room-2');
    expect(transactions).toHaveLength(2);
    expect(transactions.find((t) => t.id === 'tx-1').status).toBe('unpaid'); // ห้องเดิมไม่ถูกแตะ
  });
});
