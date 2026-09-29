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
      weeks: [0, 0, 0, 0, 0, 0], notes: '', supervisor: '', follower: '', progress: 0, status: 'لم تبدأ'
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
      notes: String(x.notes ?? ''), supervisor: String(x.supervisor ?? ''), follower: String(x.follower ?? ''), progress: clamp(num(x.progress), 0, 100),
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
      { k: 'notes', l: 'الملاحظات', t: 'textarea' },
      { k: 'supervisor', l: 'المشرف العام على المبادرة', t: 'text' },
      { k: 'follower', l: 'مسؤول المتابعة', t: 'text' }
    ],
    blank: () => ({ code: '', name: '', target: '', targetCount: 0, unit: 'ملف', duration: '', extension: '', leader: '', members: [], weeks: [0, 0, 0, 0, 0, 0], status: 'لم تبدأ', progress: 0, notes: '', supervisor: '', follower: '' })
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
  formCtx = { section, id: rec ? rec.id : null, images: rec && rec.images ? rec.images.slice() : [] };
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
    <div class="small text-muted">الملاحظات</div>
    <div style="white-space:pre-wrap">${esc(it.notes) || '<span class="text-muted">—</span>'}</div>`;
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

/* ---------- ربط الأحداث ---------- */
function bindEvents() {
  formModal = new bootstrap.Modal($('#formModal'));
  imgModal = new bootstrap.Modal($('#imgModal'));
  detailModal = new bootstrap.Modal($('#detailModal'));
  $('#detailEdit').addEventListener('click', () => { detailModal.hide(); if (detailId != null) openForm('initiatives', detailId); });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-add],[data-edit],[data-del],[data-view],[data-csv],[data-rmimg],[data-detail],[data-addweek],[data-rmweek]');
    if (!t) return;
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
  $('#alertBackupNow').addEventListener('click', () => ('showDirectoryPicker' in window && window.isSecureContext) ? backupToFolder(false) : exportBackup());
  $('#alertDismiss').addEventListener('click', () => { try { sessionStorage.setItem('bkDismiss', '1'); } catch (e) {} renderBackupAlert(); });

  const doPrint = () => { $('#printDate').textContent = 'تاريخ التقرير: ' + stamp(); window.print(); };
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
