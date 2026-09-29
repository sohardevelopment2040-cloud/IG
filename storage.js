/* ============================================================
   طبقة التخزين — منظومة متابعة المبادرات
   حاليًا: التخزين داخل المتصفح (IndexedDB).
   عند جاهزية السيرفر: غيّر STORAGE_MODE إلى 'server' فقط.
   يجب أن يوفّر السيرفر العنوان API_URL بطريقتي:
     GET  -> يعيد JSON (أو 404 إذا لا توجد بيانات بعد)
     PUT  -> يستقبل JSON كاملًا ويحفظه
   ============================================================ */
const APP_CONFIG = {
  STORAGE_MODE: 'local',      // 'local' = داخل المتصفح | 'server' = على السيرفر
  API_URL: 'api/data'
};

/* ---------- IndexedDB ---------- */
const DB_NAME = 'initiatives-db', DB_STORE = 'kv', STATE_KEY = 'state';

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB غير مدعوم'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const rq = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const DB = { get: idbGet, set: idbSet };   // يُستخدم أيضًا لحفظ إعدادات مساعدة (مجلد النسخ الاحتياطي...)

/* ---------- التخزين المحلي ---------- */
const LocalAdapter = {
  async load() {
    try {
      const v = await idbGet(STATE_KEY);
      if (v) return v;
    } catch (e) { /* ننتقل إلى localStorage */ }
    try {
      const raw = localStorage.getItem('initiatives.state');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  async save(state) {
    try {
      await idbSet(STATE_KEY, state);
    } catch (e) {
      localStorage.setItem('initiatives.state', JSON.stringify(state));   // احتياط
    }
  }
};

/* ---------- التخزين على السيرفر (جاهز للتفعيل لاحقًا) ---------- */
const ServerAdapter = {
  async load() {
    const r = await fetch(APP_CONFIG.API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('تعذّر الاتصال بالسيرفر (' + r.status + ')');
    return r.json();
  },
  async save(state) {
    const r = await fetch(APP_CONFIG.API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!r.ok) throw new Error('تعذّر الحفظ على السيرفر (' + r.status + ')');
  }
};

const Store = APP_CONFIG.STORAGE_MODE === 'server' ? ServerAdapter : LocalAdapter;
