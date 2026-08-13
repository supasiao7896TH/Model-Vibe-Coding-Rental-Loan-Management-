import { AppConfig } from './app-config.js';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ---------- Pure helper functions (ไม่แตะ DOM เลย เทสได้ง่าย) ----------

export function currentMonthStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthLabel(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

export function formatCurrency(amount) {
  return (amount ?? 0).toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });
}

// คำนวณว่า "วันครบกำหนด" (dueDay ของทุกเดือน) ใกล้/เลยกำหนดหรือยัง เทียบกับวันนี้
// แยกออกมาเป็นฟังก์ชันล้วนๆ (pure function) ตั้งใจ — จะได้เขียน Vitest ทดสอบได้โดยไม่ต้องเปิดเบราว์เซอร์
export function calculateDueInfo(dueDay, today = new Date(), dueSoonDays = AppConfig.DUE_SOON_DAYS) {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const clampedDueDay = Math.min(dueDay, daysInMonth); // กัน dueDay=31 ในเดือนกุมภาพันธ์
  const daysUntil = clampedDueDay - today.getDate();

  return {
    daysUntil,
    isOverdue: daysUntil < 0,
    isDueSoon: daysUntil >= 0 && daysUntil <= dueSoonDays,
  };
}

function escapeHtml(str) {
  // เทคนิค: เอาไปใส่ textContent (บราวเซอร์ escape ให้อัตโนมัติ) แล้วอ่าน innerHTML กลับออกมา
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ตัวเลข/เงิน/รหัสอ้างอิง ต้องใช้ font mono เสมอ (Control Room typography rule — ดู design-system.md DS-2)
function mono(text) {
  return `<span class="data-mono">${text}</span>`;
}

function money(amount) {
  return mono(formatCurrency(amount));
}

function typeLabel(type) {
  return { rent: 'ค่าเช่า', loan: 'ผ่อนธนาคาร', expense: 'ค่าใช้จ่าย' }[type] ?? type;
}

function typeIcon(type) {
  return { rent: '🏠', loan: '🏦', expense: '🔧' }[type] ?? '📄';
}

function statusBadge(status) {
  return status === 'paid'
    ? '<span class="inline-flex items-center gap-1.5 text-xs text-[var(--lamp-green)]"><span class="lamp lamp-green"></span>จ่ายแล้ว</span>'
    : '<span class="inline-flex items-center gap-1.5 text-xs text-[var(--lamp-amber)]"><span class="lamp lamp-amber"></span>ยังไม่จ่าย</span>';
}

function txForMonth(transactions, month) {
  return transactions.filter((t) => t.month === month);
}

function sumByType(transactions, type, status = 'paid') {
  return transactions
    .filter((t) => t.type === type && t.status === status)
    .reduce((sum, t) => sum + t.amount, 0);
}

// ---------- View renderers ----------

function isPaidThisMonth(monthTx, roomId, type) {
  return monthTx.some((t) => t.roomId === roomId && t.type === type && t.status === 'paid');
}

function renderDashboard({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);
  const totalRent = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.RENT);
  const totalLoan = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.LOAN);
  const totalExpense = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.EXPENSE);
  const net = totalRent - totalLoan - totalExpense;
  const netColor = net >= 0 ? 'var(--lamp-green)' : 'var(--lamp-red)';

  // ห้องที่จ่ายแล้วเดือนนี้ ไม่ต้องเตือนซ้ำ — เช็ค isPaidThisMonth ก่อนเสมอ
  const dueList = rooms
    .flatMap((room) => {
      const items = [];
      if (!isPaidThisMonth(monthTx, room.id, AppConfig.TRANSACTION_TYPE.RENT)) {
        const rentInfo = calculateDueInfo(room.rentDueDay);
        if (rentInfo.isOverdue || rentInfo.isDueSoon) items.push({ room, type: 'rent', info: rentInfo });
      }
      if (!isPaidThisMonth(monthTx, room.id, AppConfig.TRANSACTION_TYPE.LOAN)) {
        const loanInfo = calculateDueInfo(room.loanDueDay);
        if (loanInfo.isOverdue || loanInfo.isDueSoon) items.push({ room, type: 'loan', info: loanInfo });
      }
      return items;
    })
    .slice(0, 3);

  return `
    <h2 class="text-lg font-medium mb-4 text-[var(--text-primary)]">สรุปเดือน ${monthLabel(month)}</h2>
    <div class="grid grid-cols-2 gap-3 mb-6">
      <div class="panel p-4">
        <p class="text-xs text-[var(--text-secondary)]">รายรับ (ค่าเช่า)</p>
        <p class="text-lg mt-1">${money(totalRent)}</p>
      </div>
      <div class="panel p-4">
        <p class="text-xs text-[var(--text-secondary)]">ผ่อนธนาคาร</p>
        <p class="text-lg mt-1">${money(totalLoan)}</p>
      </div>
      <div class="panel p-4">
        <p class="text-xs text-[var(--text-secondary)]">ค่าใช้จ่าย</p>
        <p class="text-lg mt-1">${money(totalExpense)}</p>
      </div>
      <div class="panel p-4">
        <p class="text-xs text-[var(--text-secondary)]">กำไรสุทธิ</p>
        <p class="text-lg mt-1" style="color:${netColor}">${money(net)}</p>
      </div>
    </div>

    <h3 class="text-sm font-medium mb-2 text-[var(--text-primary)]">⚠️ ใกล้ครบกำหนด</h3>
    ${dueList.length === 0
      ? '<p class="text-sm text-[var(--text-tertiary)]">ไม่มีรายการใกล้ครบกำหนดค่ะ 🎉</p>'
      : `<ul class="space-y-2">${dueList.map((item) => {
          const color = item.info.isOverdue ? 'var(--lamp-red)' : 'var(--lamp-amber)';
          const lampClass = item.info.isOverdue ? 'lamp-red' : 'lamp-amber';
          return `
          <li class="panel flex justify-between items-center px-4 py-2 text-sm" style="border-left-color:${color}">
            <span class="flex items-center gap-2"><span class="lamp ${lampClass}"></span>ห้อง ${mono(escapeHtml(item.room.roomNumber))} — ${typeLabel(item.type)}</span>
            <span class="data-mono text-xs" style="color:${color}">
              ${item.info.isOverdue ? `เลยกำหนด ${Math.abs(item.info.daysUntil)} วัน` : `อีก ${item.info.daysUntil} วัน`}
            </span>
          </li>`;
        }).join('')}</ul>`}
  `;
}

