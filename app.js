'use strict';
/* ============================================================
   منظومة إدارة ومتابعة المبادرات — منطق التطبيق
   يعتمد على storage.js (Store, DB, APP_CONFIG)
   ============================================================ */

/* ---------- بيانات المبادرات الأساسية (بدون أي أرقام افتراضية) ---------- */
const SEED_INITIATIVES = [
  ['الأرشفة الرقمية لمعاملات إثبات وتسجيل الملك', '3 أشهر', 'أرشفة وتدقيق 2,000+ معاملة بنسبة 100%'],
  ['تجويد وترشيق خدمات دائرة الإسكان', '3 أشهر', 'دليل 2026 والوصول لصفر مراجع حضوري'],
  ['تخطيط بدون التخطيط', '3 أشهر', 'استرداد وإعادة توظيف 1,000 أرض استثمارية'],
  ['حسم عقود الانتفاع بالأراضي الحكومية المنتهية', '3 أشهر', 'تصفير العقود المنتهية واسترداد المستحقات'],
  ['توحيد ومعالجة بيانات عقود الانتفاع', '3 أشهر', 'مطابقة 1,100+ عقد مع منصة أملاك'],
  ['التحول الرقمي لمعاملات قسم الإسكان الاجتماعي', '3 أشهر', 'أرشفة 10,000+ معاملة ورقية متراكمة'],
  ['من ملف مفتوح إلى قرار محسوم (التعويضات)', '3 أشهر', 'إنهاء كافة الملفات القائمة بقرارات معتمدة'],
  ['متابعة قياس الأداء وتكامل المبادرات', '3 أشهر', 'إصدار تقارير الجودة والمتابعة التجميعية']
];
// المدد القديمة الافتراضية (قبل اعتماد 3 أشهر لجميع المبادرات) — تُحدَّث تلقائيًا في البيانات القديمة ما لم يعدّلها المستخدم
const LEGACY_DURATIONS = {
  'الأرشفة الرقمية لمعاملات إثبات وتسجيل الملك': 'شهرين',
  'تجويد وترشيق خدمات دائرة الإسكان': '3 أشهر',
  'تخطيط بدون التخطيط': '3 أشهر',
  'حسم عقود الانتفاع بالأراضي الحكومية المنتهية': '3 أشهر',
  'توحيد ومعالجة بيانات عقود الانتفاع': 'شهرين',
  'التحول الرقمي لمعاملات قسم الإسكان الاجتماعي': '4 أشهر',
  'من ملف مفتوح إلى قرار محسوم (التعويضات)': '3 أشهر',
  'متابعة قياس الأداء وتكامل المبادرات': 'مستمرة'
};
const DEFAULT_DURATION = '3 أشهر';

const INIT_STATUS = ['لم تبدأ', 'قيد التنفيذ', 'متأخرة', 'مكتملة'];
const TASK_STATUS = ['لم تبدأ', 'قيد التنفيذ', 'مكتملة', 'متوقفة'];
const RISK_LEVELS = ['عالي', 'متوسط', 'منخفض'];
const RISK_STATUS = ['قائمة', 'قيد المعالجة', 'تم الحل'];
const BACKUP_WARN_DAYS = 7;
const WEEK_NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
const MAX_WEEKS = 52;
const weekLabel = i => 'الأسبوع ' + (i < WEEK_NAMES.length ? WEEK_NAMES[i] : (i + 1));
// الأسابيع قابلة للتمديد: ستة كحد أدنى، وتزداد عند تمديد مدة المبادرة
const toWeeks = v => Array.from({ length: clamp(Array.isArray(v) ? v.length : 0, 6, MAX_WEEKS) }, (_, i) => Math.max(0, num(Array.isArray(v) ? v[i] : 0)));
const sumWeeks = it => (it.weeks || []).reduce((a, b) => a + b, 0);
function applyProgressRules(it) {
  if (it.progress >= 100) it.status = 'مكتملة';
  else if (it.status === 'مكتملة') it.status = 'قيد التنفيذ';
  else if (it.progress > 0 && it.status === 'لم تبدأ') it.status = 'قيد التنفيذ';
}
// عند تحديد العدد المستهدف تُحسب نسبة الإنجاز تلقائيًا من مجموع الأسابيع
function recalc(it) {
  if (it.targetCount > 0) it.progress = clamp(Math.round(sumWeeks(it) / it.targetCount * 100), 0, 100);
  applyProgressRules(it);
}

function emptyState() {
  return {
    schema: 2,
    initiatives: SEED_INITIATIVES.map((r, i) => ({
      id: i + 1, code: '', name: r[0], target: r[2], targetCount: 0, unit: 'ملف', duration: r[1], extension: '', leader: 'غير محدد', members: [],
      weeks: [0, 0, 0, 0, 0, 0], notes: '', noteColors: [], supervisor: '', follower: '', progress: 0, status: 'لم تبدأ'
    })),
    tasks: [], field: [], financial: [], risks: [],
    meta: { createdAt: new Date().toISOString(), updatedAt: null, lastBackupAt: null, touched: false }
  };
}

/* ---------- أدوات مساعدة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtMoney = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtInt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stampTime = (d = new Date()) => `${stamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/* ---------- الملاحظات الملوّنة ---------- */
// كل سطر في notes ملاحظة مستقلة، ولونها في noteColors بنفس الترتيب ('' = اللون الافتراضي)
const NOTE_COLORS = [
  ['', 'افتراضي', '#2d3748'], ['#c53030', 'أحمر'], ['#2f855a', 'أخضر'], ['#2b6cb0', 'أزرق'],
  ['#c05621', 'برتقالي'], ['#6b46c1', 'بنفسجي'], ['#b7791f', 'ذهبي'], ['#d53f8c', 'وردي'], ['#718096', 'رمادي']
];
const noteLines = it => String(it.notes || '').split('\n').map((t, i) => ({ t: t.trim(), c: (it.noteColors || [])[i] || '' })).filter(l => l.t);
const noteClean = t => t.replace(/^[*•\-–]+\s*/, '');
function notesListHtml(it, cls = 'note-list') {
  const lines = noteLines(it);
  if (!lines.length) return '<span class="text-muted">—</span>';
  return `<ul class="${cls}">${lines.map(l => `<li style="--nc:${l.c || '#4a5568'};${l.c ? `color:${l.c};font-weight:700` : ''}">${esc(noteClean(l.t))}</li>`).join('')}</ul>`;
}
function noteRowHtml(t = '', c = '') {
  const sw = NOTE_COLORS.map(([v, n, d]) => `<button type="button" class="sw${v === c ? ' active' : ''}" data-sw="${v}" style="background:${v || d}" title="${n}" aria-label="${n}"></button>`).join('');
  const custom = c && !NOTE_COLORS.some(x => x[0] === c);
  return `<div class="note-row" data-color="${esc(c)}" style="--nc:${c || '#cbd5e0'}">
    <div class="d-flex align-items-center gap-1 mb-1 flex-wrap">${sw}
      <label class="sw sw-custom${custom ? ' active' : ''}" title="لون آخر" ${custom ? `style="background:${c}"` : ''}><i class="fa-solid fa-palette"></i><input type="color" data-swc value="${c || '#000000'}"></label>
      <span class="ms-auto d-flex gap-1">
        <button type="button" class="btn btn-sm btn-light border py-0 px-2" data-mvnote="-1" title="أعلى"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="btn btn-sm btn-light border py-0 px-2" data-mvnote="1" title="أسفل"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" data-rmnote title="حذف الملاحظة"><i class="fa-solid fa-xmark"></i></button>
      </span></div>
    <textarea class="form-control form-control-sm note-text" rows="2" style="${c ? `color:${c};font-weight:700` : ''}" placeholder="اكتب الملاحظة...">${esc(t)}</textarea></div>`;
}
function setNoteColor(row, c) {
  row.dataset.color = c; row.style.setProperty('--nc', c || '#cbd5e0');
  const ta = $('.note-text', row); ta.style.color = c || ''; ta.style.fontWeight = c ? '700' : '';
  $$('.sw', row).forEach(b => b.classList.toggle('active', b.dataset.sw === c));
  const cu = $('.sw-custom', row), isCustom = c && !NOTE_COLORS.some(x => x[0] === c);
  cu.classList.toggle('active', !!isCustom); cu.style.background = isCustom ? c : '';
}

/* ---------- الحالة العامة ---------- */
let S = emptyState();
let canSave = true;
let saveTimer = null;
const queries = {};        // نص البحث لكل قسم
let barChart = null, pieChart = null;

const initName = id => {
  if (id === '' || id == null) return '—';
  const it = S.initiatives.find(i => String(i.id) === String(id));
  return it ? it.name : '(مبادرة محذوفة)';
};

/* ---------- قوائم الأسماء (أعضاء المبادرة) ---------- */
function toList(v) {
  const parts = Array.isArray(v) ? v : String(v ?? '').split(/[\n,،;؛]+/);
  const seen = new Set();
  return parts.map(x => String(x).trim()).filter(x => x && !seen.has(x) && seen.add(x));
}
// كل الأسماء المعروفة (مسؤولون + أعضاء) لاقتراحها عند إسناد المهام
function knownPeople() {
  const set = new Set();
  S.initiatives.forEach(i => { if (i.leader && i.leader !== 'غير محدد') set.add(i.leader); (i.members || []).forEach(m => set.add(m)); });
  S.tasks.forEach(t => t.employee && set.add(t.employee));
  return Array.from(set);
}

