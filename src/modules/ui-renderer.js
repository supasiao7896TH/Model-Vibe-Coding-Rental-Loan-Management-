/* global lucide */
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

function icon(name, cls = 'w-5 h-5') {
  return `<i data-lucide="${name}" class="${cls}"></i>`;
}

function typeIcon(type) {
  return { rent: 'home', loan: 'landmark', expense: 'wrench' }[type] ?? 'file-text';
}

function typeLabel(type) {
  return { rent: 'ค่าเช่า', loan: 'ผ่อนธนาคาร', expense: 'ค่าใช้จ่าย' }[type] ?? type;
}

function statusBadge(status) {
  return status === 'paid'
    ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">จ่ายแล้ว</span>'
    : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600">ยังไม่จ่าย</span>';
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

// การ์ดสรุปตัวเลขแบบ KPI tile — tactile (นูนจากพื้นผิว) + เส้นขอบบนสี (แก้จุดอ่อน contrast ต่ำของ neumorphism ล้วนๆ) + ไอคอนชิป
function kpiTile({ label, value, iconName, accent }) {
  return `
    <div class="tactile rounded-2xl p-5 flex items-center justify-between border-t-4 ${accent.border} animate-slide-up">
      <div>
        <p class="text-xs text-[var(--text-secondary)] font-medium">${label}</p>
        <p class="text-2xl font-black mt-1 ${accent.text}">${value}</p>
      </div>
      <div class="tactile-btn w-11 h-11 ${accent.text} flex items-center justify-center shrink-0">
        ${icon(iconName, 'w-5 h-5')}
      </div>
    </div>
  `;
}

function renderDashboard({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);
  const totalRent = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.RENT);
  const totalLoan = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.LOAN);
  const totalExpense = sumByType(monthTx, AppConfig.TRANSACTION_TYPE.EXPENSE);
  const net = totalRent - totalLoan - totalExpense;
  const netAccent = net >= 0
    ? { border: 'border-t-brand-500', text: 'text-brand-600', chipBg: 'bg-brand-50' }
    : { border: 'border-t-red-500', text: 'text-red-600', chipBg: 'bg-red-50' };

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
    <h2 class="text-lg font-bold mb-4 ">สรุปเดือน ${monthLabel(month)}</h2>
    <div class="grid grid-cols-2 gap-3 mb-6">
      ${kpiTile({ label: 'รายรับ (ค่าเช่า)', value: formatCurrency(totalRent), iconName: 'home', accent: { border: 'border-t-blue-500', text: 'text-blue-600', chipBg: 'bg-blue-50' } })}
      ${kpiTile({ label: 'ผ่อนธนาคาร', value: formatCurrency(totalLoan), iconName: 'landmark', accent: { border: 'border-t-purple-500', text: 'text-purple-600', chipBg: 'bg-purple-50' } })}
      ${kpiTile({ label: 'ค่าใช้จ่าย', value: formatCurrency(totalExpense), iconName: 'wrench', accent: { border: 'border-t-amber-500', text: 'text-amber-600', chipBg: 'bg-amber-50' } })}
      ${kpiTile({ label: 'กำไรสุทธิ', value: formatCurrency(net), iconName: 'trending-up', accent: netAccent })}
    </div>

    <h3 class="text-sm font-bold mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-1.5">${icon('triangle-alert', 'w-4 h-4 text-amber-500')} ใกล้ครบกำหนด</h3>
    ${dueList.length === 0
      ? '<p class="text-sm text-[var(--text-tertiary)]">ไม่มีรายการใกล้ครบกำหนดค่ะ 🎉</p>'
      : `<ul class="space-y-2">${dueList.map((item) => {
          const tone = item.info.isOverdue ? 'text-red-600' : 'text-amber-600';
          const dot = item.info.isOverdue ? 'bg-red-500 pulse-dot' : 'bg-amber-500';
          return `
          <li class="tactile-sm flex justify-between items-center px-4 py-2.5 text-sm animate-fade-in">
            <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${dot}"></span>ห้อง ${escapeHtml(item.room.roomNumber)} — ${typeLabel(item.type)}</span>
            <span class="text-xs font-bold ${tone}">
              ${item.info.isOverdue ? `เลยกำหนด ${Math.abs(item.info.daysUntil)} วัน` : `อีก ${item.info.daysUntil} วัน`}
            </span>
          </li>`;
        }).join('')}</ul>`}
  `;
}

function renderRooms({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);

  return `
    <h2 class="text-lg font-bold mb-4 ">ห้องพักทั้งหมด</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${rooms.map((room) => {
        const rentPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'rent' && t.status === 'paid');
        const loanPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'loan' && t.status === 'paid');
        return `
          <div class="tactile rounded-2xl p-4 animate-slide-up">
            <div class="flex justify-between items-start mb-2">
              <div>
                <p class="font-bold">ห้อง ${escapeHtml(room.roomNumber)}</p>
                <p class="text-xs text-[var(--text-secondary)]">${room.tenantName ? escapeHtml(room.tenantName) : 'ยังไม่มีผู้เช่า'}</p>
              </div>
              <button type="button" data-action="edit-room" data-id="${room.id}" title="แก้ไขห้อง ${escapeHtml(room.roomNumber)}" class="text-sm font-bold text-brand-600 hover:text-brand-700" aria-label="แก้ไขห้อง ${escapeHtml(room.roomNumber)}">แก้ไข</button>
            </div>
            <div class="flex gap-4 text-xs">
              <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${rentPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>เช่า ${formatCurrency(room.rentAmount)}</span>
              <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${loanPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>ผ่อน ${formatCurrency(room.loanMonthlyPayment)}</span>
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
      <h2 class="text-lg font-bold ">ธุรกรรมทั้งหมด</h2>
      <button type="button" data-action="open-add-transaction" class="flex items-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 transition-colors">${icon('plus', 'w-4 h-4')} เพิ่ม</button>
    </div>
    ${sorted.length === 0
      ? '<p class="text-sm text-[var(--text-tertiary)]">ยังไม่มีธุรกรรมเลยค่ะ ลองกด "+ เพิ่ม" ดูนะคะ</p>'
      : `<ul class="space-y-2">${sorted.map((t) => `
          <li class="tactile-sm p-3 flex justify-between items-center text-sm animate-fade-in">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-lg tactile-btn text-[var(--text-secondary)] flex items-center justify-center shrink-0">${icon(typeIcon(t.type), 'w-4 h-4')}</div>
              <div>
                <p class="font-medium">ห้อง ${escapeHtml(roomName(t.roomId))} · ${typeLabel(t.type)} · ${monthLabel(t.month)}</p>
                <p class="text-xs text-[var(--text-secondary)]">${escapeHtml(t.note || '')}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-bold">${formatCurrency(t.amount)}</span>
              ${statusBadge(t.status)}
              <button type="button" data-action="edit-transaction" data-id="${t.id}" title="แก้ไขธุรกรรม" aria-label="แก้ไขธุรกรรม" class="text-slate-400 hover:text-brand-600">${icon('square-pen', 'w-4 h-4')}</button>
              <button type="button" data-action="delete-transaction" data-id="${t.id}" title="ลบธุรกรรม" aria-label="ลบธุรกรรม" class="text-slate-400 hover:text-red-600">${icon('trash-2', 'w-4 h-4')}</button>
            </div>
          </li>`).join('')}</ul>`}
  `;
}

