// Хранилище дней: IndexedDB в браузере пользователя. У каждого аккаунта своя база
// (гость — 'artech-diary', аккаунт Google — 'artech-diary-<id>'). На сервер ничего не уходит.
// Если IndexedDB недоступен, работаем в памяти (данные пропадут после перезагрузки).

const STORE = 'days';
let dbName = 'artech-diary';
let dbPromise = null;
const memory = new Map();
let useMemory = false;

export function useDatabase(name) {
  if (name === dbName) return;
  dbName = name;
  dbPromise = null;
  memory.clear();
  useMemory = false;
}

export const currentDatabase = () => dbName;

function openDb(name = dbName) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: 'id' });
          st.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function open() {
  if (!dbPromise) {
    dbPromise = openDb().then((db) => {
      if (!db) useMemory = true;
      return db;
    });
  }
  return dbPromise;
}

const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

const tx = (db, mode) => db.transaction(STORE, mode).objectStore(STORE);

export async function saveDay(day) {
  const db = await open();
  if (useMemory || !db) { memory.set(day.id, day); return day; }
  try {
    await wrap(tx(db, 'readwrite').put(day));
  } catch (e) {
    console.warn('IndexedDB put failed, memory fallback', e);
    useMemory = true;
    memory.set(day.id, day);
  }
  return day;
}

export async function getDay(id) {
  const db = await open();
  if (useMemory || !db) return memory.get(id) || null;
  return (await wrap(tx(db, 'readonly').get(id))) || memory.get(id) || null;
}

export async function listDays() {
  const db = await open();
  let all = [];
  if (!useMemory && db) {
    try { all = await wrap(tx(db, 'readonly').getAll()); } catch (e) { all = []; }
  }
  for (const d of memory.values()) if (!all.find((x) => x.id === d.id)) all.push(d);
  return all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
}

export async function deleteDay(id) {
  const db = await open();
  memory.delete(id);
  if (!useMemory && db) await wrap(tx(db, 'readwrite').delete(id));
}

export async function deleteAllDays() {
  const db = await open();
  memory.clear();
  if (!useMemory && db) await wrap(tx(db, 'readwrite').clear());
}

// Перенос дней из гостевого дневника в дневник аккаунта
export async function listDaysFrom(name) {
  const db = await openDb(name);
  if (!db) return [];
  try { return await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).getAll()); }
  catch (e) { return []; }
  finally { db.close(); }
}

export async function clearDatabase(name) {
  const db = await openDb(name);
  if (!db) return;
  try { await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).clear()); }
  finally { db.close(); }
}

export function storageMode() {
  return useMemory ? 'memory' : 'indexeddb';
}