/* ---------- تطبيع البيانات (للتحميل والاستيراد) ---------- */
function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const legacy = !(raw.schema >= 2);
  const arr = k => Array.isArray(raw[k]) ? raw[k].filter(x => x && typeof x === 'object') : [];
  const out = {
    schema: 2,
    initiatives: arr('initiatives').map((x, i) => ({
      id: isFinite(+x.id) && +x.id > 0 ? +x.id : i + 1,
      code: String(x.code ?? ''), name: String(x.name ?? ''), leader: String(x.leader ?? 'غير محدد'), members: toList(x.members), duration: (legacy && LEGACY_DURATIONS[x.name] === String(x.duration ?? '')) ? DEFAULT_DURATION : String(x.duration ?? ''), extension: String(x.extension ?? ''),
      target: String(x.target ?? ''), targetCount: Math.max(0, num(x.targetCount)), unit: String(x.unit ?? 'ملف') || 'ملف', weeks: toWeeks(x.weeks),
      notes: String(x.notes ?? ''), noteColors: Array.isArray(x.noteColors) ? x.noteColors.map(c => isHex(c) ? c : '') : [],
      supervisor: String(x.supervisor ?? ''), follower: String(x.follower ?? ''), progress: clamp(num(x.progress), 0, 100),
      status: INIT_STATUS.includes(x.status) ? x.status : 'لم تبدأ'
    })),
    tasks: arr('tasks').map(x => ({
      id: String(x.id ?? uid()), initiativeId: x.initiativeId ?? '', title: String(x.title ?? ''), employee: String(x.employee ?? ''),
      productivity: String(x.productivity ?? ''), status: TASK_STATUS.includes(x.status) ? x.status : 'لم تبدأ'
    })),
    field: arr('field').map(x => ({
      id: String(x.id ?? uid()), parcelNo: String(x.parcelNo ?? ''), initiativeId: x.initiativeId ?? '', usage: String(x.usage ?? ''),
      area: num(x.area), occupancy: String(x.occupancy ?? ''), notes: String(x.notes ?? ''),
      images: Array.isArray(x.images) ? x.images.filter(s => typeof s === 'string' && s.startsWith('data:image/')) : []
    })),
    financial: arr('financial').map(x => ({
      id: String(x.id ?? uid()), fileNo: String(x.fileNo ?? ''), party: String(x.party ?? ''), type: String(x.type ?? ''),
      due: Math.max(0, num(x.due)), collected: Math.max(0, num(x.collected))
    })),
    risks: arr('risks').map(x => ({
      id: String(x.id ?? uid()), initiativeId: x.initiativeId ?? '', challenge: String(x.challenge ?? ''),
      level: RISK_LEVELS.includes(x.level) ? x.level : 'متوسط', action: String(x.action ?? ''),
      status: RISK_STATUS.includes(x.status) ? x.status : 'قائمة'
    })),
    meta: Object.assign({}, base.meta, (raw.meta && typeof raw.meta === 'object') ? raw.meta : {})
  };
  out.initiatives.forEach(it => { if (it.targetCount > 0) recalc(it); });
  if (!Array.isArray(raw.initiatives)) out.initiatives = base.initiatives;   // ملف بلا مبادرات: نبدأ بالثماني الأساسية
  return out;
}

/* ---------- الحفظ ---------- */
function setSaveState(text, cls) {
  const el = $('#saveState'); if (!el) return;
  el.textContent = text; el.className = 'small d-none d-md-inline ' + (cls || 'text-white-50');
}
function markDirty() { S.meta.touched = true; S.meta.updatedAt = new Date().toISOString(); scheduleSave(); }
function scheduleSave() {
  if (!canSave) return;
  setSaveState('جارٍ الحفظ...', 'text-white-50');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
async function saveNow() {
  clearTimeout(saveTimer);
  if (!canSave) return;
  try {
    await Store.save(S);
    setSaveState('تم الحفظ ' + hhmm(), 'text-success');
    scheduleAutoBackup();
  } catch (e) {
    console.error(e);
    setSaveState('تعذّر الحفظ', 'text-danger');
    toast('تعذّر حفظ البيانات: ' + (e && e.message ? e.message : 'خطأ غير معروف') + ' — خذ نسخة احتياطية الآن.', 'danger');
  }
}
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow(); });

/* ---------- إشعارات ---------- */
function toast(msg, type = 'success', ms = 4500) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `alert alert-${type} shadow-sm py-2 px-3 mb-2`;
  el.setAttribute('role', 'alert');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- تعريف الحقول لكل قسم ---------- */
const SCHEMAS = {
  initiatives: {
    title: 'مبادرة',
    fields: [
      { k: 'code', l: 'رقم المبادرة', t: 'text', ph: 'اتركه فارغًا للترقيم التلقائي' },
      { k: 'name', l: 'اسم المبادرة', t: 'text', req: true },
      { k: 'target', l: 'هدف المبادرة', t: 'textarea' },
      { k: 'targetCount', l: 'العدد المستهدف', t: 'number', min: 0, step: 1, blank0: true },
      { k: 'unit', l: 'وحدة العدد', t: 'text', ph: 'ملف / ورقة / معاملة / عقد ...' },
      { k: 'duration', l: 'مدة المبادرة', t: 'text', ph: 'مثال: 3 أشهر' },
      { k: 'extension', l: 'تمديد مدة المبادرة إلى', t: 'text', ph: 'اتركه فارغًا إن لم تُمدَّد — مثال: 5 أشهر' },
      { k: 'leader', l: 'رئيس الفريق', t: 'text' },
      { k: 'members', l: 'أعضاء الفريق', t: 'list', ph: 'اكتب اسم كل عضو في سطر مستقل' },
      { k: 'weeks', l: 'العدد المنجز أسبوعيًا', t: 'weeks' },
      { k: 'status', l: 'الحالة', t: 'select', opts: INIT_STATUS },
      { k: 'progress', l: 'نسبة الإنجاز (%) — يدوية عند عدم تحديد العدد المستهدف', t: 'number', min: 0, max: 100, step: 1 },
      { k: 'notes', l: 'الملاحظات (لكل ملاحظة لون تختاره)', t: 'cnotes' },
      { k: 'supervisor', l: 'المشرف العام على المبادرة', t: 'text' },
      { k: 'follower', l: 'مسؤول المتابعة', t: 'text' }
    ],
    blank: () => ({ code: '', name: '', target: '', targetCount: 0, unit: 'ملف', duration: '', extension: '', leader: '', members: [], weeks: [0, 0, 0, 0, 0, 0], status: 'لم تبدأ', progress: 0, notes: '', noteColors: [], supervisor: '', follower: '' })
  },
  tasks: {
    title: 'مهمة',
    fields: [
      { k: 'initiativeId', l: 'المبادرة المرتبطة', t: 'init' },
      { k: 'title', l: 'المهمة الفرعية', t: 'text', req: true },
      { k: 'employee', l: 'الموظف المسؤول', t: 'text', dl: true },
      { k: 'productivity', l: 'الإنتاجية اليومية', t: 'text', ph: 'مثال: 120 ملف / يوم' },
      { k: 'status', l: 'حالة المهمة', t: 'select', opts: TASK_STATUS }
    ],
    blank: () => ({ initiativeId: '', title: '', employee: '', productivity: '', status: 'لم تبدأ' })
  },
  field: {
    title: 'معاينة ميدانية',
    fields: [
      { k: 'parcelNo', l: 'رقم القطعة / العقد', t: 'text', req: true },
      { k: 'initiativeId', l: 'المبادرة', t: 'init' },
      { k: 'usage', l: 'الاستخدام', t: 'text', ph: 'سكني / تجاري / صناعي / زراعي ...' },
      { k: 'area', l: 'المساحة (م²)', t: 'number', min: 0, step: 'any' },
      { k: 'occupancy', l: 'حالة الإشغال الفعلي', t: 'text', ph: 'مستغل / غير مستغل ...' },
      { k: 'notes', l: 'التقرير الميداني (ملاحظات)', t: 'textarea' },
      { k: 'images', l: 'صور المعاينة', t: 'images' }
    ],
    blank: () => ({ parcelNo: '', initiativeId: '', usage: '', area: '', occupancy: '', notes: '', images: [] })
  },
  financial: {
    title: 'مستحق مالي',
    fields: [
      { k: 'fileNo', l: 'رقم الملف / العقد', t: 'text', req: true },
      { k: 'party', l: 'الجهة / المنتفع', t: 'text', req: true },
      { k: 'type', l: 'نوع المستحق', t: 'text', ph: 'متأخرات رسوم انتفاع / غرامات ...' },
      { k: 'due', l: 'المبلغ المستحق (ر.ع)', t: 'number', min: 0, step: '0.001', req: true },
      { k: 'collected', l: 'المبلغ المحصل (ر.ع)', t: 'number', min: 0, step: '0.001' }
    ],
    blank: () => ({ fileNo: '', party: '', type: '', due: '', collected: 0 })
  },
  risks: {
    title: 'خطر / تحدٍّ',
    fields: [
      { k: 'initiativeId', l: 'المبادرة المعنية', t: 'init' },
      { k: 'challenge', l: 'التحدي / الخطر الميداني', t: 'textarea', req: true },
      { k: 'level', l: 'مستوى الخطورة', t: 'select', opts: RISK_LEVELS },
      { k: 'action', l: 'الإجراء التصحيحي / الحل', t: 'textarea' },
      { k: 'status', l: 'الحالة', t: 'select', opts: RISK_STATUS }
    ],
    blank: () => ({ initiativeId: '', challenge: '', level: 'متوسط', action: '', status: 'قائمة' })
  }
};

/* ---------- حالات محسوبة ---------- */
function payState(r) {
  if (r.due > 0 && r.collected >= r.due) return { txt: 'تم التحصيل بالكامل', cls: 'bg-success' };
  if (r.collected > 0) return { txt: 'تحصيل جزئي', cls: 'bg-warning text-dark' };
  return { txt: 'لم يُحصَّل', cls: 'bg-secondary' };
}
const taskBadge = s => ({ 'مكتملة': 'bg-success', 'قيد التنفيذ': 'bg-warning text-dark', 'متوقفة': 'bg-danger', 'لم تبدأ': 'bg-secondary' }[s] || 'bg-secondary');
const initBadge = s => ({ 'مكتملة': 'bg-success', 'قيد التنفيذ': 'bg-primary', 'متأخرة': 'bg-danger', 'لم تبدأ': 'bg-secondary' }[s] || 'bg-secondary');
const riskBadge = l => ({ 'عالي': 'badge-risk-high', 'متوسط': 'badge-risk-med', 'منخفض': 'badge-risk-low' }[l] || 'badge-risk-med');

/* ---------- البحث ---------- */
function matches(section, obj) {
  const q = (queries[section] || '').trim().toLowerCase();
  if (!q) return true;
  const hay = Object.values(obj).filter(v => typeof v !== 'object').join(' ') + ' ' + initName(obj.initiativeId);
  return hay.toLowerCase().includes(q);
}

/* ---------- الرسم ---------- */
const empty = (cols, msg) => `<tr><td colspan="${cols}" class="text-center text-muted py-4">${msg}</td></tr>`;
const actions = (section, id, extra = '') => `
  <td class="text-nowrap no-print">${extra}
    <button class="btn btn-sm btn-outline-primary" data-edit="${section}" data-id="${esc(id)}" type="button" title="تعديل" aria-label="تعديل"><i class="fa-solid fa-pen"></i></button>
    <button class="btn btn-sm btn-outline-danger" data-del="${section}" data-id="${esc(id)}" type="button" title="حذف" aria-label="حذف"><i class="fa-solid fa-trash"></i></button>
  </td>`;