function renderReminders({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);

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
      <h2 class="text-lg font-bold mb-4 ">แจ้งเตือนครบกำหนด — ${monthLabel(month)}</h2>
      <p class="text-sm text-[var(--text-tertiary)]">จ่ายครบทุกรายการของเดือนนี้แล้วค่ะ 🎉</p>
    `;
  }

  return `
    <h2 class="text-lg font-bold mb-4 ">แจ้งเตือนครบกำหนด — ${monthLabel(month)}</h2>
    <ul class="space-y-2">
      ${items.map((item) => {
        const isOverdue = item.info.isOverdue;
        const border = isOverdue ? 'border-t-red-500' : 'border-t-amber-500';
        const tone = isOverdue ? 'text-red-600' : 'text-amber-600';
        const statusText = isOverdue
          ? `เลยกำหนด ${Math.abs(item.info.daysUntil)} วัน`
          : `อีก ${item.info.daysUntil} วัน (วันที่ ${item.room[item.type === 'rent' ? 'rentDueDay' : 'loanDueDay']})`;
        return `
          <li class="tactile-sm border-t-4 ${border} flex justify-between items-center px-4 py-3 text-sm animate-fade-in">
            <span class="flex items-center gap-2">${icon(typeIcon(item.type), 'w-4 h-4 text-slate-400')}ห้อง ${escapeHtml(item.room.roomNumber)} — ${typeLabel(item.type)}</span>
            <span class="text-xs font-bold ${tone}">${statusText}</span>
          </li>`;
      }).join('')}
    </ul>
  `;
}

// ---------- Modal forms ----------

const INPUT_CLASS = 'tactile-inset w-full mt-1 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const BTN_PRIMARY = 'tactile-btn flex-1 text-brand-600 py-2 font-bold';
const BTN_SECONDARY = 'tactile-btn flex-1 text-[var(--text-secondary)] py-2 font-medium';

function roomFormHtml(room) {
  return `
    <form id="roomForm" data-id="${room.id}" class="space-y-3">
      <h3 class="font-bold text-lg mb-2">แก้ไขห้อง ${escapeHtml(room.roomNumber)}</h3>
      <label class="block text-sm">ชื่อผู้เช่า
        <input name="tenantName" value="${escapeHtml(room.tenantName || '')}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">ค่าเช่า/เดือน (บาท)
        <input name="rentAmount" type="number" min="0" value="${room.rentAmount ?? ''}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">วันครบกำหนดจ่ายเช่า (1-31)
        <input name="rentDueDay" type="number" min="1" max="31" value="${room.rentDueDay ?? ''}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">ยอดผ่อนธนาคาร/เดือน (บาท)
        <input name="loanMonthlyPayment" type="number" min="0" value="${room.loanMonthlyPayment ?? ''}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">วันครบกำหนดผ่อนแบงก์ (1-31)
        <input name="loanDueDay" type="number" min="1" max="31" value="${room.loanDueDay ?? ''}" class="${INPUT_CLASS}" />
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
      <h3 class="font-bold text-lg mb-2">${transaction ? 'แก้ไข' : 'เพิ่ม'}ธุรกรรม</h3>
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
        <input name="month" type="month" value="${t.month}" class="${INPUT_CLASS}" />
      </label>
      <label class="block text-sm">จำนวนเงิน (บาท)
        <input name="amount" type="number" min="0" value="${t.amount}" class="${INPUT_CLASS}" />
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
        <button type="button" data-action="${confirmAction}" data-id="${confirmId}" class="tactile-btn flex-1 text-red-600 py-2 font-bold">ลบ</button>
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
    lucide.createIcons(); // แปลง <i data-lucide="..."> ที่เพิ่งใส่เข้าไปให้กลายเป็น SVG จริง
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
      <div class="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40" data-action="close-modal">
        <div class="tactile w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto !rounded-t-2xl sm:!rounded-2xl">
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
    const border = type === 'error' ? 'border-t-red-500' : type === 'success' ? 'border-t-emerald-500' : 'border-t-brand-500';
    const el = document.createElement('div');
    el.className = `tactile-sm border-t-4 ${border} text-sm px-4 py-2`;
    el.textContent = message; // textContent เสมอ ไม่ใช้ innerHTML กับข้อความที่โผล่ผ่าน parameter
    root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? icon('sun', 'w-5 h-5') : icon('moon', 'w-5 h-5');
      lucide.createIcons();
    }
  },
};
