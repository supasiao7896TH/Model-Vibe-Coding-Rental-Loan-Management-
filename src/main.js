import './style.css';
import { AppConfig } from './modules/app-config.js';
import { StorageEngine } from './modules/storage-engine.js';
import { StateStore } from './modules/state-store.js';
import { DebugModule } from './modules/debug-module.js';
import { UIRenderer, currentMonthStr } from './modules/ui-renderer.js';

function rerenderCurrentView() {
  UIRenderer.renderView(StateStore.get('currentView') ?? 'dashboard', {
    rooms: StateStore.get('rooms') ?? [],
    transactions: StateStore.get('transactions') ?? [],
    month: StateStore.get('currentMonth') ?? currentMonthStr(),
    txFilter: StateStore.get('txFilter') ?? { query: '', type: 'all' },
  });
}

async function seedDefaultRoomsIfEmpty() {
  const existing = await StorageEngine.getAll(AppConfig.STORES.ROOMS);
  if (existing.length > 0) return existing;

  for (const seed of AppConfig.DEFAULT_ROOMS) {
    await StorageEngine.put(AppConfig.STORES.ROOMS, {
      ...seed,
      tenantName: '',
      rentAmount: 0,
      rentDueDay: 1,
      loanPrincipal: 0,
      loanMonthlyPayment: 0,
      loanDueDay: 1,
    });
  }
  return StorageEngine.getAll(AppConfig.STORES.ROOMS);
}

async function init() {
  try {
    const theme = localStorage.getItem(AppConfig.THEME_STORAGE_KEY) || 'light';
    StateStore.set('theme', theme);
    UIRenderer.applyTheme(theme);
    StateStore.set('currentMonth', currentMonthStr());
    StateStore.set('currentView', 'dashboard');
    StateStore.set('txFilter', { query: '', type: 'all' });

    const rooms = await seedDefaultRoomsIfEmpty();
    const transactions = await StorageEngine.getAll(AppConfig.STORES.TRANSACTIONS);

    StateStore.set('rooms', rooms);
    StateStore.set('transactions', transactions);

    // ต่อจากนี้ ทุกครั้งที่ rooms/transactions/currentView เปลี่ยน ให้ render หน้าปัจจุบันใหม่อัตโนมัติ
    StateStore.on('rooms', rerenderCurrentView);
    StateStore.on('transactions', rerenderCurrentView);
    StateStore.on('currentView', rerenderCurrentView);
    StateStore.on('txFilter', rerenderCurrentView);

    rerenderCurrentView();
  } catch (err) {
    DebugModule.log('error', 'APP_CORE.init', err);
    UIRenderer.showToast('เปิดแอปไม่สำเร็จ ลองรีเฟรชหน้าใหม่ค่ะ', 'error');
  }
}

async function handleAction(action, trigger) {
  const rooms = StateStore.get('rooms') ?? [];
  const transactions = StateStore.get('transactions') ?? [];

  switch (action) {
    case 'switch-view':
      StateStore.set('currentView', trigger.dataset.view);
      break;

    case 'toggle-theme': {
      const next = StateStore.get('theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem(AppConfig.THEME_STORAGE_KEY, next);
      StateStore.set('theme', next);
      UIRenderer.applyTheme(next);
      break;
    }

    case 'close-modal':
      UIRenderer.closeModal();
      break;

    case 'edit-room': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) UIRenderer.openRoomForm(room);
      break;
    }

    case 'open-add-transaction':
      UIRenderer.openTransactionForm(rooms, null);
      break;

    case 'edit-transaction': {
      const tx = transactions.find((t) => t.id === trigger.dataset.id);
      if (tx) UIRenderer.openTransactionForm(rooms, tx);
      break;
    }

    case 'delete-transaction':
      UIRenderer.openDeleteConfirm('ลบธุรกรรมนี้ใช่ไหมคะ?', 'confirm-delete-transaction', trigger.dataset.id);
      break;

    case 'confirm-delete-transaction':
      try {
        await StorageEngine.delete(AppConfig.STORES.TRANSACTIONS, trigger.dataset.id);
        StateStore.set('transactions', transactions.filter((t) => t.id !== trigger.dataset.id));
        UIRenderer.closeModal();
        UIRenderer.showToast('ลบธุรกรรมแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.confirm-delete-transaction', err);
        UIRenderer.showToast('ลบไม่สำเร็จ', 'error');
      }
      break;
  }
}

// Event Delegation: ฟังทุก click จากจุดเดียว (document) แทนที่จะผูก listener ทีละปุ่ม
// ข้อดี: ปุ่มที่ UI_RENDERER สร้างขึ้นใหม่ทีหลัง (เช่น ในฟอร์มที่เพิ่งเปิด modal) ก็ยังทำงานได้ทันที
// โดยไม่ต้องมาผูก listener ซ้ำทุกครั้งที่ innerHTML เปลี่ยน
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-action]');
  if (!trigger) return;

  const action = trigger.dataset.action;

  // เคสพิเศษ: "close-modal" ต้องคลิกโดนฉากหลังตรงๆ เท่านั้น (trigger === e.target)
  // ถ้าไม่เช็คแบบนี้ การคลิกอะไรก็ตามข้างในฟอร์ม (ที่ไม่มี data-action ของตัวเอง)
  // จะ bubble ขึ้นไปโดน data-action="close-modal" ของฉากหลังเสมอ เพราะ closest() ไล่หาขึ้นไปเรื่อยๆ
  if (action === 'close-modal' && trigger !== e.target) return;

  handleAction(action, trigger);
});