function renderInitiatives() {
  const tb = $('#tb-initiatives');
  if (!S.initiatives.length) { tb.innerHTML = empty(8, 'لا توجد مبادرات مسجلة — اضغط «إضافة مبادرة»'); return; }
  tb.innerHTML = S.initiatives.map((it, idx) => {
    const total = sumWeeks(it), auto = it.targetCount > 0, unit = esc(it.unit);
    const detailBtn = `<button class="btn btn-sm btn-outline-secondary" data-detail="${it.id}" type="button" title="التفاصيل" aria-label="التفاصيل"><i class="fa-solid fa-eye"></i></button> `;
    return `
    <tr>
      <td class="fw-bold">${esc(it.code || idx + 1)}</td>
      <td>
        <div class="fw-bold text-dark">${esc(it.name)}</div>
        ${it.target ? `<div class="small text-muted">${esc(it.target)}</div>` : ''}
        <span class="badge ${initBadge(it.status)} mt-1">${esc(it.status)}</span>
      </td>
      <td>
        <div class="small fw-bold text-secondary"><i class="fa-solid fa-user-tie me-1"></i>${esc(it.leader)}</div>
        ${it.members.length ? `<div class="mt-1 d-flex flex-wrap gap-1">${it.members.map(m => `<span class="badge bg-light text-dark border fw-normal">${esc(m)}</span>`).join('')}</div>` : ''}
      </td>
      <td><span class="badge bg-light text-dark border ${it.extension ? 'text-decoration-line-through' : ''}">${esc(it.duration)}</span>${it.extension ? `<div class="mt-1"><span class="badge bg-warning text-dark">ممدّدة إلى ${esc(it.extension)}</span></div>` : ''}</td>
      <td class="small">${auto ? `<b>${fmtInt(total)}</b> / ${fmtInt(it.targetCount)} ${unit}` : (total > 0 ? `<b>${fmtInt(total)}</b> ${unit} منجز` : '<span class="text-muted">—</span>')}</td>
      <td>
        <div class="progress" style="height:10px" role="progressbar" aria-valuenow="${it.progress}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar bg-primary" style="width:${it.progress}%"></div>
        </div>
        <div class="small text-muted mt-1">${fmtInt(it.progress)}%</div>
      </td>
      <td class="no-print">
        <div class="input-group input-group-sm" style="width:105px">
          <input type="number" class="form-control text-center" value="${it.progress}" min="0" max="100" step="1" data-progress="${it.id}" aria-label="نسبة الإنجاز" ${auto ? 'readonly title="تُحسب تلقائيًا من العدد المنجز"' : ''}>
          <span class="input-group-text">%</span>
        </div>
      </td>
      ${actions('initiatives', it.id, detailBtn)}
    </tr>`;
  }).join('');
}

function renderTasks() {
  const rows = S.tasks.filter(r => matches('tasks', r));
  $('#tb-tasks').innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(initName(r.initiativeId))}</td>
      <td>${esc(r.title)}</td>
      <td>${esc(r.employee)}</td>
      <td>${esc(r.productivity)}</td>
      <td><span class="badge ${taskBadge(r.status)}">${esc(r.status)}</span></td>
      ${actions('tasks', r.id)}
    </tr>`).join('') : empty(6, S.tasks.length ? 'لا نتائج مطابقة للبحث' : 'لا توجد مهام — اضغط «إضافة مهمة»');
}

function renderField() {
  const rows = S.field.filter(r => matches('field', r));
  $('#tb-field').innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td class="fw-bold">${esc(r.parcelNo)}</td>
      <td>${esc(initName(r.initiativeId))}</td>
      <td>${esc(r.usage)}</td>
      <td>${r.area ? fmtInt(r.area) + ' م²' : ''}</td>
      <td>${esc(r.occupancy)}</td>
      <td>
        ${r.notes ? `<div class="clip-2 small mb-1">${esc(r.notes)}</div>` : ''}
        <div class="d-flex gap-1 flex-wrap">${r.images.slice(0, 3).map((src, i) => `<img class="thumb" src="${src}" alt="صورة" data-view="${esc(r.id)}" data-idx="${i}">`).join('')}
        ${r.images.length > 3 ? `<button class="btn btn-sm btn-outline-secondary" type="button" data-view="${esc(r.id)}" data-idx="3">+${r.images.length - 3}</button>` : ''}</div>
      </td>
      ${actions('field', r.id)}
    </tr>`).join('') : empty(7, S.field.length ? 'لا نتائج مطابقة للبحث' : 'لا توجد معاينات — اضغط «إضافة معاينة»');
}

function renderFinancial() {
  const rows = S.financial.filter(r => matches('financial', r));
  $('#tb-financial').innerHTML = rows.length ? rows.map(r => {
    const st = payState(r), rest = Math.max(0, r.due - r.collected);
    return `<tr>
      <td class="fw-bold">${esc(r.fileNo)}</td>
      <td>${esc(r.party)}</td>
      <td>${esc(r.type)}</td>
      <td>${fmtMoney(r.due)}</td>
      <td>${fmtMoney(r.collected)}</td>
      <td class="${rest > 0 ? 'text-danger' : 'text-success'}">${fmtMoney(rest)}</td>
      <td><span class="badge ${st.cls}">${st.txt}</span></td>
      ${actions('financial', r.id)}
    </tr>`;
  }).join('') : empty(8, S.financial.length ? 'لا نتائج مطابقة للبحث' : 'لا توجد مستحقات — اضغط «إضافة مستحق»');
  const due = S.financial.reduce((a, r) => a + r.due, 0), col = S.financial.reduce((a, r) => a + r.collected, 0);
  $('#tf-financial').innerHTML = S.financial.length ? `<tr><td colspan="3">الإجمالي (كل السجلات)</td><td>${fmtMoney(due)}</td><td>${fmtMoney(col)}</td><td>${fmtMoney(Math.max(0, due - col))}</td><td colspan="2"></td></tr>` : '';
}

