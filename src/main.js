import './style.css';
import { AppConfig } from './modules/app-config.js';
import { StorageEngine } from './modules/storage-engine.js';
import { StateStore } from './modules/state-store.js';
import { DebugModule } from './modules/debug-module.js';
import { UIRenderer, currentMonthStr, formatCurrency } from './modules/ui-renderer.js';
import { upsertMonthlyPayment } from './modules/payment-actions.js';

function rerenderCurrentView() {
  const view = StateStore.get('currentView') ?? 'dashboard';
  UIRenderer.renderView(view, {
    rooms: StateStore.get('rooms') ?? [],
    transactions: StateStore.get('transactions') ?? [],
    month: StateStore.get('currentMonth') ?? currentMonthStr(),
    txFilter: StateStore.get('txFilter') ?? { query: '', type: 'all' },
  });
  UIRenderer.setActiveNav(view);
}

async function seedDefaultRoomsIfEmpty() {
  const existing = await StorageEngine.getAll(AppConfig.STORES.ROOMS);
  if (existing.length > 0) return existing;

  for (const seed of AppConfig.DEFAULT_ROOMS) {
    await StorageEngine.put(AppConfig.STORES.ROOMS, {
      ...seed,
      tenantName: '',
      tenantPhone: '',
      tenantLineId: '',
      rentAmount: 0,
      rentDueDay: 1,
      deposit: 0,
      commonFee: 0,
      contractStart: '',
      contractEnd: '',
      tenantNotes: '',
      loanMonthlyPayment: 0,
      loanDueDay: 1,
      loanBalance: 0,
      loanRate: 0,
      loanBalanceAsOf: '',
      tenantHistory: [],
    });
  }
  return StorageEngine.getAll(AppConfig.STORES.ROOMS);
}