// ช่องค้นหาธุรกรรม: ยิง event 'input' ทุกครั้งที่พิมพ์ ต้องคนละ listener จาก 'click'/'submit' ข้างบน
// จุดที่ต้องระวัง: StateStore.set() ด้านล่างทำให้ rerenderCurrentView() ยิง innerHTML ใหม่ทั้งก้อน
// ซึ่งลบ <input> ตัวเดิมทิ้งแล้วสร้างใหม่ — โฟกัส/ตำแหน่ง cursor ที่พี่ A กำลังพิมพ์อยู่จะหายไปทันที
// ถ้าไม่คืนโฟกัสเอง พี่ A จะพิมพ์ได้แค่ตัวอักษรเดียวแล้วต้องกดช่องค้นหาใหม่ทุกครั้ง
document.addEventListener('input', (e) => {
  const role = e.target.dataset.role;
  if (role !== 'tx-search' && role !== 'tx-type-filter') return;

  const filter = StateStore.get('txFilter') ?? { query: '', type: 'all' };
  const next = role === 'tx-search'
    ? { ...filter, query: e.target.value }
    : { ...filter, type: e.target.value };
  const cursorPos = e.target.selectionStart;

  StateStore.set('txFilter', next); // ทำให้เกิด re-render ทันที (synchronous)

  const newInput = document.querySelector(`[data-role="${role}"]`);
  if (newInput) {
    newInput.focus();
    if (typeof cursorPos === 'number' && newInput.setSelectionRange) {
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault(); // กัน browser ทำ default behavior (reload หน้าทั้งหน้า)

  if (e.target.id === 'roomForm') {
    const form = e.target;
    const id = form.dataset.id;
    const rooms = StateStore.get('rooms') ?? [];
    const existing = rooms.find((r) => r.id === id);

    // input ที่มี name="xxx" ใน <form> เรียกใช้ตรงๆ ผ่าน form.xxx.value ได้เลย
    // (ฟีเจอร์ built-in ของ HTML form element ไม่ต้อง querySelector ทีละช่อง)
    const updated = {
      ...existing,
      tenantName: form.tenantName.value.trim(),
      rentAmount: Number(form.rentAmount.value) || 0,
      rentDueDay: Number(form.rentDueDay.value) || 1,
      loanMonthlyPayment: Number(form.loanMonthlyPayment.value) || 0,
      loanDueDay: Number(form.loanDueDay.value) || 1,
    };

    try {
      await StorageEngine.put(AppConfig.STORES.ROOMS, updated);
      StateStore.set('rooms', rooms.map((r) => (r.id === id ? updated : r)));
      UIRenderer.closeModal();
      UIRenderer.showToast('บันทึกข้อมูลห้องแล้วค่ะ', 'success');
    } catch (err) {
      DebugModule.log('error', 'main.roomForm submit', err);
      UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
    }
    return;
  }

  if (e.target.id === 'transactionForm') {
    const form = e.target;
    const id = form.dataset.id || `tx-${Date.now()}`;
    const transactions = StateStore.get('transactions') ?? [];

    const record = {
      id,
      roomId: form.roomId.value,
      type: form.type.value,
      month: form.month.value,
      amount: Number(form.amount.value) || 0,
      status: form.status.value,
      note: form.note.value.trim(),
    };

    try {
      await StorageEngine.put(AppConfig.STORES.TRANSACTIONS, record);
      const exists = transactions.some((t) => t.id === id);
      const nextList = exists
        ? transactions.map((t) => (t.id === id ? record : t))
        : [...transactions, record];
      StateStore.set('transactions', nextList);
      UIRenderer.closeModal();
      UIRenderer.showToast('บันทึกธุรกรรมแล้วค่ะ', 'success');
    } catch (err) {
      DebugModule.log('error', 'main.transactionForm submit', err);
      UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
    }
  }
});

// PWA: ลงทะเบียน service worker ให้แอปใช้งาน offline ได้และติดตั้งบนมือถือได้
// เช็ค 'serviceWorker' in navigator ก่อนเสมอ — เบราว์เซอร์เก่าบางตัวไม่รองรับ
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      DebugModule.log('warn', 'main.serviceWorker.register', err);
    });
  });
}

// type="module" script รันหลัง HTML parse เสร็จเสมอ (เหมือน defer โดยอัตโนมัติ)
// จึงเรียก init() ตรงๆ ได้เลย ไม่ต้องรอ DOMContentLoaded แบบ script ธรรมดาสมัยก่อน
init();