function renderRisks() {
  const rows = S.risks.filter(r => matches('risks', r));
  $('#tb-risks').innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(initName(r.initiativeId))}</td>
      <td>${esc(r.challenge)}</td>
      <td><span class="badge ${riskBadge(r.level)}">${esc(r.level)}</span></td>
      <td>${esc(r.action)}</td>
      <td>${esc(r.status)}</td>
      ${actions('risks', r.id)}
    </tr>`).join('') : empty(6, S.risks.length ? 'لا نتائج مطابقة للبحث' : 'لا توجد مخاطر — اضغط «إضافة خطر»');
}

function renderMetrics() {
  const n = S.initiatives.length;
  const avg = n ? Math.round(S.initiatives.reduce((a, i) => a + i.progress, 0) / n) : 0;
  const due = S.financial.reduce((a, r) => a + r.due, 0), col = S.financial.reduce((a, r) => a + r.collected, 0);
  $('#total-initiatives-text').textContent = n;
  $('#overall-progress-text').textContent = avg + '%';
  $('#total-revenue-text').textContent = fmtMoney(col) + ' ر.ع';
  $('#revenue-sub').textContent = due > 0 ? 'من أصل ' + fmtMoney(due) + ' ر.ع مستحقة' : '';
  $('#high-risks-count').textContent = S.risks.filter(r => r.level === 'عالي' && r.status !== 'تم الحل').length;
  $('#cnt-tasks').textContent = S.tasks.length;
  $('#cnt-field').textContent = S.field.length;
  $('#cnt-financial').textContent = S.financial.length;
  $('#cnt-risks').textContent = S.risks.length;
  ['tasks', 'field', 'financial', 'risks'].forEach(k => $('#' + k).classList.toggle('print-empty', !S[k].length));   // لا تُطبع الأقسام الفارغة
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  try {
    Chart.defaults.font.family = "'Tajawal', sans-serif";
    const labels = S.initiatives.map((_, i) => 'مبادرة ' + (i + 1));
    const data = S.initiatives.map(i => i.progress);
    if (!barChart) {
      barChart = new Chart($('#initiativesBarChart'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'نسبة الإنجاز الفعلية (%)', data, backgroundColor: '#2b6cb0', borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, max: 100 } },
          plugins: { tooltip: { callbacks: { title: items => S.initiatives[items[0].dataIndex]?.name || '' } } }
        }
      });
    } else {
      barChart.data.labels = labels; barChart.data.datasets[0].data = data; barChart.update();
    }
    const cnt = { 'مكتملة': 0, 'قيد التنفيذ': 0, 'متأخرة': 0, 'لم تبدأ': 0 };
    S.initiatives.forEach(i => { cnt[i.progress >= 100 ? 'مكتملة' : i.status === 'مكتملة' ? 'قيد التنفيذ' : i.status]++; });
    const pdata = Object.values(cnt);
    if (!pieChart) {
      pieChart = new Chart($('#statusPieChart'), {
        type: 'doughnut',
        data: { labels: Object.keys(cnt), datasets: [{ data: pdata, backgroundColor: ['#38a169', '#d69e2e', '#e53e3e', '#a0aec0'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    } else { pieChart.data.datasets[0].data = pdata; pieChart.update(); }
  } catch (e) { console.warn('Charts:', e); }
}

function renderAll() {
  renderInitiatives(); renderTasks(); renderField(); renderFinancial(); renderRisks();
  renderMetrics(); renderCharts(); renderBackupAlert();
}

/* ---------- الإضافة والتعديل ---------- */
let formCtx = null;   // { section, id|null, images:[] }
let formModal, imgModal;

function initOptions(selected) {
  return `<option value="">— بدون —</option>` + S.initiatives.map((i, k) =>
    `<option value="${esc(i.id)}" ${String(i.id) === String(selected) ? 'selected' : ''}>${k + 1}. ${esc(i.name)}</option>`).join('');
}
function weekInputHtml(k, v) {
  return `<div class="col-6 col-md-4"><label class="form-label small mb-1" for="f_w${k}">${weekLabel(k)}</label><input type="number" inputmode="numeric" min="0" step="1" class="form-control" id="f_w${k}" name="w${k}" value="${esc(v ? v : '')}"></div>`;
}
function fieldHtml(f, val) {
  if (f.t === 'weeks') {
    const n = Math.max(6, (val || []).length);
    return `<div class="mb-3"><label class="form-label fw-bold">${esc(f.l)}</label><div class="row g-2" id="weeksRow">` +
      Array.from({ length: n }, (_, k) => weekInputHtml(k, val && val[k])).join('') +
      `</div><div class="d-flex gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-primary" data-addweek><i class="fa-solid fa-plus me-1"></i>إضافة أسبوع (تمديد)</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-rmweek><i class="fa-solid fa-minus me-1"></i>حذف آخر أسبوع</button>
      </div><div class="form-text">يُجمع المنجز تلقائيًا، وتُحسب نسبة الإنجاز منه إذا حددت العدد المستهدف. عند تمديد المدة أضف أسابيع جديدة.</div></div>`;
  }
  if (f.t === 'cnotes') {
    const it = { notes: val, noteColors: formCtx && formCtx.noteColors || [] };
    const lines = noteLines(it);
    return `<div class="mb-3"><label class="form-label fw-bold">${esc(f.l)}</label>
      <div id="notesList">${(lines.length ? lines : [{ t: '', c: '' }]).map(l => noteRowHtml(l.t, l.c)).join('')}</div>
      <button type="button" class="btn btn-sm btn-outline-primary" data-addnote><i class="fa-solid fa-plus me-1"></i>إضافة ملاحظة</button>
      <div class="form-text">اختر لون كل ملاحظة من الدوائر الملونة. عند لصق عدة أسطر دفعة واحدة تُقسَّم تلقائيًا إلى ملاحظات.</div></div>`;
  }
  const id = 'f_' + f.k, lab = `<label class="form-label fw-bold" for="${id}">${esc(f.l)}${f.req ? ' <span class="text-danger">*</span>' : ''}</label>`;
  let ctl = '';
  if (f.t === 'text') ctl = `<input class="form-control" id="${id}" name="${f.k}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${f.dl ? 'list="dl_people" autocomplete="off"' : ''} ${f.req ? 'required' : ''}>` + (f.dl ? `<datalist id="dl_people">${knownPeople().map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : '');
  else if (f.t === 'list') ctl = `<textarea class="form-control" id="${id}" name="${f.k}" rows="4" placeholder="${esc(f.ph || '')}">${esc((Array.isArray(val) ? val : []).join('\n'))}</textarea><div class="form-text">اسم واحد في كل سطر (أو افصل بفاصلة).</div>`;
  else if (f.t === 'textarea') ctl = `<textarea class="form-control" id="${id}" name="${f.k}" rows="3" ${f.req ? 'required' : ''}>${esc(val)}</textarea>`;
  else if (f.t === 'number') ctl = `<input type="number" inputmode="decimal" class="form-control" id="${id}" name="${f.k}" value="${esc(f.blank0 && !val ? '' : val)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step ?? 'any'}" ${f.req ? 'required' : ''}>`;
  else if (f.t === 'select') ctl = `<select class="form-select" id="${id}" name="${f.k}">${f.opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.t === 'init') ctl = `<select class="form-select" id="${id}" name="${f.k}">${initOptions(val)}</select>`;
  else if (f.t === 'images') ctl = `<input type="file" class="form-control" id="${id}" accept="image/*" multiple><div class="form-text">تُضغط الصور تلقائيًا لتوفير المساحة (بحد أقصى 10 صور).</div><div id="imgPreview" class="d-flex flex-wrap gap-2 mt-2"></div>`;
  return `<div class="mb-3">${lab}${ctl}<div class="invalid-feedback">هذا الحقل مطلوب</div></div>`;
}
function renderImgPreview() {
  const box = $('#imgPreview'); if (!box || !formCtx) return;
  box.innerHTML = formCtx.images.map((src, i) => `
    <div class="position-relative"><img class="thumb-lg" src="${src}" alt="">
    <button type="button" class="btn btn-danger btn-sm position-absolute top-0 start-0 py-0 px-1" data-rmimg="${i}" aria-label="حذف الصورة">&times;</button></div>`).join('');
}
function openForm(section, id) {
  const sc = SCHEMAS[section];
  const rec = id != null ? S[section].find(r => String(r.id) === String(id)) : null;
  const val = rec ? rec : sc.blank();
  formCtx = { section, id: rec ? rec.id : null, images: rec && rec.images ? rec.images.slice() : [], noteColors: rec && rec.noteColors ? rec.noteColors.slice() : [] };
  $('#formTitle').textContent = (rec ? 'تعديل ' : 'إضافة ') + sc.title;
  $('#formBody').innerHTML = sc.fields.map(f => fieldHtml(f, val[f.k])).join('');
  $('#recordForm').classList.remove('was-validated');
  renderImgPreview();
  const fi = $('#f_images');
  if (fi) fi.addEventListener('change', async () => {
    const files = Array.from(fi.files || []);
    for (const file of files) {
      if (formCtx.images.length >= 10) { toast('الحد الأقصى 10 صور لكل معاينة', 'warning'); break; }
      try { formCtx.images.push(await compressImage(file)); } catch (e) { toast('تعذّرت قراءة الصورة: ' + file.name, 'warning'); }
    }
    fi.value = ''; renderImgPreview();
  });
  formModal.show();
  setTimeout(() => { const first = $('#formBody input, #formBody textarea, #formBody select'); if (first && first.type !== 'file') first.focus(); }, 300);
}
function compressImage(file, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}
function submitForm(e) {
  e.preventDefault();
  const form = e.target;
  if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
  const { section, id } = formCtx, sc = SCHEMAS[section];
  const rec = {};
  sc.fields.forEach(f => {
    if (f.t === 'images') { rec.images = formCtx.images.slice(); return; }
    if (f.t === 'list') { rec.members = toList(form.elements[f.k].value); return; }
    if (f.t === 'weeks') { rec.weeks = toWeeks($$('#weeksRow input').map(el => el.value)); return; }
    if (f.t === 'cnotes') {
      const lines = [], colors = [];
      $$('#notesList .note-row').forEach(r => { const t = $('.note-text', r).value.replace(/\s*\n\s*/g, ' ').trim(); if (t) { lines.push(t); colors.push(r.dataset.color || ''); } });
      rec.notes = lines.join('\n'); rec.noteColors = colors; return;
    }
    const el = form.elements[f.k]; let v = el ? el.value.trim() : '';
    if (f.t === 'number') v = f.k === 'progress' ? clamp(num(v), 0, 100) : Math.max(0, num(v));
    rec[f.k] = v;
  });
  if (section === 'initiatives') {
    if (!rec.leader) rec.leader = 'غير محدد';
    if (!rec.unit) rec.unit = 'ملف';
    recalc(rec);
  }
  if (id != null) {
    const i = S[section].findIndex(r => String(r.id) === String(id));
    if (i >= 0) S[section][i] = Object.assign({}, S[section][i], rec);
  } else {
    rec.id = section === 'initiatives' ? (S.initiatives.reduce((m, x) => Math.max(m, x.id), 0) + 1) : uid();
    S[section].push(rec);
  }
  markDirty(); formModal.hide(); renderAll(); toast('تم الحفظ');
}
function deleteRecord(section, id) {
  const rec = S[section].find(r => String(r.id) === String(id)); if (!rec) return;
  let msg = 'هل تريد حذف هذا السجل نهائيًا؟';
  if (section === 'initiatives') {
    const linked = S.tasks.filter(x => String(x.initiativeId) === String(id)).length + S.field.filter(x => String(x.initiativeId) === String(id)).length + S.risks.filter(x => String(x.initiativeId) === String(id)).length;
    msg = `حذف المبادرة «${rec.name}»؟` + (linked ? `\nيوجد ${linked} سجل مرتبط بها (مهام/معاينات/مخاطر) وسيظهر مرتبطًا بـ«مبادرة محذوفة».` : '');
  }
  if (!confirm(msg)) return;
  S[section] = S[section].filter(r => String(r.id) !== String(id));
  markDirty(); renderAll(); toast('تم الحذف', 'secondary');
}
function updateProgress(id, value) {
  const it = S.initiatives.find(i => String(i.id) === String(id)); if (!it || it.targetCount > 0) return;
  it.progress = clamp(num(value), 0, 100);
  applyProgressRules(it);
  markDirty(); renderAll();
}

/* ---------- تفاصيل المبادرة ---------- */
let detailModal, detailId = null;
function showDetail(id) {
  const it = S.initiatives.find(i => String(i.id) === String(id)); if (!it) return;
  detailId = it.id;
  const total = sumWeeks(it), unit = esc(it.unit), idx = S.initiatives.indexOf(it);
  const row = (l, v) => `<div class="col-md-6"><div class="small text-muted">${l}</div><div class="fw-bold">${v || '<span class="text-muted">—</span>'}</div></div>`;
  $('#detailTitle').innerHTML = `<span class="text-muted">#${esc(it.code || idx + 1)}</span> ${esc(it.name)} <span class="badge ${initBadge(it.status)}">${esc(it.status)}</span>`;
  $('#detailBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-12"><div class="small text-muted">هدف المبادرة</div><div class="fw-bold">${esc(it.target) || '<span class="text-muted">—</span>'}</div></div>
      ${row('العدد المستهدف', it.targetCount > 0 ? fmtInt(it.targetCount) + ' ' + unit : '')}
      ${row('مدة المبادرة', esc(it.duration))}
      ${it.extension ? row('ممدّدة إلى', esc(it.extension)) : ''}
      ${row('رئيس الفريق', esc(it.leader))}
      ${row('أعضاء الفريق', it.members.map(m => `<span class="badge bg-light text-dark border fw-normal me-1">${esc(m)}</span>`).join(''))}
      ${row('المشرف العام على المبادرة', esc(it.supervisor))}
      ${row('مسؤول المتابعة', esc(it.follower))}
    </div>
    <table class="table table-sm table-bordered text-center mb-3">
      <thead class="table-light"><tr><th>الأسبوع</th><th>المنجز (${unit})</th></tr></thead>
      <tbody>${it.weeks.map((w, i) => `<tr><td>${weekLabel(i)}</td><td>${fmtInt(w)}</td></tr>`).join('')}</tbody>
      <tfoot class="table-light fw-bold">
        <tr><td>الإجمالي</td><td>${fmtInt(total)}</td></tr>
        ${it.targetCount > 0 ? `<tr><td>المتبقي</td><td>${fmtInt(Math.max(0, it.targetCount - total))}</td></tr>` : ''}
      </tfoot>
    </table>
    <div class="progress mb-1" style="height:12px"><div class="progress-bar bg-primary" style="width:${it.progress}%"></div></div>
    <div class="small text-muted mb-3">نسبة الإنجاز: ${fmtInt(it.progress)}%${it.targetCount > 0 ? ' (محسوبة من المنجز والمستهدف)' : ''}</div>
    <div class="small text-muted mb-1">الملاحظات</div>
    ${notesListHtml(it)}`;
  detailModal.show();
}

/* ---------- عارض الصور ---------- */
let viewer = { list: [], i: 0 };
function showViewer() {
  $('#imgView').src = viewer.list[viewer.i];
  $('#imgCount').textContent = (viewer.i + 1) + ' / ' + viewer.list.length;
}
function openViewer(id, idx) {
  const rec = S.field.find(r => String(r.id) === String(id)); if (!rec || !rec.images.length) return;
  viewer = { list: rec.images, i: clamp(+idx || 0, 0, rec.images.length - 1) };
  showViewer(); imgModal.show();
}

/* ---------- النسخ الاحتياطي ---------- */
function backupBlob(ts) {
  // تُسجَّل في الملف نفسه لحظة النسخ، ولا تُعتمد في الحالة إلا بعد نجاح الحفظ (noteBackup)
  const data = Object.assign({}, S, { meta: Object.assign({}, S.meta, { lastBackupAt: ts }) });
  const payload = { app: 'initiatives-pwa', schema: 1, exportedAt: ts, data };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}
const backupName = () => `مبادرات-${stampTime()}.json`;
function download(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function noteBackup(ts) { S.meta.lastBackupAt = ts; scheduleSave(); renderBackupAlert(); }
function exportBackup() {
  const ts = new Date().toISOString();
  download(backupBlob(ts), backupName()); noteBackup(ts);
  toast('تم تنزيل النسخة الاحتياطية — انقلها إلى مكان آمن (مجلد الشبكة أو فلاش).');
}
async function backupToFolder(forcePick) {
  if (!('showDirectoryPicker' in window)) return exportBackup();
  try {
    let h = forcePick ? null : await DB.get('backupDir');
    if (!h) { h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'initiatives-backup' }); await DB.set('backupDir', h); }
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('لم يُمنح إذن الكتابة في المجلد');
    const name = backupName(), ts = new Date().toISOString();
    const fh = await h.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(backupBlob(ts)); await w.close();
    noteBackup(ts); toast(`تم حفظ النسخة في المجلد المحدد (${h.name}): ${name}`);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e); toast('تعذّر الحفظ في المجلد: ' + (e.message || e) + ' — تم تنزيل الملف بدلًا من ذلك.', 'warning', 7000);
    exportBackup();
  }
}
/* ---------- الحفظ التلقائي في مجلد (مثل مجلد backup على سطح المكتب) ---------- */
const AUTO_FILE = 'مبادرات-آخر-نسخة-تلقائية.json';
let autoOn = false, autoTimer = null, autoWrittenFor = '-', autoBusy = false;
const canFolder = () => 'showDirectoryPicker' in window && window.isSecureContext;
function scheduleAutoBackup() {
  if (!autoOn || S.meta.updatedAt === autoWrittenFor) return;
  clearTimeout(autoTimer); autoTimer = setTimeout(() => autoBackupNow(false), 3000);
}
async function autoBackupNow(interactive) {
  if (!autoOn || autoBusy) return;
  autoBusy = true;
  try {
    const h = await DB.get('backupDir'); if (!h) throw new Error('لم يُحدَّد المجلد');
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && interactive) perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { renderAutoBar(true); return; }
    const ts = new Date().toISOString(), forUpd = S.meta.updatedAt, blob = backupBlob(ts);
    for (const name of [AUTO_FILE, `مبادرات-تلقائي-${stamp()}.json`]) {   // آخر نسخة + نسخة لكل يوم
      const fh = await h.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
    }
    autoWrittenFor = forUpd; S.meta.lastBackupAt = ts; renderBackupAlert(); renderAutoBar(false);
    schedulePdfSave(interactive ? 500 : 20000);
    await Store.save(S);
    setSaveState(`تم الحفظ + نسخة تلقائية في (${h.name}) ${hhmm()}`, 'text-success');
    if (interactive) toast(`تم الحفظ التلقائي في المجلد (${h.name})`);
  } catch (e) {
    console.error(e); renderAutoBar(true);
    if (interactive) toast('تعذّر الحفظ التلقائي: ' + (e.message || e), 'warning', 7000);
  } finally { autoBusy = false; }
}
function renderAutoBar(needs) {
  const bar = $('#autoBkBar'); if (bar) bar.classList.toggle('d-none', !(autoOn && needs));
  const lbl = $('#bkAutoLabel'); if (lbl) lbl.textContent = autoOn ? 'الحفظ التلقائي في مجلد: مُفعّل ✓ (اضغط للإيقاف)' : 'تفعيل الحفظ التلقائي في مجلد';
}
async function toggleAutoBackup() {
  if (autoOn) {
    if (!confirm('إيقاف الحفظ التلقائي في المجلد؟')) return;
    autoOn = false; await DB.set('autoBackup', false); renderAutoBar(false); toast('تم إيقاف الحفظ التلقائي', 'secondary'); return;
  }
  try {
    alert('اختر مجلد النسخ الاحتياطي (مثلاً مجلد backup على سطح المكتب).\nسيُحفظ فيه تلقائيًا بعد كل إدخال أو تعديل:\n• ملف «آخر نسخة» يُحدَّث دائمًا\n• ونسخة مستقلة لكل يوم');
    const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'initiatives-backup', startIn: 'desktop' });
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('لم يُمنح إذن الكتابة في المجلد');
    await DB.set('backupDir', h);
    alert('الآن اختر مجلد حفظ التقارير بصيغة PDF (مثلاً مجلد pdf على سطح المكتب).\nيُحفظ فيه تلقائيًا التقرير المفصّل الملوّن بعد التعديلات.');
    try {
      const hp = await window.showDirectoryPicker({ mode: 'readwrite', id: 'initiatives-pdf', startIn: 'desktop' });
      if ((await hp.requestPermission({ mode: 'readwrite' })) === 'granted') await DB.set('pdfDir', hp);
    } catch (e) { if (e && e.name !== 'AbortError') throw e; }
    await DB.set('autoBackup', true);
    autoOn = true; autoWrittenFor = '-'; pdfWrittenFor = '-'; await autoBackupNow(true);
  } catch (e) { if (e && e.name !== 'AbortError') toast('تعذّر تفعيل الحفظ التلقائي: ' + (e.message || e), 'danger', 7000); }
}
async function initAutoBackup() {
  if (!canFolder()) return;
  $('#bkAutoItem').classList.remove('d-none'); $('#bkPdfItem').classList.remove('d-none');
  try { autoOn = !!(await DB.get('autoBackup')) && !!(await DB.get('backupDir')); } catch (e) { autoOn = false; }
  renderAutoBar(false);
  if (autoOn) renderAutoBar(!(await dirOk('backupDir')) || ((await DB.get('pdfDir')) && !(await dirOk('pdfDir'))));
}
async function dirOk(key, ask) {
  const h = await DB.get(key); if (!h) return false;
  let p = await h.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
  return p === 'granted';
}
async function allowFolders() {
  try {
    const a = await dirOk('backupDir', true), b = (await DB.get('pdfDir')) ? await dirOk('pdfDir', true) : true;
    if (!a || !b) { toast('لم تُمنح الموافقة على أحد المجلدين — اضغط الزر مرة أخرى.', 'warning', 6000); renderAutoBar(true); return; }
    autoWrittenFor = '-'; pdfWrittenFor = '-'; await autoBackupNow(true);
  } catch (e) { toast('تعذّر: ' + (e.message || e), 'danger', 6000); }
}

/* ---------- إنشاء ملف PDF للتقرير المفصّل وحفظه في مجلد (بدون شاشة الطباعة) ---------- */
const PDF_LATEST = 'تقرير-المبادرات-آخر-نسخة.pdf';
let pdfTimer = null, pdfWrittenFor = '-', pdfBusy = false, fontCssPromise = null;
function schedulePdfSave(ms) {
  if (!autoOn) return;
  clearTimeout(pdfTimer); pdfTimer = setTimeout(() => savePdfToFolder(false), ms);
}
const blobToDataURL = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
async function fetchCssWithFonts(url) {
  const res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw new Error(res.status);
  let css = await res.text();
  const urls = [...new Set([...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map(m => m[2]))]
    .filter(u => !u.startsWith('data:') && /\.woff2(\?|$)/.test(u) && !/fa-(brands|regular|v4compat)/.test(u));
  await Promise.all(urls.map(async u => {
    try { const r = await fetch(new URL(u, url).href, { mode: 'cors' }); if (r.ok) css = css.split(u).join(await blobToDataURL(await r.blob())); } catch (e) {}
  }));
  return css;
}
function getFontCss() {   // خط Tajawal والأيقونات مضمّنة داخل الصفحات حتى تظهر في PDF كما في البرنامج
  if (!fontCssPromise) fontCssPromise = Promise.all([
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
  ].map(u => fetchCssWithFonts(u).catch(() => ''))).then(a => { const css = a.join('\n'); if (!css) fontCssPromise = null; return css; });
  return fontCssPromise;
}
const PDF_BREAKS = '.r-head,.r-summary,.r-charts,.r-goal,.r-grid,.r-members,.r-prog,.r-chart,.r-weeks,.r-tbl tr,.r-nl li,.r-sub,.r-title,.r-notes,.r-tbl';
async function blockToCanvas(html, W, scale, css) {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:-30000px;top:0;width:${W}px;`;
  box.innerHTML = `<div class="pdfwrap" dir="rtl">${html}</div>`;
  document.body.appendChild(box);
  const wrap = box.firstChild, top = wrap.getBoundingClientRect().top, H = Math.ceil(wrap.getBoundingClientRect().height);
  const breaks = [...new Set($$(PDF_BREAKS, wrap).map(e => Math.round(e.getBoundingClientRect().bottom - top + 1)))].sort((a, b) => a - b);
  const xhtml = new XMLSerializer().serializeToString(wrap);
  box.remove();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${css}]]></style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return { c, H, breaks };
}
async function reportPdfBlob() {
  const mm = 96 / 25.4, W = Math.round(190 * mm), H = Math.round(277 * mm), SC = 2, GAP = 14;
  const fonts = await getFontCss();
  const own = [...document.querySelectorAll('style')].filter(st => st.id !== 'pageSize').map(st => st.textContent).join('\n');
  const css = `${fonts}\n${own}\n*{box-sizing:border-box}.pdfwrap{width:${W}px;padding:0 3px;font-family:'Tajawal',sans-serif;font-size:12.5px;color:#2d3748;background:#fff;line-height:1.5}
    .pdfwrap h1,.pdfwrap h2{margin:0}.pdfwrap .r-foot{margin-top:0}${fonts.includes('Font Awesome') ? '' : '.pdfwrap i.fa-solid{display:none}'}`;
  const full = buildReport(S.initiatives, S.initiatives.length > 1);
  const tmp = document.createElement('div'); tmp.innerHTML = full;
  const cards = $$('.r-card', tmp), foot = $('.r-foot', tmp);
  cards.forEach(c => c.remove()); foot.remove();
  const blocks = [{ html: tmp.innerHTML, np: false }].concat(cards.map((c, i) => ({ html: c.outerHTML, np: i > 0 })));
  const pages = []; let pg = null, y = 0;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); pg = g; pages.push(c); y = 0; };
  const draw = (b, from, to) => { pg.drawImage(b.c, 0, from * SC, W * SC, (to - from) * SC, 0, y * SC, W * SC, (to - from) * SC); y += to - from; };
  for (const bl of blocks) {
    const b = await blockToCanvas(bl.html, W, SC, css);
    if (!pg || bl.np) newPage(); else if (y > 0) y += GAP;
    if (y + b.H > H && y > 0 && b.H <= H) newPage();
    let off = 0;
    while (off < b.H) {
      const avail = H - y;
      if (b.H - off <= avail) { draw(b, off, b.H); break; }
      let cut = b.breaks.filter(v => v > off + 40 && v <= off + avail).pop();
      if (!cut) { if (y > 0) { newPage(); continue; } cut = off + avail; }
      draw(b, off, cut); newPage(); off = cut;
    }
  }
  const f = await blockToCanvas(foot.outerHTML, W, SC, css);
  if (y + f.H + 10 > H) newPage();
  y = H - f.H; draw(f, 0, f.H);
  const jpegs = await Promise.all(pages.map(c => new Promise(ok => c.toBlob(async bl => ok({ bytes: new Uint8Array(await bl.arrayBuffer()), w: c.width, h: c.height }), 'image/jpeg', 0.9))));
  return makePdf(jpegs);
}
function makePdf(imgs) {   // ملف PDF بسيط: كل صفحة A4 صورة بهامش 10 مم
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const PW = 595.28, PH = 841.89, M = 28.35, n = imgs.length;
  push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));   // %PDF-1.4
  const obj = (id, body) => { offs[id] = len; push(`${id} 0 obj\n${body}\nendobj\n`); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  imgs.forEach((im, i) => {
    const p = 3 + i * 3, ct = `q ${(PW - 2 * M).toFixed(2)} 0 0 ${(PH - 2 * M).toFixed(2)} ${M} ${M} cm /Im0 Do Q`;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    obj(p + 1, `<< /Length ${ct.length} >>\nstream\n${ct}\nendstream`);
    offs[p + 2] = len;
    push(`${p + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
    push(im.bytes); push('\nendstream\nendobj\n');
  });
  const xref = len, total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1, total).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function savePdfToFolder(interactive) {
  if (pdfBusy) return;
  let h = await DB.get('pdfDir');
  try {
    if (!h) {
      if (!interactive) return;
      h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'initiatives-pdf', startIn: 'desktop' });
      await DB.set('pdfDir', h);
    }
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && interactive) perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { renderAutoBar(true); return; }
    if (!interactive && S.meta.updatedAt === pdfWrittenFor) return;
    pdfBusy = true; if (interactive) toast('جارٍ إنشاء ملف PDF...', 'info', 2500);
    const forUpd = S.meta.updatedAt, blob = await reportPdfBlob();
    for (const name of [PDF_LATEST, `تقرير-المبادرات-${stamp()}.pdf`]) {
      const fh = await h.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
    }
    pdfWrittenFor = forUpd;
    setSaveState(`تم الحفظ + نسخة تلقائية + PDF ${hhmm()}`, 'text-success');
    if (interactive) toast(`تم حفظ التقرير PDF في المجلد (${h.name})`);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e); if (interactive) toast('تعذّر حفظ ملف PDF: ' + (e.message || e), 'danger', 7000);
  } finally { pdfBusy = false; }
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const raw = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!raw || typeof raw !== 'object' || !['initiatives', 'tasks', 'field', 'financial', 'risks'].some(k => Array.isArray(raw[k]))) throw new Error('الملف ليس نسخة احتياطية صالحة لهذا البرنامج');
    const next = normalize(raw);
    const info = `المبادرات: ${next.initiatives.length} | المهام: ${next.tasks.length} | المعاينات: ${next.field.length} | المستحقات: ${next.financial.length} | المخاطر: ${next.risks.length}`;
    if (!confirm(`سيتم استبدال البيانات الحالية بمحتوى الملف:\n${info}\n\nيُحفظ نسخة تلقائية من بياناتك الحالية داخل المتصفح قبل الاستبدال. متابعة؟`)) return;
    try { await DB.set('preImportSnapshot', { at: new Date().toISOString(), state: S }); } catch (e) { /* غير حرج */ }
    S = next; S.meta.touched = true; markDirty(); renderAll(); toast('تم استيراد النسخة الاحتياطية بنجاح');
  } catch (e) { toast('فشل الاستيراد: ' + (e.message || e), 'danger', 7000); }
}
async function resetAll() {
  if (!confirm('سيتم حذف جميع البيانات المُدخلة (المهام والمعاينات والمستحقات والمخاطر) وإعادة المبادرات إلى وضعها الأولي بنسبة 0%.\n\nهل أخذت نسخة احتياطية؟ متابعة الحذف؟')) return;
  if (!confirm('تأكيد أخير: لا يمكن التراجع عن هذه العملية.')) return;
  try { await DB.set('preResetSnapshot', { at: new Date().toISOString(), state: S }); } catch (e) { /* غير حرج */ }
  S = emptyState(); markDirty(); S.meta.touched = false; renderAll(); toast('تم حذف البيانات', 'secondary');
}

/* ---------- تنبيه النسخ الاحتياطي ---------- */
function renderBackupAlert() {
  const box = $('#backupAlert'); if (!box) return;
  let dismissed = false; try { dismissed = sessionStorage.getItem('bkDismiss') === '1'; } catch (e) {}
  let msg = '';
  if (S.meta.touched) {
    if (!S.meta.lastBackupAt) msg = 'لم تأخذ نسخة احتياطية من بياناتك بعد. البيانات محفوظة في هذا المتصفح فقط.';
    else {
      const days = Math.floor((Date.now() - new Date(S.meta.lastBackupAt).getTime()) / 86400000);
      const changed = S.meta.updatedAt && new Date(S.meta.updatedAt) > new Date(S.meta.lastBackupAt);
      if (days >= BACKUP_WARN_DAYS && changed) msg = `مرّ ${days} يومًا على آخر نسخة احتياطية وهناك تعديلات جديدة.`;
    }
  }
  if (!msg || dismissed) { box.classList.add('d-none'); return; }
  $('#backupAlertText').textContent = msg; box.classList.remove('d-none');
}

/* ---------- تصدير CSV ---------- */
const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // حماية من حقن الصيغ في Excel
  return '"' + s.replace(/"/g, '""') + '"';
};
const CSV_DEFS = {
  initiatives: { name: 'المبادرات',
    get head() {
      const wk = Math.max(6, ...S.initiatives.map(i => i.weeks.length));
      return ['رقم المبادرة', 'اسم المبادرة', 'هدف المبادرة', 'العدد المستهدف', 'الوحدة', 'المدة', 'تمديد المدة إلى', 'رئيس الفريق', 'أعضاء الفريق']
        .concat(Array.from({ length: wk }, (_, i) => weekLabel(i)), ['الإجمالي المنجز', 'نسبة الإنجاز %', 'الحالة', 'الملاحظات', 'المشرف العام', 'مسؤول المتابعة']);
    },
    rows: () => {
      const wk = Math.max(6, ...S.initiatives.map(i => i.weeks.length));
      return S.initiatives.map((r, i) => [r.code || i + 1, r.name, r.target, r.targetCount || '', r.unit, r.duration, r.extension, r.leader, r.members.join('، ')]
        .concat(Array.from({ length: wk }, (_, k) => r.weeks[k] ?? ''), [sumWeeks(r), r.progress, r.status, r.notes, r.supervisor, r.follower]));
    } },
  tasks: { name: 'المهام', head: ['المبادرة', 'المهمة الفرعية', 'الموظف المسؤول', 'الإنتاجية اليومية', 'الحالة'],
    rows: () => S.tasks.map(r => [initName(r.initiativeId), r.title, r.employee, r.productivity, r.status]) },
  field: { name: 'المعاينات_الميدانية', head: ['رقم القطعة/العقد', 'المبادرة', 'الاستخدام', 'المساحة م²', 'حالة الإشغال', 'التقرير الميداني', 'عدد الصور'],
    rows: () => S.field.map(r => [r.parcelNo, initName(r.initiativeId), r.usage, r.area, r.occupancy, r.notes, r.images.length]) },
  financial: { name: 'التحصيل_المالي', head: ['رقم الملف/العقد', 'الجهة/المنتفع', 'نوع المستحق', 'المستحق ر.ع', 'المحصل ر.ع', 'المتبقي ر.ع', 'الحالة'],
    rows: () => S.financial.map(r => [r.fileNo, r.party, r.type, r.due.toFixed(3), r.collected.toFixed(3), Math.max(0, r.due - r.collected).toFixed(3), payState(r).txt]) },
  risks: { name: 'المخاطر', head: ['المبادرة', 'التحدي/الخطر', 'مستوى الخطورة', 'الإجراء التصحيحي', 'الحالة'],
    rows: () => S.risks.map(r => [initName(r.initiativeId), r.challenge, r.level, r.action, r.status]) }
};
function exportCSV(key) {
  const d = CSV_DEFS[key]; if (!d) return;
  const lines = [d.head.map(csvCell).join(',')].concat(d.rows().map(r => r.map(csvCell).join(',')));
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${d.name}-${stamp()}.csv`);
}

/* ---------- التقرير المفصّل الملوّن (طباعة / PDF) ---------- */
const STATUS_COLOR = { 'مكتملة': '#2f855a', 'قيد التنفيذ': '#2b6cb0', 'متأخرة': '#c53030', 'لم تبدأ': '#718096' };
let printMode = null;
/* رسوم SVG للتقرير (لا تعتمد على مكتبات خارجية وتُطبع بوضوح) */
const svgTxt = (x, y, t, a = '') => `<text x="${x}" y="${y}" ${a}>${esc(t)}</text>`;
function niceMax(v) { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
function chartProgressBars() {
  const L = S.initiatives, W = 640, rowH = 26, top = 8, H = top + L.length * rowH + 22, lab = 250, x0 = 40, bw = W - lab - x0 - 10;
  const short = t => t.length > 38 ? t.slice(0, 37) + '…' : t;
  let g = '';
  [0, 25, 50, 75, 100].forEach(v => { const x = x0 + bw - bw * v / 100; g += `<line x1="${x}" y1="${top}" x2="${x}" y2="${H - 20}" stroke="#e2e8f0"/>` + svgTxt(x, H - 6, v + '%', 'text-anchor="middle" font-size="10" fill="#718096"'); });
  L.forEach((it, i) => {
    const y = top + i * rowH, w = bw * it.progress / 100, col = STATUS_COLOR[it.status] || '#2b6cb0';
    g += svgTxt(W - 4, y + 17, (it.code || i + 1) + '. ' + short(it.name), 'text-anchor="start" direction="rtl" style="direction:rtl;unicode-bidi:embed" font-size="11.5" fill="#2d3748"');
    g += `<rect x="${x0}" y="${y + 5}" width="${bw}" height="15" rx="4" fill="#f1f5f9"/><rect x="${x0 + bw - w}" y="${y + 5}" width="${w}" height="15" rx="4" fill="${col}"/>`;
    g += svgTxt(x0 + bw - w - 4, y + 17, fmtInt(it.progress) + '%', `text-anchor="end" font-size="11" font-weight="700" fill="${col}"`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="r-svg">${g}</svg>`;
}
function chartStatusDonut() {
  const keys = ['مكتملة', 'قيد التنفيذ', 'متأخرة', 'لم تبدأ'], cnt = keys.map(k => S.initiatives.filter(i => i.status === k).length), tot = cnt.reduce((a, b) => a + b, 0) || 1;
  const cx = 85, cy = 85, r = 62, sw = 26, C = 2 * Math.PI * r; let off = 0, g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#edf2f7" stroke-width="${sw}"/>`;
  keys.forEach((k, i) => { if (!cnt[i]) return; const len = C * cnt[i] / tot;
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STATUS_COLOR[k]}" stroke-width="${sw}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`; off += len; });
  g += svgTxt(cx, cy + 4, S.initiatives.length, 'text-anchor="middle" font-size="24" font-weight="800" fill="#1a365d"') + svgTxt(cx, cy + 22, 'مبادرة', 'text-anchor="middle" font-size="11" fill="#718096"');
  keys.forEach((k, i) => { const y = 40 + i * 28;
    g += `<rect x="296" y="${y - 11}" width="14" height="14" rx="3" fill="${STATUS_COLOR[k]}"/>` + svgTxt(288, y, `${k}: ${cnt[i]}`, 'text-anchor="end" font-size="12.5" fill="#2d3748"'); });
  return `<svg viewBox="0 0 320 175" class="r-svg">${g}</svg>`;
}
function chartWeeks(it) {
  const wk = it.weeks, n = wk.length, W = 700, H = 190, padL = 46, padR = 12, padT = 22, padB = 28, cw = W - padL - padR, ch = H - padT - padB;
  if (!wk.some(v => v > 0)) return `<div class="r-nochart">لم يُسجَّل منجز أسبوعي بعد</div>`;
  const cum = []; wk.reduce((a, v, i) => (cum[i] = a + v), 0);
  let mx = Math.max(...cum, ...wk); const showT = it.targetCount > 0 && it.targetCount <= mx * 2.5;
  if (showT) mx = Math.max(mx, it.targetCount);
  mx = niceMax(mx * 1.1);
  const col = STATUS_COLOR[it.status] || '#2b6cb0', step = cw / n, bw = Math.min(46, step * .55);
  const X = i => padL + cw - step * (i + .5), Y = v => padT + ch - ch * v / mx;   // الأسبوع الأول على اليمين
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = mx * k / 4, y = Y(v); g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#edf2f7"/>` + svgTxt(padL - 6, y + 4, fmtInt(Math.round(v)), 'text-anchor="end" font-size="10" fill="#a0aec0"'); }
  if (showT) g += `<line x1="${padL}" y1="${Y(it.targetCount)}" x2="${W - padR}" y2="${Y(it.targetCount)}" stroke="#c53030" stroke-dasharray="6 4" stroke-width="1.5"/>` + svgTxt(padL + 4, Y(it.targetCount) - 5, 'المستهدف ' + fmtInt(it.targetCount), 'font-size="10.5" fill="#c53030" font-weight="700" text-anchor="start"');
  wk.forEach((v, i) => { const x = X(i), y = Y(v);
    g += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${padT + ch - y}" rx="4" fill="${col}" opacity=".85"/>`;
    if (v > 0) g += svgTxt(x, y - 4, fmtInt(v), `text-anchor="middle" font-size="11" font-weight="700" fill="${col}"`);
    g += svgTxt(x, H - 9, weekLabel(i).replace('الأسبوع ', 'أ. '), 'text-anchor="middle" font-size="10.5" fill="#4a5568"'); });
  const last = wk.reduce((a, v, i) => v > 0 ? i : a, 0), pts = cum.slice(0, last + 1).map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  g += `<polyline points="${pts}" fill="none" stroke="#d69e2e" stroke-width="2.5"/>` + cum.slice(0, last + 1).map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="#fff" stroke="#d69e2e" stroke-width="2"/>`).join('');
  g += svgTxt(X(last), Math.max(12, Y(cum[last]) - 10), 'التراكمي ' + fmtInt(cum[last]), 'text-anchor="middle" font-size="10.5" font-weight="700" fill="#b7791f"');
  return `<svg viewBox="0 0 ${W} ${H}" class="r-svg">${g}</svg>
    <div class="r-legend"><span><i style="background:${col}"></i>المنجز الأسبوعي</span><span><i style="background:#d69e2e"></i>المنجز التراكمي</span>${showT ? '<span><i style="background:#c53030"></i>العدد المستهدف</span>' : (it.targetCount > 0 ? `<span>المستهدف: ${fmtInt(it.targetCount)} ${esc(it.unit)}</span>` : '')}</div>`;
}
function reportCard(it) {
  const idx = S.initiatives.indexOf(it), total = sumWeeks(it), unit = esc(it.unit), col = STATUS_COLOR[it.status] || '#2b6cb0';
  const box = (l, v, ic) => `<div class="r-box"><div class="r-lbl"><i class="fa-solid ${ic}"></i> ${l}</div><div class="r-val">${v || '—'}</div></div>`;
  const tasks = S.tasks.filter(t => String(t.initiativeId) === String(it.id));
  const risks = S.risks.filter(r => String(r.initiativeId) === String(it.id));
  return `<section class="r-card" style="--sc:${col}">
    <div class="r-title">
      <span class="r-num">${esc(it.code || idx + 1)}</span>
      <h2>${esc(it.name)}</h2>
      <span class="r-status">${esc(it.status)}</span>
    </div>
    <div class="r-body">
      ${it.target ? `<div class="r-goal"><i class="fa-solid fa-bullseye"></i> <b>الهدف:</b> ${esc(it.target)}</div>` : ''}
      <div class="r-grid">
        ${box('العدد المستهدف', it.targetCount > 0 ? fmtInt(it.targetCount) + ' ' + unit : '', 'fa-flag-checkered')}
        ${box('إجمالي المنجز', fmtInt(total) + ' ' + unit, 'fa-circle-check')}
        ${box('المتبقي', it.targetCount > 0 ? fmtInt(Math.max(0, it.targetCount - total)) + ' ' + unit : '', 'fa-hourglass-half')}
        ${box('المدة', esc(it.duration) + (it.extension ? ` <small class="r-ext">ممدّدة إلى ${esc(it.extension)}</small>` : ''), 'fa-calendar-days')}
        ${box('رئيس الفريق', esc(it.leader), 'fa-user-tie')}
        ${box('المشرف العام', esc(it.supervisor), 'fa-user-shield')}
        ${box('مسؤول المتابعة', esc(it.follower), 'fa-user-check')}
        ${box('عدد الأعضاء', it.members.length ? fmtInt(it.members.length) : '', 'fa-users')}
      </div>
      ${it.members.length ? `<div class="r-members"><b>أعضاء الفريق:</b> ${it.members.map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="r-prog"><div class="r-prog-bar"><div style="width:${it.progress}%"></div></div><b>${fmtInt(it.progress)}%</b></div>
      <div class="r-chart"><div class="r-sub"><i class="fa-solid fa-chart-column"></i> المنجز الأسبوعي والتراكمي</div>${chartWeeks(it)}</div>
      <table class="r-weeks"><thead><tr>${it.weeks.map((_, i) => `<th>${weekLabel(i).replace('الأسبوع ', 'أ. ')}</th>`).join('')}<th class="r-tot">الإجمالي</th></tr></thead>
        <tbody><tr>${it.weeks.map(w => `<td class="${w > 0 ? 'on' : ''}">${fmtInt(w)}</td>`).join('')}<td class="r-tot">${fmtInt(total)}</td></tr></tbody></table>
      <div class="r-notes"><div class="r-sub"><i class="fa-solid fa-clipboard-list"></i> الملاحظات وسير العمل</div>${notesListHtml(it, 'note-list r-nl')}</div>
      ${tasks.length ? `<div class="r-sub mt"><i class="fa-solid fa-list-check"></i> المهام</div><table class="r-tbl"><tr><th>المهمة</th><th>الموظف</th><th>الإنتاجية</th><th>الحالة</th></tr>${tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.employee)}</td><td>${esc(t.productivity)}</td><td>${esc(t.status)}</td></tr>`).join('')}</table>` : ''}
      ${risks.length ? `<div class="r-sub mt"><i class="fa-solid fa-triangle-exclamation"></i> المخاطر والتحديات</div><table class="r-tbl"><tr><th>التحدي</th><th>الخطورة</th><th>الإجراء</th><th>الحالة</th></tr>${risks.map(r => `<tr><td>${esc(r.challenge)}</td><td>${esc(r.level)}</td><td>${esc(r.action)}</td><td>${esc(r.status)}</td></tr>`).join('')}</table>` : ''}
    </div></section>`;
}
function buildReport(list, withSummary) {
  const n = S.initiatives.length, avg = n ? Math.round(S.initiatives.reduce((a, i) => a + i.progress, 0) / n) : 0;
  const c = s => S.initiatives.filter(i => i.status === s).length;
  const sum = withSummary ? `<div class="r-summary">
      <div style="--k:#1a365d"><b>${n}</b>مبادرة</div><div style="--k:#2b6cb0"><b>${avg}%</b>متوسط الإنجاز</div>
      <div style="--k:#2f855a"><b>${c('مكتملة')}</b>مكتملة</div><div style="--k:#2b6cb0"><b>${c('قيد التنفيذ')}</b>قيد التنفيذ</div>
      <div style="--k:#c53030"><b>${c('متأخرة')}</b>متأخرة</div><div style="--k:#718096"><b>${c('لم تبدأ')}</b>لم تبدأ</div></div>
    <div class="r-charts"><div class="r-cbox"><div class="r-sub" style="--sc:#1a365d"><i class="fa-solid fa-chart-bar"></i> نسبة إنجاز كل مبادرة</div>${chartProgressBars()}</div>
      <div class="r-cbox"><div class="r-sub" style="--sc:#1a365d"><i class="fa-solid fa-chart-pie"></i> تصنيف حالة المبادرات</div>${chartStatusDonut()}</div></div>` : '';
  return `<header class="r-head"><div><h1>منظومة إدارة ومتابعة المبادرات الإستراتيجية</h1>
      <div>${list.length === 1 ? 'تقرير مبادرة' : 'التقرير المفصّل للمبادرات'}</div></div><div class="r-date">تاريخ التقرير<br><b>${stamp()}</b></div></header>
    ${sum}${list.map(reportCard).join('')}
    <footer class="r-foot"><div>إعداد وتصميم: <b>إبراهيم البلوشي</b></div></footer>`;
}
function preparePrint(mode) {
  printMode = mode;
  $('#printDate').textContent = 'تاريخ التقرير: ' + stamp();
  let list = S.initiatives, cls = 'print-full', landscape = true;
  if (mode === 'detailed') { cls = 'print-report'; landscape = false; }
  else if (mode.startsWith('one:')) { list = S.initiatives.filter(i => String(i.id) === mode.slice(4)); cls = 'print-report'; landscape = false; }
  $('#reportArea').innerHTML = buildReport(list, list.length > 1);
  document.body.classList.remove('print-full', 'print-report'); document.body.classList.add(cls);
  $('#pageSize').textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`;
  placeFooter(landscape);
}
// يدفع عبارة «إعداد وتصميم» إلى أسفل يسار الصفحة الأخيرة
function placeFooter(landscape) {
  const ra = $('#reportArea'), foot = $('.r-foot', ra); if (!foot) return;
  const mm = 96 / 25.4, W = (landscape ? 277 : 190) * mm, H = (landscape ? 190 : 277) * mm;
  const old = ra.getAttribute('style') || '';
  ra.setAttribute('style', `display:block;position:absolute;top:0;left:-20000px;width:${W}px;visibility:hidden;font-size:12.5px`);
  foot.style.marginTop = '0';
  const cards = $$('.r-card', ra), start = cards.length > 1 ? cards[cards.length - 1] : ra.firstElementChild;
  const used = foot.offsetTop - start.offsetTop, fh = foot.offsetHeight;
  ra.setAttribute('style', old);
  let gap = H - (used % H) - fh - 14;
  if (gap < 0) gap += H;          // لا تكفي المساحة: تنتقل لأسفل الصفحة التالية
  foot.style.marginTop = Math.max(18, Math.floor(gap)) + 'px';
}
function printReport(mode) { preparePrint(mode); setTimeout(() => window.print(), 60); }

/* ---------- ربط الأحداث ---------- */
function bindEvents() {
  formModal = new bootstrap.Modal($('#formModal'));
  imgModal = new bootstrap.Modal($('#imgModal'));
  detailModal = new bootstrap.Modal($('#detailModal'));
  $('#detailEdit').addEventListener('click', () => { detailModal.hide(); if (detailId != null) openForm('initiatives', detailId); });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-add],[data-edit],[data-del],[data-view],[data-csv],[data-rmimg],[data-detail],[data-addweek],[data-rmweek],[data-sw],[data-addnote],[data-rmnote],[data-mvnote],[data-report]');
    if (!t) return;
    if (t.dataset.sw != null) { setNoteColor(t.closest('.note-row'), t.dataset.sw); return; }
    if (t.hasAttribute('data-addnote')) {
      const list = $('#notesList'); list.insertAdjacentHTML('beforeend', noteRowHtml());
      $('.note-text', list.lastElementChild).focus(); return;
    }
    if (t.hasAttribute('data-rmnote')) {
      const row = t.closest('.note-row'), list = row.parentElement;
      if ($('.note-text', row).value.trim() && !confirm('حذف هذه الملاحظة؟')) return;
      row.remove(); if (!list.children.length) list.insertAdjacentHTML('beforeend', noteRowHtml()); return;
    }
    if (t.dataset.mvnote) {
      const row = t.closest('.note-row'), sib = t.dataset.mvnote === '-1' ? row.previousElementSibling : row.nextElementSibling;
      if (sib) t.dataset.mvnote === '-1' ? sib.before(row) : sib.after(row); return;
    }
    if (t.dataset.report) { printReport(t.dataset.report); return; }
    if (t.dataset.add) openForm(t.dataset.add, null);
    else if (t.dataset.edit) openForm(t.dataset.edit, t.dataset.id);
    else if (t.dataset.del) deleteRecord(t.dataset.del, t.dataset.id);
    else if (t.dataset.view) openViewer(t.dataset.view, t.dataset.idx);
    else if (t.dataset.csv) exportCSV(t.dataset.csv);
    else if (t.dataset.detail) showDetail(t.dataset.detail);
    else if (t.hasAttribute('data-addweek')) {
      const row = $('#weeksRow'), n = row.children.length;
      if (n >= MAX_WEEKS) return toast('الحد الأقصى ' + MAX_WEEKS + ' أسبوعًا', 'warning');
      row.insertAdjacentHTML('beforeend', weekInputHtml(n, 0));
      $('#f_w' + n).focus();
    } else if (t.hasAttribute('data-rmweek')) {
      const row = $('#weeksRow'), n = row.children.length;
      if (n <= 6) return toast('الحد الأدنى ستة أسابيع', 'warning');
      const last = row.lastElementChild;
      if (num($('input', last).value) > 0 && !confirm('في هذا الأسبوع رقم مُدخل وسيُحذف. متابعة؟')) return;
      last.remove();
    }
    else if (t.dataset.rmimg != null && formCtx) { formCtx.images.splice(+t.dataset.rmimg, 1); renderImgPreview(); }
  });
  document.addEventListener('change', e => {
    const p = e.target.closest('[data-progress]'); if (p) updateProgress(p.dataset.progress, p.value);
  });
  // لون مخصص للملاحظة
  document.addEventListener('input', e => { if (e.target.matches('[data-swc]')) setNoteColor(e.target.closest('.note-row'), e.target.value.toLowerCase()); });
  // لصق عدة أسطر → كل سطر ملاحظة مستقلة بنفس اللون
  document.addEventListener('paste', e => {
    const ta = e.target.closest && e.target.closest('.note-text'); if (!ta) return;
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    const parts = txt.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const row = ta.closest('.note-row'), c = row.dataset.color || '';
    ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + parts[0];
    let after = row;
    parts.slice(1).forEach(p => { after.insertAdjacentHTML('afterend', noteRowHtml(p, c)); after = after.nextElementSibling; });
  });
  document.addEventListener('input', e => {
    const s = e.target.closest('[data-search]'); if (!s) return;
    queries[s.dataset.search] = s.value;
    ({ tasks: renderTasks, field: renderField, financial: renderFinancial, risks: renderRisks })[s.dataset.search]();
  });
  $('#recordForm').addEventListener('submit', submitForm);
  $('#imgPrev').addEventListener('click', () => { viewer.i = (viewer.i - 1 + viewer.list.length) % viewer.list.length; showViewer(); });
  $('#imgNext').addEventListener('click', () => { viewer.i = (viewer.i + 1) % viewer.list.length; showViewer(); });

  $('#bkExport').addEventListener('click', exportBackup);
  $('#bkFolder').addEventListener('click', () => backupToFolder(false));
  $('#bkFolderChange').addEventListener('click', () => backupToFolder(true));
  $('#bkImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); });
  $('#bkReset').addEventListener('click', resetAll);
  $('#bkAuto').addEventListener('click', toggleAutoBackup);
  $('#autoBkBtn').addEventListener('click', allowFolders);
  $('#bkPdf').addEventListener('click', () => savePdfToFolder(true));
  $('#alertBackupNow').addEventListener('click', () => ('showDirectoryPicker' in window && window.isSecureContext) ? backupToFolder(false) : exportBackup());
  $('#alertDismiss').addEventListener('click', () => { try { sessionStorage.setItem('bkDismiss', '1'); } catch (e) {} renderBackupAlert(); });

  const doPrint = () => printReport('full');
  window.addEventListener('beforeprint', () => { if (!printMode) preparePrint('full'); barChart && barChart.resize(); pieChart && pieChart.resize(); });
  window.addEventListener('afterprint', () => { printMode = null; barChart && barChart.resize(); pieChart && pieChart.resize(); });
  $('#detailPrint').addEventListener('click', () => { if (detailId != null) printReport('one:' + detailId); });
  $('#printBtn').addEventListener('click', doPrint); $('#printBtn2').addEventListener('click', doPrint);

  if ('showDirectoryPicker' in window && window.isSecureContext) {
    $('#bkFolderItem').classList.remove('d-none'); $('#bkFolderChangeItem').classList.remove('d-none');
  }
  // إعادة رسم الرسوم عند الرجوع للوحة المؤشرات (لضمان الأبعاد الصحيحة)
  $('#dashboard-tab').addEventListener('shown.bs.tab', () => { barChart && barChart.resize(); pieChart && pieChart.resize(); });
}

/* ---------- التشغيل ---------- */
// إن تعذّر تحميل Bootstrap (مثلاً أول تشغيل بدون إنترنت أو حجب الموقع) لا يتوقف البرنامج عن العرض
function ensureLibs() {
  if (typeof bootstrap !== 'undefined') return;
  window.bootstrap = { Modal: class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); this.el.style.display = 'block'; } hide() { this.el.classList.remove('show'); this.el.style.display = 'none'; } } };
  const box = $('#loadError'); box.classList.remove('d-none');
  $('.alert', box).textContent = 'تعذّر تحميل مكتبات التصميم من الإنترنت (Bootstrap). افتح البرنامج مرة واحدة على الأقل وأنت متصل بالإنترنت ليحفظها الجهاز، ثم أعد تحميل الصفحة.';
}

async function init() {
  ensureLibs();
  bindEvents();
  let loaded = null, failed = false;
  try { loaded = await Store.load(); }
  catch (e) {
    failed = true; canSave = false;
    const box = $('#loadError'); box.classList.remove('d-none');
    $('.alert', box).textContent = 'تعذّر تحميل البيانات: ' + (e.message || e) + ' — تم إيقاف الحفظ لحماية بياناتك الأصلية. أعد تحميل الصفحة.';
  }
  S = normalize(loaded);
  if (!loaded && !failed) scheduleSave();
  renderAll();
  if (!failed) initAutoBackup().catch(e => console.warn('autoBackup:', e));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // بعض المكتبات الخارجية قد تتأخر: نعيد رسم الرسوم عند اكتمال التحميل
  window.addEventListener('load', renderCharts);
}
document.addEventListener('DOMContentLoaded', init);

/* ---------- تسجيل الـ Service Worker وزر التثبيت ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err)); });
}
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; $('#installBtn').classList.remove('d-none');
});
document.addEventListener('DOMContentLoaded', () => {
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').classList.add('d-none');
  });
});
window.addEventListener('appinstalled', () => $('#installBtn').classList.add('d-none'));