async function deleteRoomCascade(id) {
  const [txs, docs] = await Promise.all([
    StorageEngine.getByIndex(AppConfig.STORES.TRANSACTIONS, 'roomId', id),
    StorageEngine.getByIndex(AppConfig.STORES.DOCUMENTS, 'roomId', id),
  ]);
  await StorageEngine.delete(AppConfig.STORES.ROOMS, id);
  for (const tx of txs) await StorageEngine.delete(AppConfig.STORES.TRANSACTIONS, tx.id);
  for (const doc of docs) await StorageEngine.delete(AppConfig.STORES.DOCUMENTS, doc.id);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const currentMonth = StateStore.get('currentMonth') ?? currentMonthStr();

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

    case 'add-room':
      UIRenderer.openRoomForm({});
      break;

    case 'edit-room': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) UIRenderer.openRoomForm(room);
      break;
    }

    case 'delete-room': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) {
        UIRenderer.openDeleteConfirm(
          `ลบห้อง ${room.roomNumber} ใช่ไหมคะ? ธุรกรรมและเอกสารทั้งหมดของห้องนี้จะถูกลบถาวรด้วย`,
          'confirm-delete-room',
          room.id
        );
      }
      break;
    }

    case 'confirm-delete-room':
      try {
        await deleteRoomCascade(trigger.dataset.id);
        StateStore.set('rooms', rooms.filter((r) => r.id !== trigger.dataset.id));
        StateStore.set('transactions', transactions.filter((t) => t.roomId !== trigger.dataset.id));
        UIRenderer.closeModal();
        UIRenderer.showToast('ลบห้องและข้อมูลที่เกี่ยวข้องแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.confirm-delete-room', err);
        UIRenderer.showToast('ลบไม่สำเร็จ', 'error');
      }
      break;

    case 'open-quick-pay-loan': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) {
        UIRenderer.openConfirm(
          `บันทึกจ่ายค่างวด ${formatCurrency(room.loanMonthlyPayment)} สำหรับห้อง ${room.roomNumber} ใช่ไหมคะ?`,
          'confirm-quick-pay-loan',
          room.id,
          { label: 'ยืนยันจ่ายแล้ว', toneClass: 'text-purple-600' }
        );
      }
      break;
    }

    case 'confirm-quick-pay-loan': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (!room) break;
      try {
        const { record, transactions: nextTransactions } = upsertMonthlyPayment(transactions, {
          roomId: room.id,
          type: AppConfig.TRANSACTION_TYPE.LOAN,
          month: currentMonth,
          amount: room.loanMonthlyPayment,
        });
        await StorageEngine.put(AppConfig.STORES.TRANSACTIONS, record);
        StateStore.set('transactions', nextTransactions);
        UIRenderer.closeModal();
        UIRenderer.showToast('บันทึกจ่ายค่างวดแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.confirm-quick-pay-loan', err);
        UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
      }
      break;
    }

    case 'open-quick-pay-rent': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) {
        UIRenderer.openConfirm(
          `บันทึกรับค่าเช่า ${formatCurrency(room.rentAmount)} สำหรับห้อง ${room.roomNumber} ใช่ไหมคะ?`,
          'confirm-quick-pay-rent',
          room.id,
          { label: 'ยืนยันรับแล้ว', toneClass: 'text-blue-600' }
        );
      }
      break;
    }

    case 'confirm-quick-pay-rent': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (!room) break;
      try {
        const { record, transactions: nextTransactions } = upsertMonthlyPayment(transactions, {
          roomId: room.id,
          type: AppConfig.TRANSACTION_TYPE.RENT,
          month: currentMonth,
          amount: room.rentAmount,
        });
        await StorageEngine.put(AppConfig.STORES.TRANSACTIONS, record);
        StateStore.set('transactions', nextTransactions);
        UIRenderer.closeModal();
        UIRenderer.showToast('บันทึกรับค่าเช่าแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.confirm-quick-pay-rent', err);
        UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
      }
      break;
    }

    case 'open-tenant-history': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) UIRenderer.openTenantHistory(room);
      break;
    }

    case 'open-moveout': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) UIRenderer.openMoveOutForm(room);
      break;
    }

    case 'open-loan-schedule': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (room) UIRenderer.openLoanSchedule(room, 12);
      break;
    }

    case 'refresh-loan-schedule': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      const input = document.querySelector('[data-role="loan-schedule-months"]');
      const months = Math.min(Math.max(parseInt(input?.value, 10) || 12, 1), 360);
      if (room) UIRenderer.openLoanSchedule(room, months);
      break;
    }

    case 'open-doc-vault': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (!room) break;
      try {
        const docs = await StorageEngine.getByIndex(AppConfig.STORES.DOCUMENTS, 'roomId', room.id);
        UIRenderer.openDocumentVault(room, docs);
      } catch (err) {
        DebugModule.log('error', 'main.open-doc-vault', err);
        UIRenderer.showToast('โหลดเอกสารไม่สำเร็จ', 'error');
      }
      break;
    }

    case 'delete-document': {
      const roomId = trigger.dataset.roomId;
      const room = rooms.find((r) => r.id === roomId);
      try {
        await StorageEngine.delete(AppConfig.STORES.DOCUMENTS, trigger.dataset.id);
        const docs = await StorageEngine.getByIndex(AppConfig.STORES.DOCUMENTS, 'roomId', roomId);
        if (room) UIRenderer.openDocumentVault(room, docs);
        UIRenderer.showToast('ลบเอกสารแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.delete-document', err);
        UIRenderer.showToast('ลบเอกสารไม่สำเร็จ', 'error');
      }
      break;
    }

    case 'print-invoice': {
      const room = rooms.find((r) => r.id === trigger.dataset.id);
      if (!room) break;
      if (!room.tenantName) {
        UIRenderer.showToast('ห้องว่าง ไม่สามารถออกใบแจ้งหนี้ได้', 'error');
        break;
      }
      const monthTx = transactions.filter((t) => t.roomId === room.id && t.month === currentMonth);
      UIRenderer.printInvoice(room, monthTx, currentMonth);
      break;
    }

    case 'open-tax-report':
      UIRenderer.openTaxReport(rooms, transactions, String(new Date().getFullYear()));
      break;

    case 'print-tax-report':
      UIRenderer.printTaxReport(rooms, transactions, Number(trigger.dataset.year));
      break;

    case 'export-db':
      try {
        const documents = await StorageEngine.getAll(AppConfig.STORES.DOCUMENTS);
        downloadJson({ rooms, transactions, documents }, `condo-backup-${currentMonthStr()}.json`);
        UIRenderer.showToast('ดาวน์โหลดไฟล์สำรองข้อมูลแล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('error', 'main.export-db', err);
        UIRenderer.showToast('Export ไม่สำเร็จ', 'error');
      }
      break;

    case 'trigger-import-db':
      document.querySelector('[data-role="import-db-input"]')?.click();
      break;

    case 'open-reset-confirm':
      UIRenderer.openDeleteConfirm(
        'คำเตือน! ข้อมูลห้อง ธุรกรรม และเอกสารทั้งหมดจะถูกลบถาวร ไม่สามารถกู้คืนได้ ยืนยันการรีเซ็ต?',
        'confirm-reset-data'
      );
      break;

    case 'confirm-reset-data':
      try {
        await Promise.all([
          StorageEngine.clear(AppConfig.STORES.ROOMS),
          StorageEngine.clear(AppConfig.STORES.TRANSACTIONS),
          StorageEngine.clear(AppConfig.STORES.DOCUMENTS),
        ]);
        location.reload();
      } catch (err) {
        DebugModule.log('error', 'main.confirm-reset-data', err);
        UIRenderer.showToast('รีเซ็ตข้อมูลไม่สำเร็จ', 'error');
      }
      break;

    case 'copy-share-link':
      try {
        await navigator.clipboard.writeText(window.location.origin);
        UIRenderer.showToast('คัดลอกลิงก์แล้วค่ะ', 'success');
      } catch (err) {
        DebugModule.log('warn', 'main.copy-share-link', err);
        UIRenderer.showToast('คัดลอกไม่สำเร็จ', 'error');
      }
      break;

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

// change event แยกจาก input: ใช้กับ <select> ในฟอร์ม modal ที่ต้องสลับเนื้อหาบางส่วนทันทีที่เลือก
document.addEventListener('change', async (e) => {
  const role = e.target.dataset.role;

  if (role === 'tx-form-type') {
    const wrap = document.querySelector('[data-role="tx-form-category-wrap"]');
    if (wrap) wrap.style.display = e.target.value === 'expense' ? '' : 'none';
    return;
  }

  if (role === 'tax-year-select') {
    const rooms = StateStore.get('rooms') ?? [];
    const transactions = StateStore.get('transactions') ?? [];
    UIRenderer.openTaxReport(rooms, transactions, e.target.value);
    return;
  }

  if (role === 'doc-upload-input') {
    const roomId = e.target.dataset.id;
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const oversized = files.filter((f) => f.size > AppConfig.DOC_MAX_SIZE_BYTES);
    if (oversized.length > 0) {
      UIRenderer.showToast(`ไฟล์ ${oversized.map((f) => f.name).join(', ')} มีขนาดเกิน 5MB`, 'error');
      return;
    }

    try {
      for (const file of files) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        await StorageEngine.put(AppConfig.STORES.DOCUMENTS, {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          roomId,
          name: file.name,
          type: file.type,
          data: dataUrl,
        });
      }
      const rooms = StateStore.get('rooms') ?? [];
      const room = rooms.find((r) => r.id === roomId);
      const docs = await StorageEngine.getByIndex(AppConfig.STORES.DOCUMENTS, 'roomId', roomId);
      if (room) UIRenderer.openDocumentVault(room, docs);
      UIRenderer.showToast(`อัปโหลด ${files.length} ไฟล์สำเร็จ`, 'success');
    } catch (err) {
      DebugModule.log('error', 'main.doc-upload', err);
      UIRenderer.showToast('อัปโหลดไม่สำเร็จ', 'error');
    }
    return;
  }

  if (role === 'import-db-input') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.rooms)) {
        UIRenderer.showToast('รูปแบบไฟล์ไม่ถูกต้อง', 'error');
        return;
      }
      await Promise.all([
        StorageEngine.clear(AppConfig.STORES.ROOMS),
        StorageEngine.clear(AppConfig.STORES.TRANSACTIONS),
        StorageEngine.clear(AppConfig.STORES.DOCUMENTS),
      ]);
      for (const room of parsed.rooms) await StorageEngine.put(AppConfig.STORES.ROOMS, room);
      for (const tx of parsed.transactions ?? []) await StorageEngine.put(AppConfig.STORES.TRANSACTIONS, tx);
      for (const doc of parsed.documents ?? []) await StorageEngine.put(AppConfig.STORES.DOCUMENTS, doc);
      UIRenderer.showToast('กู้คืนข้อมูลสำเร็จ กำลังโหลดใหม่...', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      DebugModule.log('error', 'main.import-db', err);
      UIRenderer.showToast('ไฟล์ไม่ถูกต้อง หรือไม่ใช่ไฟล์ JSON', 'error');
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
    const roomNumber = form.roomNumber.value.trim();

    if (rooms.some((r) => r.roomNumber === roomNumber && r.id !== id)) {
      UIRenderer.showToast('มีเลขห้องนี้ในระบบแล้วค่ะ', 'error');
      return;
    }

    const updated = {
      ...existing,
      id: id || `room-${Date.now()}`,
      roomNumber,
      tenantName: form.tenantName.value.trim(),
      tenantPhone: form.tenantPhone.value.trim(),
      tenantLineId: form.tenantLineId.value.trim(),
      rentAmount: Number(form.rentAmount.value) || 0,
      rentDueDay: Number(form.rentDueDay.value) || 1,
      deposit: Number(form.deposit.value) || 0,
      commonFee: Number(form.commonFee.value) || 0,
      contractStart: form.contractStart.value,
      contractEnd: form.contractEnd.value,
      tenantNotes: form.tenantNotes.value.trim(),
      loanMonthlyPayment: Number(form.loanMonthlyPayment.value) || 0,
      loanDueDay: Number(form.loanDueDay.value) || 1,
      loanBalance: Number(form.loanBalance.value) || 0,
      loanRate: Number(form.loanRate.value) || 0,
      loanBalanceAsOf: form.loanBalanceAsOf.value,
      tenantHistory: existing?.tenantHistory ?? [],
    };

    try {
      await StorageEngine.put(AppConfig.STORES.ROOMS, updated);
      const nextRooms = existing ? rooms.map((r) => (r.id === id ? updated : r)) : [...rooms, updated];
      StateStore.set('rooms', nextRooms);
      UIRenderer.closeModal();
      UIRenderer.showToast(existing ? 'บันทึกข้อมูลห้องแล้วค่ะ' : 'เพิ่มห้องใหม่แล้วค่ะ', 'success');
    } catch (err) {
      DebugModule.log('error', 'main.roomForm submit', err);
      UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
    }
    return;
  }

  if (e.target.id === 'moveOutForm') {
    const form = e.target;
    const id = form.dataset.id;
    const rooms = StateStore.get('rooms') ?? [];
    const room = rooms.find((r) => r.id === id);
    if (!room) return;

    const moveOutDate = form.moveOutDate.value;
    const depositStatus = form.depositStatus.value;

    const updated = {
      ...room,
      tenantHistory: [
        ...(room.tenantHistory ?? []),
        {
          name: room.tenantName,
          phone: room.tenantPhone,
          contractStart: room.contractStart,
          moveOutDate,
          deposit: room.deposit,
          depositStatus,
          archivedAt: new Date().toISOString(),
        },
      ],
      tenantName: '',
      tenantPhone: '',
      tenantLineId: '',
      deposit: 0,
      commonFee: 0,
      contractStart: '',
      contractEnd: '',
      tenantNotes: '',
    };

    try {
      await StorageEngine.put(AppConfig.STORES.ROOMS, updated);
      StateStore.set('rooms', rooms.map((r) => (r.id === id ? updated : r)));
      UIRenderer.closeModal();
      UIRenderer.showToast('บันทึกย้ายออกแล้วค่ะ — ห้องว่างแล้ว', 'success');
    } catch (err) {
      DebugModule.log('error', 'main.moveOutForm submit', err);
      UIRenderer.showToast('บันทึกไม่สำเร็จ', 'error');
    }
    return;
  }

  if (e.target.id === 'transactionForm') {
    const form = e.target;
    const id = form.dataset.id || `tx-${Date.now()}`;
    const transactions = StateStore.get('transactions') ?? [];
    const type = form.type.value;

    const record = {
      id,
      roomId: form.roomId.value,
      type,
      month: form.month.value,
      amount: Number(form.amount.value) || 0,
      status: form.status.value,
      note: form.note.value.trim(),
      category: type === 'expense' ? (form.category?.value ?? '') : '',
    };

    try {
      await StorageEngine.put(AppConfig.STORES.TRANSACTIONS, record);
      const exists = transactions.some((t) => t.id === id);
      const nextList = exists
        ? transactions.map((t) => (t.id === id ? record : t))
        : [...transactions, record];
      StateStore.set('transactions', nextList);
      StateStore.set('currentView', 'transactions'); // พาไปหน้ารายการทันที จะได้เห็น/ลบได้ถ้าบันทึกผิด
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
