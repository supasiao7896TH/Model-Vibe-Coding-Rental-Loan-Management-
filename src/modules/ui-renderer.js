/* global lucide, Chart */
import { AppConfig } from './app-config.js';
import { calcLoanCurrentBalance, calcLoanSchedule } from './loan-engine.js';
import { buildTaxReport } from './tax-report.js';

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

export function formatDateThai(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
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

// จำนวนวันที่เหลือก่อนสัญญาเช่าจะหมดอายุ (ติดลบ = หมดอายุไปแล้วกี่วัน) — null ถ้าไม่ได้กรอกวันสิ้นสุดสัญญา
export function contractDaysLeft(contractEnd, today = new Date()) {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

// สรุปยอดรายรับ/ผ่อน ย้อนหลัง N เดือน (นับรวมเดือนปัจจุบัน) — pure function เทสได้โดยไม่ต้องมี canvas จริง
export function buildTrendData(transactions, month, monthsBack = 6) {
  const [year, m] = month.split('-').map(Number);
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(year, m - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return {
    labels: months.map((mo) => monthLabel(mo)),
    rent: months.map((mo) => sumByType(txForMonth(transactions, mo), AppConfig.TRANSACTION_TYPE.RENT)),
    loan: months.map((mo) => sumByType(txForMonth(transactions, mo), AppConfig.TRANSACTION_TYPE.LOAN)),
  };
}

// ---------- View renderers ----------

function isPaidThisMonth(monthTx, roomId, type) {
  return monthTx.some((t) => t.roomId === roomId && t.type === type && t.status === 'paid');
}

function txForMonth(transactions, month) {
  return transactions.filter((t) => t.month === month);
}

function sumByType(transactions, type, status = 'paid') {
  return transactions
    .filter((t) => t.type === type && t.status === status)
    .reduce((sum, t) => sum + t.amount, 0);
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

function occupancyStats(rooms) {
  const total = rooms.length;
  const occupied = rooms.filter((r) => r.tenantName).length;
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return { total, occupied, rate };
}

function rentCollectionStats(rooms, monthTx) {
  const occupiedRooms = rooms.filter((r) => r.tenantName);
  const expected = occupiedRooms.reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  let collected = 0;
  let unpaidUnits = 0;
  occupiedRooms.forEach((room) => {
    const got = monthTx
      .filter((t) => t.roomId === room.id && t.type === AppConfig.TRANSACTION_TYPE.RENT && t.status === 'paid')
      .reduce((sum, t) => sum + t.amount, 0);
    collected += Math.min(got, room.rentAmount || got);
    if (got < (room.rentAmount || 0)) unpaidUnits++;
  });
  const pct = expected > 0 ? Math.min(Math.round((collected / expected) * 100), 100) : 0;
  return { expected, collected, outstanding: Math.max(expected - collected, 0), unpaidUnits, pct };
}

// การ์ดสรุปตัวเลขแบบ KPI tile — tactile (นูนจากพื้นผิว) + เส้นขอบบนสี (แก้จุดอ่อน contrast ต่ำของ neumorphism ล้วนๆ) + ไอคอนชิป
// class="kpi-value" + data-target="ตัวเลขดิบ" ไว้ให้ animateKpiNumbers() อ่านไปนับขึ้นทีหลัง
function kpiTile({ label, value, rawValue, iconName, accent }) {
  return `
    <div class="tactile rounded-2xl p-5 flex items-center justify-between border-t-4 ${accent.border} animate-slide-up">
      <div>
        <p class="text-xs text-[var(--text-secondary)] font-medium">${label}</p>
        <p class="text-2xl font-black mt-1 ${accent.text} kpi-value" data-target="${rawValue}">${value}</p>
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

  const occupancy = occupancyStats(rooms);
  const collection = rentCollectionStats(rooms, monthTx);

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

  const contractAlerts = rooms
    .map((room) => ({ room, daysLeft: contractDaysLeft(room.contractEnd) }))
    .filter((item) => item.daysLeft !== null && item.daysLeft <= AppConfig.CONTRACT_DUE_SOON_DAYS);

  return `
    <h2 class="text-lg font-bold mb-4 ">สรุปเดือน ${monthLabel(month)}</h2>
    <div class="grid grid-cols-2 gap-3 mb-6">
      ${kpiTile({ label: 'รายรับ (ค่าเช่า)', value: formatCurrency(totalRent), rawValue: totalRent, iconName: 'home', accent: { border: 'border-t-blue-500', text: 'text-blue-600', chipBg: 'bg-blue-50' } })}
      ${kpiTile({ label: 'ผ่อนธนาคาร', value: formatCurrency(totalLoan), rawValue: totalLoan, iconName: 'landmark', accent: { border: 'border-t-purple-500', text: 'text-purple-600', chipBg: 'bg-purple-50' } })}
      ${kpiTile({ label: 'ค่าใช้จ่าย', value: formatCurrency(totalExpense), rawValue: totalExpense, iconName: 'wrench', accent: { border: 'border-t-amber-500', text: 'text-amber-600', chipBg: 'bg-amber-50' } })}
      ${kpiTile({ label: 'กำไรสุทธิ', value: formatCurrency(net), rawValue: net, iconName: 'trending-up', accent: netAccent })}
    </div>

    <div class="tactile p-4 mb-6">
      <h3 class="text-sm font-bold mb-2">แนวโน้มย้อนหลัง 6 เดือน</h3>
      <div class="relative h-56">
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <div class="tactile-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-[var(--text-secondary)]">อัตราการเช่า (Occupancy)</span>
          ${icon('building-2', 'w-4 h-4 text-brand-500')}
        </div>
        <p class="text-2xl font-black text-brand-600">${occupancy.rate}%</p>
        <p class="text-xs text-[var(--text-tertiary)] mt-0.5">${occupancy.occupied}/${occupancy.total} ห้องมีผู้เช่า</p>
      </div>
      <div class="tactile-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-[var(--text-secondary)]">เก็บค่าเช่าได้แล้ว</span>
          ${icon('wallet', 'w-4 h-4 text-emerald-500')}
        </div>
        <p class="text-lg font-black text-emerald-600">${formatCurrency(collection.collected)} <span class="text-xs font-medium text-[var(--text-tertiary)]">/ ${formatCurrency(collection.expected)}</span></p>
        <div class="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/5 mt-2 overflow-hidden">
          <div class="h-full bg-emerald-500 rounded-full" style="width:${collection.pct}%"></div>
        </div>
        <p class="text-xs text-[var(--text-tertiary)] mt-1.5">ค้างรับ ${formatCurrency(collection.outstanding)} · ${collection.unpaidUnits} ห้อง</p>
      </div>
    </div>

    ${contractAlerts.length > 0 ? `
    <h3 class="text-sm font-bold mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-1.5">${icon('file-warning', 'w-4 h-4 text-red-500')} สัญญาใกล้หมดอายุ</h3>
    <ul class="space-y-2 mb-6">
      ${contractAlerts.map(({ room, daysLeft }) => `
        <li class="tactile-sm flex justify-between items-center px-4 py-2.5 text-sm animate-fade-in">
          <span>ห้อง ${escapeHtml(room.roomNumber)} — ${escapeHtml(room.tenantName || '')}</span>
          <span class="text-xs font-bold ${daysLeft < 0 ? 'text-red-600' : 'text-amber-600'}">${daysLeft < 0 ? `หมดสัญญาแล้ว ${Math.abs(daysLeft)} วัน` : `เหลือ ${daysLeft} วัน`}</span>
        </li>`).join('')}
    </ul>` : ''}

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

function roomCardHtml(room, monthTx) {
  const rentPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'rent' && t.status === 'paid');
  const loanPaid = monthTx.some((t) => t.roomId === room.id && t.type === 'loan' && t.status === 'paid');
  const occupied = Boolean(room.tenantName);
  const currentBalance = calcLoanCurrentBalance(room);

  return `
    <div class="tactile rounded-2xl p-4 animate-slide-up">
      <div class="flex justify-between items-start mb-2">
        <div>
          <div class="flex items-center gap-2">
            <p class="font-bold">ห้อง ${escapeHtml(room.roomNumber)}</p>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${occupied ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}">${occupied ? 'มีผู้เช่า' : 'ว่าง'}</span>
          </div>
          <p class="text-xs text-[var(--text-secondary)]">${occupied ? escapeHtml(room.tenantName) : 'ยังไม่มีผู้เช่า'}</p>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" data-action="edit-room" data-id="${room.id}" title="แก้ไขห้อง ${escapeHtml(room.roomNumber)}" class="tactile-btn w-8 h-8 flex items-center justify-center text-brand-600" aria-label="แก้ไขห้อง ${escapeHtml(room.roomNumber)}">${icon('square-pen', 'w-4 h-4')}</button>
          <button type="button" data-action="delete-room" data-id="${room.id}" title="ลบห้อง ${escapeHtml(room.roomNumber)}" class="tactile-btn w-8 h-8 flex items-center justify-center text-red-500" aria-label="ลบห้อง ${escapeHtml(room.roomNumber)}">${icon('trash-2', 'w-4 h-4')}</button>
        </div>
      </div>
      <div class="flex gap-4 text-xs mb-3">
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${rentPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>เช่า ${formatCurrency(room.rentAmount)}</span>
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${loanPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>ผ่อน ${formatCurrency(room.loanMonthlyPayment)}</span>
      </div>
      ${currentBalance !== null ? `<p class="text-[11px] font-bold text-purple-500 mb-3">ยอดหนี้คงเหลือ ~${formatCurrency(currentBalance)}</p>` : ''}
      <div class="grid grid-cols-4 gap-1.5 pt-2 border-t border-black/5 dark:border-white/5">
        <button type="button" data-action="open-doc-vault" data-id="${room.id}" title="คลังเอกสาร" class="tactile-btn h-9 flex items-center justify-center text-amber-600">${icon('folder', 'w-4 h-4')}</button>
        <button type="button" data-action="open-tenant-history" data-id="${room.id}" title="ประวัติผู้เช่า" class="tactile-btn h-9 flex items-center justify-center text-slate-500">${icon('history', 'w-4 h-4')}</button>
        ${currentBalance !== null
          ? `<button type="button" data-action="open-loan-schedule" data-id="${room.id}" title="ตารางผ่อนชำระ" class="tactile-btn h-9 flex items-center justify-center text-purple-600">${icon('calculator', 'w-4 h-4')}</button>`
          : `<button type="button" title="ยังไม่ได้กรอกข้อมูลสินเชื่อ" class="tactile-btn h-9 flex items-center justify-center text-slate-300 cursor-not-allowed" disabled>${icon('calculator', 'w-4 h-4')}</button>`}
        <button type="button" data-action="print-invoice" data-id="${room.id}" title="พิมพ์ใบแจ้งหนี้" class="tactile-btn h-9 flex items-center justify-center text-slate-600">${icon('printer', 'w-4 h-4')}</button>
      </div>
    </div>`;
}

function renderRooms({ rooms, transactions, month }) {
  const monthTx = txForMonth(transactions, month);

  return `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-lg font-bold ">ห้องพักทั้งหมด</h2>
      <button type="button" data-action="add-room" class="flex items-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 transition-colors">${icon('plus', 'w-4 h-4')} เพิ่มห้อง</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${rooms.map((room) => roomCardHtml(room, monthTx)).join('')}
    </div>
  `;
}

function filterTransactions(transactions, roomName, filter) {
  const query = (filter?.query ?? '').trim().toLowerCase();
  const type = filter?.type ?? 'all';

  return transactions.filter((t) => {
    if (type !== 'all' && t.type !== type) return false;
    if (!query) return true;
    const haystack = `${roomName(t.roomId)} ${t.note ?? ''} ${t.category ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderTransactions({ rooms, transactions, txFilter }) {
  const roomName = (roomId) => rooms.find((r) => r.id === roomId)?.roomNumber ?? '?';
  const filtered = filterTransactions(transactions, roomName, txFilter);
  const sorted = [...filtered].sort((a, b) => b.month.localeCompare(a.month));
  const filter = txFilter ?? { query: '', type: 'all' };

  return `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-lg font-bold ">ธุรกรรมทั้งหมด</h2>
      <button type="button" data-action="open-add-transaction" class="flex items-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 transition-colors">${icon('plus', 'w-4 h-4')} เพิ่ม</button>
    </div>
    <div class="flex gap-2 mb-4">
      <input type="search" data-role="tx-search" value="${escapeHtml(filter.query)}" placeholder="ค้นหา (เลขห้อง/โน้ต/หมวดหมู่)" class="tactile-inset flex-1 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
      <select data-role="tx-type-filter" class="tactile-inset px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
        <option value="all" ${filter.type === 'all' ? 'selected' : ''}>ทุกประเภท</option>
        <option value="rent" ${filter.type === 'rent' ? 'selected' : ''}>ค่าเช่า</option>
        <option value="loan" ${filter.type === 'loan' ? 'selected' : ''}>ผ่อนธนาคาร</option>
        <option value="expense" ${filter.type === 'expense' ? 'selected' : ''}>ค่าใช้จ่าย</option>
      </select>
    </div>
    ${sorted.length === 0
      ? `<p class="text-sm text-[var(--text-tertiary)]">${transactions.length === 0 ? 'ยังไม่มีธุรกรรมเลยค่ะ ลองกด "+ เพิ่ม" ดูนะคะ' : 'ไม่พบธุรกรรมที่ตรงกับตัวกรองค่ะ'}</p>`
      : `<ul class="space-y-2">${sorted.map((t) => `
          <li class="tactile-sm p-3 flex justify-between items-center text-sm animate-fade-in">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-lg tactile-btn text-[var(--text-secondary)] flex items-center justify-center shrink-0">${icon(typeIcon(t.type), 'w-4 h-4')}</div>
              <div>
                <p class="font-medium">ห้อง ${escapeHtml(roomName(t.roomId))} · ${typeLabel(t.type)}${t.category ? ` · <span class="text-[var(--text-tertiary)]">${escapeHtml(t.category)}</span>` : ''} · ${monthLabel(t.month)}</p>
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

function renderSettings({ rooms, transactions }) {
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `
    <h2 class="text-lg font-bold mb-4">ตั้งค่าระบบ</h2>

    <div class="tactile p-4 mb-4">
      <h3 class="text-sm font-bold mb-2 flex items-center gap-1.5">${icon('share-2', 'w-4 h-4 text-brand-500')} ลิงก์ใช้งาน / ติดตั้งเป็นแอป</h3>
      <p class="text-xs text-[var(--text-secondary)] mb-2">แชร์ลิงก์นี้ หรือเปิดในมือถือแล้วกด "เพิ่มลงหน้าจอโฮม" เพื่อติดตั้งเป็นแอป ใช้งาน offline ได้</p>
      <div class="flex gap-2">
        <input readonly value="${escapeHtml(shareUrl)}" class="tactile-inset flex-1 px-3 py-2 text-sm" />
        <button type="button" data-action="copy-share-link" class="tactile-btn px-4 text-sm font-bold text-brand-600">คัดลอก</button>
      </div>
    </div>

    <div class="tactile p-4 mb-4">
      <h3 class="text-sm font-bold mb-2 flex items-center gap-1.5">${icon('file-text', 'w-4 h-4 text-emerald-500')} รายงานภาษีประจำปี</h3>
      <p class="text-xs text-[var(--text-secondary)] mb-3">สรุปรายรับ-รายจ่ายรายห้อง พร้อมประมาณการหักค่าใช้จ่ายเหมา 30% สำหรับยื่น ภ.ง.ด. 90</p>
      <button type="button" data-action="open-tax-report" class="tactile-btn px-4 py-2 text-sm font-bold text-emerald-600 flex items-center gap-1.5">${icon('calculator', 'w-4 h-4')} เปิดรายงานภาษี</button>
    </div>

    <div class="tactile p-4 mb-4">
      <h3 class="text-sm font-bold mb-2 flex items-center gap-1.5">${icon('database', 'w-4 h-4 text-slate-500')} สำรอง/กู้คืนข้อมูล</h3>
      <p class="text-xs text-[var(--text-secondary)] mb-3">ข้อมูลทั้งหมด (ห้อง, ธุรกรรม, เอกสาร) เก็บอยู่ในเครื่องนี้เท่านั้น — Export เก็บไว้เป็นไฟล์สำรองสม่ำเสมอ</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" data-action="export-db" class="tactile-btn px-4 py-2 text-sm font-bold text-brand-600 flex items-center gap-1.5">${icon('download', 'w-4 h-4')} Export ข้อมูล</button>
        <button type="button" data-action="trigger-import-db" class="tactile-btn px-4 py-2 text-sm font-bold text-slate-600 flex items-center gap-1.5">${icon('upload', 'w-4 h-4')} Import ข้อมูล</button>
        <input type="file" accept="application/json" data-role="import-db-input" class="hidden" />
      </div>
    </div>

    <div class="tactile p-4 mb-4 border-t-4 border-t-red-500">
      <h3 class="text-sm font-bold mb-2 flex items-center gap-1.5 text-red-600">${icon('triangle-alert', 'w-4 h-4')} ล้างข้อมูลทั้งหมด</h3>
      <p class="text-xs text-[var(--text-secondary)] mb-3">ลบห้อง ธุรกรรม และเอกสารทั้งหมดถาวร — ทำได้เฉพาะตอนมีไฟล์สำรองแล้วเท่านั้น</p>
      <button type="button" data-action="open-reset-confirm" class="tactile-btn px-4 py-2 text-sm font-bold text-red-600 flex items-center gap-1.5">${icon('trash-2', 'w-4 h-4')} รีเซ็ตข้อมูล</button>
    </div>

    <p class="text-xs text-[var(--text-tertiary)] text-center">มี ${rooms.length} ห้อง · ${transactions.length} ธุรกรรม · เก็บข้อมูลแบบ Local-first ใน IndexedDB</p>
  `;
}

// ---------- Modal forms ----------

const INPUT_CLASS = 'tactile-inset w-full mt-1 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const BTN_PRIMARY = 'tactile-btn flex-1 text-brand-600 py-2 font-bold';
const BTN_SECONDARY = 'tactile-btn flex-1 text-[var(--text-secondary)] py-2 font-medium';
const FIELDSET_CLASS = 'p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] space-y-3';

function roomFormHtml(room) {
  const isNew = !room.id;
  const r = {
    id: '', roomNumber: '', tenantName: '', tenantPhone: '', tenantLineId: '',
    rentAmount: '', rentDueDay: 1, deposit: '', commonFee: '', contractStart: '', contractEnd: '', tenantNotes: '',
    loanMonthlyPayment: '', loanDueDay: 1, loanBalance: '', loanRate: '', loanBalanceAsOf: '',
    ...room,
  };

  return `
    <form id="roomForm" data-id="${r.id}" class="space-y-4">
      <h3 class="font-bold text-lg">${isNew ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${escapeHtml(r.roomNumber)}`}</h3>

      <label class="block text-sm">เลขห้อง
        <input name="roomNumber" required value="${escapeHtml(r.roomNumber)}" class="${INPUT_CLASS}" />
      </label>

      <fieldset class="${FIELDSET_CLASS}">
        <legend class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide px-1">ผู้เช่า</legend>
        <label class="block text-sm">ชื่อผู้เช่า (เว้นว่าง = ห้องว่าง)
          <input name="tenantName" value="${escapeHtml(r.tenantName || '')}" class="${INPUT_CLASS}" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">เบอร์โทร
            <input name="tenantPhone" type="tel" value="${escapeHtml(r.tenantPhone || '')}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">Line ID
            <input name="tenantLineId" value="${escapeHtml(r.tenantLineId || '')}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">ค่าเช่า/เดือน (บาท)
            <input name="rentAmount" type="number" min="0" value="${r.rentAmount ?? ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">วันครบกำหนดจ่ายเช่า (1-31)
            <input name="rentDueDay" type="number" min="1" max="31" value="${r.rentDueDay ?? ''}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">เงินมัดจำ (บาท)
            <input name="deposit" type="number" min="0" value="${r.deposit ?? ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">ค่าส่วนกลาง/ปี (บาท)
            <input name="commonFee" type="number" min="0" value="${r.commonFee ?? ''}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">เริ่มสัญญา
            <input name="contractStart" type="date" value="${r.contractStart || ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">สิ้นสุดสัญญา
            <input name="contractEnd" type="date" value="${r.contractEnd || ''}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <label class="block text-sm">หมายเหตุ
          <input name="tenantNotes" value="${escapeHtml(r.tenantNotes || '')}" class="${INPUT_CLASS}" placeholder="เช่น แจ้งย้ายออกสิ้นเดือน..." />
        </label>
      </fieldset>

      <fieldset class="${FIELDSET_CLASS}">
        <legend class="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide px-1">สินเชื่อธนาคาร</legend>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">ยอดผ่อนธนาคาร/เดือน (บาท)
            <input name="loanMonthlyPayment" type="number" min="0" value="${r.loanMonthlyPayment ?? ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">วันครบกำหนดผ่อนแบงก์ (1-31)
            <input name="loanDueDay" type="number" min="1" max="31" value="${r.loanDueDay ?? ''}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <p class="text-xs text-[var(--text-tertiary)]">กรอก 3 ช่องด้านล่างเพื่อให้ระบบคำนวณยอดหนี้คงเหลือ/ตารางผ่อนชำระอัตโนมัติ (ไม่บังคับ)</p>
        <div class="grid grid-cols-3 gap-3">
          <label class="block text-sm">ยอดหนี้คงเหลือ ณ เดือน
            <input name="loanBalance" type="number" min="0" value="${r.loanBalance ?? ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">อัตราดอกเบี้ย %/ปี
            <input name="loanRate" type="number" min="0" step="0.01" value="${r.loanRate ?? ''}" class="${INPUT_CLASS}" />
          </label>
          <label class="block text-sm">เดือนที่บันทึกยอด
            <input name="loanBalanceAsOf" type="month" value="${r.loanBalanceAsOf || ''}" class="${INPUT_CLASS}" />
          </label>
        </div>
      </fieldset>

      <div class="flex flex-wrap gap-2 pt-1">
        ${!isNew && r.tenantName ? `<button type="button" data-action="open-moveout" data-id="${r.id}" class="tactile-btn text-red-600 py-2 px-3 text-sm font-bold flex items-center gap-1.5">${icon('log-out', 'w-4 h-4')} ย้ายออก</button>` : ''}
        ${!isNew ? `<button type="button" data-action="open-tenant-history" data-id="${r.id}" class="tactile-btn text-[var(--text-secondary)] py-2 px-3 text-sm font-bold flex items-center gap-1.5">${icon('history', 'w-4 h-4')} ประวัติผู้เช่า</button>` : ''}
      </div>
      <div class="flex gap-2 pt-2">
        <button type="submit" class="${BTN_PRIMARY}">บันทึก</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </form>
  `;
}

function transactionFormHtml(rooms, transaction) {
  const t = transaction ?? { id: '', roomId: rooms[0]?.id, type: 'rent', month: currentMonthStr(), amount: '', status: 'unpaid', note: '', category: '' };
  return `
    <form id="transactionForm" data-id="${t.id}" class="space-y-3">
      <h3 class="font-bold text-lg mb-2">${transaction ? 'แก้ไข' : 'เพิ่ม'}ธุรกรรม</h3>
      <label class="block text-sm">ห้อง
        <select name="roomId" class="${INPUT_CLASS}">
          ${rooms.map((r) => `<option value="${r.id}" ${r.id === t.roomId ? 'selected' : ''}>ห้อง ${escapeHtml(r.roomNumber)}</option>`).join('')}
        </select>
      </label>
      <label class="block text-sm">ประเภท
        <select name="type" data-role="tx-form-type" class="${INPUT_CLASS}">
          <option value="rent" ${t.type === 'rent' ? 'selected' : ''}>ค่าเช่า</option>
          <option value="loan" ${t.type === 'loan' ? 'selected' : ''}>ผ่อนธนาคาร</option>
          <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>ค่าใช้จ่าย/ซ่อมบำรุง</option>
        </select>
      </label>
      <label class="block text-sm" data-role="tx-form-category-wrap" ${t.type === 'expense' ? '' : 'style="display:none"'}>หมวดหมู่ค่าใช้จ่าย
        <select name="category" class="${INPUT_CLASS}">
          <option value="">— ไม่ระบุ —</option>
          ${AppConfig.EXPENSE_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${t.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
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
        <button type="button" data-action="${confirmAction}" data-id="${confirmId ?? ''}" class="tactile-btn flex-1 text-red-600 py-2 font-bold">ลบ</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </div>
  `;
}

function moveOutFormHtml(room) {
  return `
    <form id="moveOutForm" data-id="${room.id}" class="space-y-4">
      <h3 class="font-bold text-lg">ย้ายออก — ห้อง ${escapeHtml(room.roomNumber)}</h3>
      <p class="text-sm text-[var(--text-secondary)]">ผู้เช่า: ${escapeHtml(room.tenantName || '')} · มัดจำ ${formatCurrency(room.deposit)}</p>
      <label class="block text-sm">วันที่ย้ายออก
        <input name="moveOutDate" type="date" value="${new Date().toISOString().split('T')[0]}" class="${INPUT_CLASS}" />
      </label>
      <fieldset>
        <legend class="block text-sm mb-1">สถานะเงินมัดจำ</legend>
        <div class="space-y-1.5">
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="depositStatus" value="returned" checked /> คืนครบแล้ว</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="depositStatus" value="deducted" /> หักค่าเสียหายบางส่วน</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="depositStatus" value="pending" /> ยังไม่คืน</label>
        </div>
      </fieldset>
      <div class="flex gap-2 pt-2">
        <button type="submit" class="tactile-btn flex-1 text-red-600 py-2 font-bold">ยืนยันย้ายออก</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ยกเลิก</button>
      </div>
    </form>
  `;
}

const DEPOSIT_STATUS_LABEL = { returned: 'คืนครบแล้ว', deducted: 'หักค่าเสียหาย', pending: 'ยังไม่คืน' };
const DEPOSIT_STATUS_TONE = { returned: 'bg-emerald-50 text-emerald-600', deducted: 'bg-amber-50 text-amber-600', pending: 'bg-red-50 text-red-600' };

function tenantHistoryHtml(room) {
  const history = room.tenantHistory || [];
  return `
    <div class="space-y-4">
      <h3 class="font-bold text-lg">ประวัติผู้เช่า — ห้อง ${escapeHtml(room.roomNumber)}</h3>
      ${history.length === 0
        ? '<p class="text-sm text-[var(--text-tertiary)] py-4 text-center">ยังไม่มีประวัติผู้เช่าเก่าค่ะ</p>'
        : `<ul class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            ${[...history].reverse().map((h) => `
              <li class="tactile-sm p-3 text-sm">
                <div class="flex justify-between items-start mb-1.5">
                  <span class="font-bold">${escapeHtml(h.name)}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${DEPOSIT_STATUS_TONE[h.depositStatus] || 'bg-slate-100 text-slate-500'}">${DEPOSIT_STATUS_LABEL[h.depositStatus] || '-'}</span>
                </div>
                <p class="text-xs text-[var(--text-secondary)]">เบอร์: ${escapeHtml(h.phone || '-')}</p>
                <p class="text-xs text-[var(--text-secondary)]">เข้า ${formatDateThai(h.contractStart)} — ออก ${formatDateThai(h.moveOutDate)}</p>
                <p class="text-xs text-[var(--text-secondary)]">มัดจำ ${formatCurrency(h.deposit)}</p>
              </li>`).join('')}
          </ul>`}
      <button type="button" data-action="close-modal" class="${BTN_SECONDARY} w-full">ปิด</button>
    </div>
  `;
}

function loanScheduleHtml(room, months) {
  const { schedule, totalMonths, currentBalance } = calcLoanSchedule(room, months);
  const payoffLabel = totalMonths > 0
    ? (() => {
        const now = new Date();
        let y = now.getFullYear();
        let m = now.getMonth() + 1 + totalMonths;
        y += Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
        return monthLabel(`${y}-${String(m).padStart(2, '0')}`);
      })()
    : '-';
  const totals = schedule.reduce((acc, row) => ({ interest: acc.interest + row.interest, principal: acc.principal + row.principal }), { interest: 0, principal: 0 });

  return `
    <div class="space-y-4">
      <h3 class="font-bold text-lg">ตารางผ่อนชำระ — ห้อง ${escapeHtml(room.roomNumber)}</h3>
      <p class="text-xs text-[var(--text-secondary)]">อัตราดอกเบี้ย ${room.loanRate}% ต่อปี</p>
      <div class="grid grid-cols-2 gap-3">
        <div class="tactile-sm p-3"><p class="text-xs text-[var(--text-secondary)]">ยอดคงเหลือปัจจุบัน</p><p class="font-black text-purple-600">${currentBalance !== null ? formatCurrency(currentBalance) : '-'}</p></div>
        <div class="tactile-sm p-3"><p class="text-xs text-[var(--text-secondary)]">คาดผ่อนหมดเดือน</p><p class="font-black">${payoffLabel}</p></div>
      </div>
      <div class="flex items-end gap-2">
        <label class="block text-sm flex-1">แสดงล่วงหน้า (เดือน)
          <input type="number" min="1" max="360" value="${months}" data-role="loan-schedule-months" class="${INPUT_CLASS}" />
        </label>
        <button type="button" data-action="refresh-loan-schedule" data-id="${room.id}" class="tactile-btn px-4 py-2 text-sm font-bold text-brand-600">คำนวณ</button>
      </div>
      <div class="max-h-[40vh] overflow-y-auto -mx-1 px-1">
        <table class="w-full text-xs">
          <thead><tr class="text-left text-[var(--text-tertiary)]"><th class="py-1">เดือน</th><th class="py-1 text-right">ดอกเบี้ย</th><th class="py-1 text-right">ตัดต้น</th><th class="py-1 text-right">คงเหลือ</th></tr></thead>
          <tbody>
            ${schedule.length === 0
              ? '<tr><td colspan="4" class="py-3 text-center text-[var(--text-tertiary)]">ไม่มีข้อมูล — กรอกข้อมูลสินเชื่อในฟอร์มแก้ไขห้องก่อนค่ะ</td></tr>'
              : schedule.map((row, i) => `
                <tr class="border-t border-black/5 dark:border-white/5 ${i === 0 ? 'font-bold text-purple-600' : ''}">
                  <td class="py-1.5">${monthLabel(row.month)}</td>
                  <td class="py-1.5 text-right text-red-500">${formatCurrency(row.interest)}</td>
                  <td class="py-1.5 text-right text-emerald-600">${formatCurrency(row.principal)}</td>
                  <td class="py-1.5 text-right">${formatCurrency(row.balance)}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex justify-between text-xs text-[var(--text-secondary)] pt-1 border-t border-black/5 dark:border-white/5">
        <span>รวมดอกเบี้ย ${formatCurrency(totals.interest)}</span>
        <span>รวมตัดต้น ${formatCurrency(totals.principal)}</span>
      </div>
      <button type="button" data-action="close-modal" class="${BTN_SECONDARY} w-full">ปิด</button>
    </div>
  `;
}

function documentVaultHtml(room, docs) {
  return `
    <div class="space-y-4">
      <h3 class="font-bold text-lg">คลังเอกสาร — ห้อง ${escapeHtml(room.roomNumber)}</h3>
      <label class="tactile-inset flex flex-col items-center justify-center gap-1.5 p-6 text-center cursor-pointer">
        ${icon('upload-cloud', 'w-8 h-8 text-[var(--text-tertiary)]')}
        <span class="text-sm font-bold">คลิกอัปโหลดรูปภาพ/เอกสาร</span>
        <span class="text-xs text-[var(--text-tertiary)]">รองรับ JPG, PNG ไม่เกินไฟล์ละ 5MB</span>
        <input type="file" accept="image/*" multiple data-role="doc-upload-input" data-id="${room.id}" class="hidden" />
      </label>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto">
        ${docs.length === 0
          ? '<p class="col-span-full text-center text-sm text-[var(--text-tertiary)] py-4">ยังไม่มีเอกสาร</p>'
          : docs.map((d) => `
            <div class="relative group">
              <img src="${d.data}" alt="${escapeHtml(d.name)}" class="w-full h-24 object-cover rounded-xl" />
              <button type="button" data-action="delete-document" data-id="${d.id}" data-room-id="${room.id}" title="ลบเอกสาร" class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow">${icon('x', 'w-3.5 h-3.5')}</button>
            </div>`).join('')}
      </div>
      <button type="button" data-action="close-modal" class="${BTN_SECONDARY} w-full">ปิด</button>
    </div>
  `;
}

function taxReportHtml(rooms, transactions, year) {
  const report = buildTaxReport(rooms, transactions, year);
  const yearOptions = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return `
    <div class="space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-bold text-lg">รายงานภาษีประจำปี</h3>
        <select data-role="tax-year-select" class="tactile-inset px-3 py-1.5 text-sm">
          ${yearOptions.map((y) => `<option value="${y}" ${String(y) === String(year) ? 'selected' : ''}>ปี ${y + 543}</option>`).join('')}
        </select>
      </div>
      <div id="taxReportBody" class="max-h-[50vh] overflow-y-auto -mx-1 px-1">
        <table class="w-full text-xs">
          <thead><tr class="text-left text-[var(--text-tertiary)]"><th class="py-1">ห้อง</th><th class="py-1">ผู้เช่า</th><th class="py-1 text-right">รายรับ</th><th class="py-1 text-right">รายจ่าย</th><th class="py-1 text-right">สุทธิ</th></tr></thead>
          <tbody>
            ${report.rows.map((row) => `
              <tr class="border-t border-black/5 dark:border-white/5">
                <td class="py-1.5 font-bold">${escapeHtml(row.roomNumber)}</td>
                <td class="py-1.5">${escapeHtml(row.tenantName || '-')}</td>
                <td class="py-1.5 text-right text-emerald-600">${formatCurrency(row.income)}</td>
                <td class="py-1.5 text-right text-red-500">${formatCurrency(row.expense)}</td>
                <td class="py-1.5 text-right font-bold ${row.net >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatCurrency(row.net)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-black/10 dark:border-white/10 font-bold">
              <td class="py-1.5" colspan="2">รวมทั้งหมด</td>
              <td class="py-1.5 text-right text-emerald-600">${formatCurrency(report.totalIncome)}</td>
              <td class="py-1.5 text-right text-red-500">${formatCurrency(report.totalExpense)}</td>
              <td class="py-1.5 text-right ${report.totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatCurrency(report.totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="tactile-sm p-3 text-xs space-y-1">
        <p class="font-bold mb-1">สรุปเพื่อยื่น ภ.ง.ด. 90 (เงินได้ประเภท 5)</p>
        <div class="flex justify-between"><span>รายได้ค่าเช่ารวม</span><span class="font-bold">${formatCurrency(report.totalIncome)}</span></div>
        <div class="flex justify-between"><span>หักค่าใช้จ่ายเหมา ${Math.round(AppConfig.TAX_DEDUCTION_RATE * 100)}%</span><span class="font-bold text-red-500">-${formatCurrency(report.deduction)}</span></div>
        <div class="flex justify-between border-t border-black/5 dark:border-white/5 pt-1"><span class="font-bold">รายได้สุทธิที่ต้องแจ้ง</span><span class="font-black text-emerald-600">${formatCurrency(report.netTaxable)}</span></div>
        <p class="text-[10px] text-[var(--text-tertiary)] pt-1">*หักค่าใช้จ่ายจริงได้หากมากกว่า 30% — ดูยอดรายจ่ายจริงจากตารางด้านบนประกอบการยื่นภาษี</p>
      </div>
      <div class="flex gap-2">
        <button type="button" data-action="print-tax-report" data-year="${year}" class="${BTN_PRIMARY}">${icon('printer', 'w-4 h-4')} พิมพ์รายงาน</button>
        <button type="button" data-action="close-modal" class="${BTN_SECONDARY}">ปิด</button>
      </div>
    </div>
  `;
}

function invoicePrintHtml(room, monthTx, month) {
  const docNo = `INV-${month.replace('-', '')}-${escapeHtml(room.roomNumber)}`;
  const today = new Date();
  return `
    <div style="max-width:800px;margin:0 auto;padding:24px;font-family:'Noto Sans Thai',sans-serif;color:#1e293b;">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:20px;">
        <div>
          <h1 style="font-size:24px;margin:0;">ใบแจ้งหนี้ค่าเช่า</h1>
          <p style="margin:4px 0 0;color:#64748b;">Rental Invoice</p>
        </div>
        <div style="text-align:right;font-size:14px;">
          <p style="margin:0;"><strong>เลขที่:</strong> ${docNo}</p>
          <p style="margin:4px 0 0;"><strong>วันที่:</strong> ${today.toLocaleDateString('th-TH')}</p>
          <p style="margin:4px 0 0;"><strong>งวดเดือน:</strong> ${monthLabel(month)}</p>
        </div>
      </div>
      <div style="margin-bottom:24px;font-size:14px;">
        <p style="margin:0;"><strong>ห้อง:</strong> ${escapeHtml(room.roomNumber)}</p>
        <p style="margin:4px 0 0;"><strong>ผู้เช่า:</strong> ${escapeHtml(room.tenantName || '-')}</p>
        <p style="margin:4px 0 0;"><strong>เบอร์ติดต่อ:</strong> ${escapeHtml(room.tenantPhone || '-')}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:10px;border:1px solid #cbd5e1;text-align:left;">รายการ</th><th style="padding:10px;border:1px solid #cbd5e1;text-align:right;width:150px;">จำนวนเงิน</th></tr></thead>
        <tbody><tr><td style="padding:10px;border:1px solid #cbd5e1;">ค่าเช่าห้องพักประจำเดือน</td><td style="padding:10px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(room.rentAmount)}</td></tr></tbody>
        <tfoot><tr><td style="padding:10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;">รวมทั้งสิ้น</td><td style="padding:10px;border:1px solid #cbd5e1;text-align:right;font-weight:bold;">${formatCurrency(room.rentAmount)}</td></tr></tfoot>
      </table>
      <p style="text-align:center;color:#64748b;margin-top:40px;">กรุณาชำระเงินภายในวันที่ ${room.rentDueDay} ของเดือน · ขอบคุณที่ใช้บริการค่ะ</p>
    </div>
  `;
}

function taxReportPrintHtml(rooms, transactions, year) {
  const report = buildTaxReport(rooms, transactions, year);
  return `
    <div style="max-width:800px;margin:0 auto;padding:24px;font-family:'Noto Sans Thai',sans-serif;color:#1e293b;">
      <h1 style="font-size:22px;margin:0 0 4px;">รายงานสรุปรายได้ค่าเช่า ปี ${year + 543}</h1>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px;">พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">ห้อง</th><th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">ผู้เช่า</th><th style="padding:8px;border:1px solid #cbd5e1;text-align:right;">รายรับ</th><th style="padding:8px;border:1px solid #cbd5e1;text-align:right;">รายจ่าย</th><th style="padding:8px;border:1px solid #cbd5e1;text-align:right;">สุทธิ</th></tr></thead>
        <tbody>
          ${report.rows.map((row) => `<tr><td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(row.roomNumber)}</td><td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(row.tenantName || '-')}</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(row.income)}</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(row.expense)}</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(row.net)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr style="font-weight:bold;background:#f8fafc;"><td style="padding:8px;border:1px solid #cbd5e1;" colspan="2">รวมทั้งหมด</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(report.totalIncome)}</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(report.totalExpense)}</td><td style="padding:8px;border:1px solid #cbd5e1;text-align:right;">${formatCurrency(report.totalNet)}</td></tr></tfoot>
      </table>
      <div style="font-size:13px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;">
        <p style="font-weight:bold;margin:0 0 8px;">สรุปเพื่อยื่น ภ.ง.ด. 90 (เงินได้ประเภท 5)</p>
        <p style="margin:2px 0;">รายได้ค่าเช่ารวม: ${formatCurrency(report.totalIncome)}</p>
        <p style="margin:2px 0;">หักค่าใช้จ่ายเหมา ${Math.round(AppConfig.TAX_DEDUCTION_RATE * 100)}%: -${formatCurrency(report.deduction)}</p>
        <p style="margin:2px 0;font-weight:bold;">รายได้สุทธิที่ต้องแจ้ง: ${formatCurrency(report.netTaxable)}</p>
      </div>
    </div>
  `;
}

// ---------- DOM-touching API ----------

// เก็บ instance ของกราฟไว้นอก UIRenderer — ต้อง .destroy() ก่อนสร้างใหม่ทุกครั้ง
// ไม่งั้น canvas เดิม (ที่ถูกลบไปแล้วตอน innerHTML เปลี่ยน) จะยังค้างอยู่ใน memory (leak)
let trendChartInstance = null;

export const UIRenderer = {
  renderView(viewName, data) {
    const container = document.getElementById('viewContainer');
    const renderers = {
      dashboard: renderDashboard,
      rooms: renderRooms,
      transactions: renderTransactions,
      reminders: renderReminders,
      settings: renderSettings,
    };
    container.innerHTML = (renderers[viewName] ?? renderDashboard)(data);
    lucide.createIcons(); // แปลง <i data-lucide="..."> ที่เพิ่งใส่เข้าไปให้กลายเป็น SVG จริง

    if (viewName === 'dashboard') {
      this.renderTrendChart(data.transactions, data.month);
      this.animateKpiNumbers();
    }
  },

  // นับตัวเลข KPI ขึ้นจาก 0 ตอนโหลดหน้า — เคารพ prefers-reduced-motion (คนที่ตั้งค่าลดแอนิเมชันไว้
  // จะเห็นตัวเลขสุดท้ายทันที ไม่ต้องรอนับ) เหมือนกติกาเดียวกับ SVG badge A(i)CODER
  animateKpiNumbers() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = 600;

    document.querySelectorAll('.kpi-value').forEach((el) => {
      const target = Number(el.dataset.target) || 0;
      if (reduceMotion) {
        el.textContent = formatCurrency(target);
        return;
      }

      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - (1 - progress) ** 3; // ease-out cubic — เริ่มเร็ว ค่อยๆ ชะลอตอนใกล้ถึงเป้า
        el.textContent = formatCurrency(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  },

  renderTrendChart(transactions, month) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    if (trendChartInstance) {
      trendChartInstance.destroy();
    }

    const { labels, rent, loan } = buildTrendData(transactions, month);
    trendChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'รายรับ (ค่าเช่า)', data: rent, backgroundColor: '#0d9488', borderRadius: 4 },
          { label: 'ผ่อนธนาคาร', data: loan, backgroundColor: '#9333ea', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(v) } },
        },
      },
    });
  },

  openRoomForm(room) {
    this.openModal(roomFormHtml(room ?? {}));
  },

  openTransactionForm(rooms, transaction) {
    this.openModal(transactionFormHtml(rooms, transaction));
  },

  openDeleteConfirm(message, action, id) {
    this.openModal(confirmDeleteHtml(message, action, id));
  },

  openMoveOutForm(room) {
    this.openModal(moveOutFormHtml(room));
  },

  openTenantHistory(room) {
    this.openModal(tenantHistoryHtml(room));
  },

  openLoanSchedule(room, months = 12) {
    this.openModal(loanScheduleHtml(room, months));
  },

  openDocumentVault(room, docs) {
    this.openModal(documentVaultHtml(room, docs));
  },

  openTaxReport(rooms, transactions, year) {
    this.openModal(taxReportHtml(rooms, transactions, year));
  },

  printInvoice(room, monthTx, month) {
    const printArea = document.getElementById('printArea');
    if (!printArea) return;
    printArea.innerHTML = invoicePrintHtml(room, monthTx, month);
    window.print();
  },

  printTaxReport(rooms, transactions, year) {
    const printArea = document.getElementById('printArea');
    if (!printArea) return;
    printArea.innerHTML = taxReportPrintHtml(rooms, transactions, year);
    window.print();
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
    lucide.createIcons({ root });
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