function renderRooms({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);

  return `
    <h2 class="text-lg font-medium mb-4 text-[var(--text-primary)]">ห้องพักทั้งหมด</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${rooms.map((room) => {
        const rentPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'rent' && t.status === 'paid');
        const loanPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'loan' && t.status === 'paid');
        return `
          <div class="panel p-4">
            <div class="flex justify-between items-start mb-2">
              <div>
                <p class="font-medium">ห้อง ${mono(escapeHtml(room.roomNumber))}</p>
                <p class="text-xs text-[var(--text-secondary)]">${room.tenantName ? escapeHtml(room.tenantName) : 'ยังไม่มีผู้เช่า'}</p>
              </div>
              <button type="button" data-action="edit-room" data-id="${room.id}" class="text-sm text-[var(--brass)]" aria-label="แก้ไขห้อง ${escapeHtml(room.roomNumber)}">แก้ไข</button>
            </div>
            <div class="flex gap-4 text-xs">
              <span class="flex items-center gap-1.5"><span class="lamp ${rentPaid ? 'lamp-green' : 'lamp-off'}"></span>เช่า ${money(room.rentAmount)}</span>
              <span class="flex items-center gap-1.5"><span class="lamp ${loanPaid ? 'lamp-green' : 'lamp-off'}"></span>ผ่อน ${money(room.loanMonthlyPayment)}</span>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

function renderTransactions({ rooms, transactions }) {
  const roomName = (roomId) => rooms.find((r) => r.id === roomId)?.roomNumber ?? '?';
  const sorted = [...transactions].sort((a, b) => b.month.localeCompare(a.month));

  return `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-lg font-medium text-[var(--text-primary)]">ธุรกรรมทั้งหมด</h2>
      <button type="button" data-action="open-add-transaction" class="rounded-[10px] bg-[var(--brass)] text-[var(--panel-ink)] text-sm px-3 py-1.5 font-medium">+ เพิ่ม</button>
    </div>
    ${sorted.length === 0
      ? '<p class="text-sm text-[var(--text-tertiary)]">ยังไม่มีธุรกรรมเลยค่ะ ลองกด "+ เพิ่ม" ดูนะคะ</p>'
      : `<ul class="space-y-2">${sorted.map((t) => `
          <li class="panel p-3 flex justify-between items-center text-sm">
            <div>
              <p>${typeIcon(t.type)} ห้อง ${mono(escapeHtml(roomName(t.roomId)))} · ${typeLabel(t.type)} · ${monthLabel(t.month)}</p>
              <p class="text-xs text-[var(--text-secondary)]">${escapeHtml(t.note || '')}</p>
            </div>
            <div class="flex items-center gap-2">
              ${money(t.amount)}
              ${statusBadge(t.status)}
              <button type="button" data-action="edit-transaction" data-id="${t.id}" aria-label="แก้ไขธุรกรรม">✏️</button>
              <button type="button" data-action="delete-transaction" data-id="${t.id}" aria-label="ลบธุรกรรม">🗑️</button>
            </div>
          </li>`).join('')}</ul>`}
  `;
}

function renderReminders({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);

  // เหมือนใน renderDashboard — ห้องที่มี transaction สถานะ "จ่ายแล้ว" ของเดือนนี้แล้ว ไม่ต้องเตือนอีก
  const items = rooms
    .flatMap((room) => {
      const list = [];
      if (!isPaidThisMonth(monthTx, room.id, AppConfig.TRANSACTION_TYPE.RENT)) {
        list.push({ room, type: 'rent', info: calculateDueInfo(room.rentDueDay) });
      }
      if (!isPaidThisMonth(monthTx, room.id, AppConfig.TRANSACTION_TYPE.LOAN)) {
        list.push({ room, type: 'loan', info: calculateDueInfo(room.loanDueDay) });
      }
      return list;
    })
    .sort((a, b) => a.info.daysUntil - b.info.daysUntil);

  if (items.length === 0) {
    return `
      <h2 class="text-lg font-medium mb-4 text-[var(--text-primary)]">แจ้งเตือนครบกำหนด — ${monthLabel(month)}</h2>
      <p class="text-sm text-[var(--text-tertiary)]">จ่ายครบทุกรายการของเดือนนี้แล้วค่ะ 🎉</p>
    `;
  }

  return `
    <h2 class="text-lg font-medium mb-4 text-[var(--text-primary)]">แจ้งเตือนครบกำหนด — ${monthLabel(month)}</h2>
    <ul class="space-y-2">
      ${items.map((item) => {
        const color = item.info.isOverdue ? 'var(--lamp-red)' : 'var(--lamp-amber)';
        const lampClass = item.info.isOverdue ? 'lamp-red' : 'lamp-amber';
        const statusText = item.info.isOverdue
          ? `เลยกำหนด ${Math.abs(item.info.daysUntil)} วัน`
          : `อีก ${item.info.daysUntil} วัน (วันที่ ${item.room[item.type === 'rent' ? 'rentDueDay' : 'loanDueDay']})`;
        return `
          <li class="panel flex justify-between items-center px-4 py-3 text-sm" style="border-left-color:${color}">
            <span class="flex items-center gap-2"><span class="lamp ${lampClass}"></span>${typeIcon(item.type)} ห้อง ${mono(escapeHtml(item.room.roomNumber))} — ${typeLabel(item.type)}</span>
            <span class="data-mono text-xs" style="color:${color}">${statusText}</span>
          </li>`;
      }).join('')}
    </ul>
  `;
}

// ---------- Modal forms ----------

const INPUT_CLASS = 'w-full mt-1 rounded-[10px] border border-[var(--border)] bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brass)]';
const BTN_PRIMARY = 'flex-1 rounded-[10px] bg-[var(--brass)] text-[var(--panel-ink)] py-2 font-medium';
const BTN_SECONDARY = 'flex-1 rounded-[10px] border border-[var(--border)] py-2';

function roomFormHtml(room) {
  return `
    <form id="roomForm" data-id="${room.id}" class="space-y-3">
      <h3 class="font-medium text-lg mb-2">แก้ไขห้อง ${escapeHtml(room.roomNumber)}</h3>
      <label class="block text-sm">ชื่อผู้เช่า
        <input name="tenantName" value="${escapeHtml(room.tenantName || '')}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">ค่าเช่า/เดือน (บาท)
        <input name="rentAmount" type="number" min="0" value="${room.rentAmount ?? ''}" class="${INPUT_CLASS} data-mono" />
      </label>
      <label class="block text-sm">วันครบกำหนดจ่ายเช่า (1-31)
        <input name="rentDueDay" type="number" min="1" max="31" value="${room.rentDueDay ?? ''}" class="${INPUT_CLASS} data-mono" />
      </label>
      <label class="block text-sm">ยอดผ่อนธนาคาร/เดือน (บาท)
        <input name="loanMonthlyPayment" type="number" min="0" value="${room.loanMonthlyPayment ?? ''}" class="${INPUT_CLASS} data-mono" />
      </label>
      <label class="block text-sm">วันครบกำหนดผ่อนแบงก์ (1-31)
        <input name="loanDueDay" type="number" min="1" max="31" value="${room.loanDueDay ?? ''}" class="${INPUT_CLASS} data-mono" />
      </label>
      <div class="flex gap-2 pt-2">
        <button type="submit" class="${BTN_PRIMARY}">บันทึก</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </form>
  `;
}

function transactionFormHtml(rooms, transaction) {
  const t = transaction ?? { id: '', roomId: rooms[0]?.id, type: 'rent', month: currentMonthStr(), amount: '', status: 'unpaid', note: '' };
  return `
    <form id="transactionForm" data-id="${t.id}" class="space-y-3">
      <h3 class="font-medium text-lg mb-2">${transaction ? 'แก้ไข' : 'เพิ่ม'}ธุรกรรม</h3>
      <label class="block text-sm">ห้อง
        <select name="roomId" class="${INPUT_CLASS}">
          ${rooms.map((r) => `<option value="${r.id}" ${r.id === t.roomId ? 'selected' : ''}>ห้อง ${escapeHtml(r.roomNumber)}</option>`).join('')}
        </select>
      </label>
      <label class="block text-sm">ประเภท
        <select name="type" class="${INPUT_CLASS}">
          <option value="rent" ${t.type === 'rent' ? 'selected' : ''}>ค่าเช่า</option>
          <option value="loan" ${t.type === 'loan' ? 'selected' : ''}>ผ่อนธนาคาร</option>
          <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>ค่าใช้จ่าย/ซ่อมบำรุง</option>
        </select>
      </label>
      <label class="block text-sm">เดือน
        <input name="month" type="month" value="${t.month}" class="${INPUT_CLASS} data-mono" />
      </label>
      <label class="block text-sm">จำนวนเงิน (บาท)
        <input name="amount" type="number" min="0" value="${t.amount}" class="${INPUT_CLASS} data-mono" />
      </label>
      <label class="block text-sm">สถานะ
        <select name="status" class="${INPUT_CLASS}">
          <option value="unpaid" ${t.status === 'unpaid' ? 'selected' : ''}>ยังไม่จ่าย</option>
          <option value="paid" ${t.status === 'paid' ? 'selected' : ''}>จ่ายแล้ว</option>
        </select>
      </label>
      <label class="block text-sm">โน้ต (ถ้ามี)
        <input name="note" value="${escapeHtml(t.note || '')}" class="${INPUT_CLASS}" />
      </label>
      <div class="flex gap-2 pt-2">
        <button type="submit" class="${BTN_PRIMARY}">บันทึก</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </form>
  `;
}

function confirmDeleteHtml(message, confirmAction, confirmId) {
  return `
    <div class="space-y-4">
      <p>${escapeHtml(message)}</p>
      <div class="flex gap-2">
        <button type="button" data-action="${confirmAction}" data-id="${confirmId}" class="flex-1 rounded-[10px] bg-red-600 hover:bg-red-700 text-white py-2 font-medium">ลบ</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </div>
  `;
}

// ---------- DOM-touching API ----------

export const UIRenderer = {
  renderView(viewName, data) {
    const container = document.getElementById('viewContainer');
    const renderers = {
      dashboard: renderDashboard,
      rooms: renderRooms,
      transactions: renderTransactions,
      reminders: renderReminders,
    };
    container.innerHTML = (renderers[viewName] ?? renderDashboard)(data);
  },

  openRoomForm(room) {
    this.openModal(roomFormHtml(room));
  },

  openTransactionForm(rooms, transaction) {
    this.openModal(transactionFormHtml(rooms, transaction));
  },

  openDeleteConfirm(message, action, id) {
    this.openModal(confirmDeleteHtml(message, action, id));
  },

  openModal(contentHtml) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `
      <div class="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50" data-action="close-modal">
        <div class="bg-[var(--paper-card)] dark:bg-[var(--panel-surface)] border border-[var(--border)] rounded-t-[14px] sm:rounded-[14px] w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
          ${contentHtml}
        </div>
      </div>
    `;
  },

  closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
  },

  showToast(message, type = 'info') {
    const root = document.getElementById('toastRoot');
    const color = type === 'error' ? 'var(--lamp-red)' : type === 'success' ? 'var(--lamp-green)' : 'var(--brass)';
    const el = document.createElement('div');
    el.className = 'text-sm rounded-[10px] px-4 py-2 shadow-lg bg-[var(--paper-card)] dark:bg-[var(--panel-surface)] border border-[var(--border)]';
    el.style.borderLeft = `4px solid ${color}`;
    el.textContent = message; // textContent เสมอ ไม่ใช้ innerHTML กับข้อความที่โผล่ผ่าน parameter
    root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  },
};
