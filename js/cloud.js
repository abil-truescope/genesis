// Синхронизация дневника с облаком (Supabase): таблица days + приватный бакет diary.
// Модель «сначала локально»: день сохраняется в браузере сразу, затем уходит в облако.
// Свой аудиофайл в облако не загружается (размер и авторские права) — он остаётся на устройстве.

import { getClient, currentUser } from './auth.js';
import { listDays, saveDay, getDay } from './db.js';

const BUCKET = 'diary';
let syncing = null;
const statusListeners = new Set();
let status = { state: 'idle', at: null, error: null };

export const syncStatus = () => status;
export function onSyncStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(s) { status = { ...status, ...s }; statusListeners.forEach((fn) => fn(status)); }

const folder = (uid, dayId) => `${uid}/${dayId}`;

function rowFromDay(day, uid, photoPaths, thumbPath) {
  const song = { ...day.song };
  delete song.blob; // файлы песен в облако не уходят
  return {
    user_id: uid,
    id: day.id,
    date: day.date,
    title: day.title,
    caption: day.caption || '',
    entry_text: day.text,
    page_no: day.pageNo || null,
    song,
    analysis: day.analysis || {},
    params: day.params,
    photo_paths: photoPaths,
    thumb_path: thumbPath,
    created_at: new Date(day.createdAt || Date.now()).toISOString(),
  };
}

export async function pushDay(day) {
  const u = currentUser();
  if (!u) return;
  const c = await getClient();
  const base = folder(u.sub, day.id);
  const photoPaths = [];
  for (let k = 0; k < day.photos.length; k++) {
    const path = `${base}/photo_${k + 1}.jpg`;
    const { error } = await c.storage.from(BUCKET).upload(path, day.photos[k], { upsert: true, contentType: day.photos[k].type || 'image/jpeg' });
    if (error) throw error;
    photoPaths.push(path);
  }
  let thumbPath = null;
  if (day.thumb) {
    thumbPath = `${base}/thumb.jpg`;
    const { error } = await c.storage.from(BUCKET).upload(thumbPath, day.thumb, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
  }
  const { data, error } = await c.from('days').upsert(rowFromDay(day, u.sub, photoPaths, thumbPath)).select('updated_at').single();
  if (error) throw error;
  day.syncedAt = data.updated_at;
  day.cloud = true;
  await saveDay(day);
}

async function download(c, path) {
  const { data, error } = await c.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

async function dayFromRow(c, row, local) {
  const photos = [];
  for (const p of row.photo_paths || []) photos.push(await download(c, p));
  const thumb = row.thumb_path ? await download(c, row.thumb_path).catch(() => null) : null;
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at) || Date.now(),
    date: row.date,
    text: row.entry_text,
    title: row.title,
    caption: row.caption,
    pageNo: row.page_no,
    song: { ...row.song, blob: local?.song?.blob || null },
    analysis: row.analysis,
    params: row.params,
    photos,
    thumb,
    syncedAt: row.updated_at,
    cloud: true,
  };
}

// Полная синхронизация: скачать новое из облака, отправить несинхронизированное с устройства
export function syncAll() {
  if (syncing) return syncing;
  syncing = (async () => {
    const u = currentUser();
    if (!u) return { pulled: 0, pushed: 0 };
    setStatus({ state: 'syncing', error: null });
    try {
      const c = await getClient();
      const { data: rows, error } = await c.from('days').select('*').order('date', { ascending: false });
      if (error) throw error;
      const local = await listDays();
      const byId = new Map(local.map((d) => [d.id, d]));
      let pulled = 0, pushed = 0;
      for (const row of rows) {
        const l = byId.get(row.id);
        if (!l || !l.syncedAt || Date.parse(row.updated_at) > Date.parse(l.syncedAt)) {
          await saveDay(await dayFromRow(c, row, l));
          pulled++;
        }
      }
      const cloudIds = new Set(rows.map((r) => r.id));
      for (const d of local) {
        if (!cloudIds.has(d.id)) {
          if (d.cloud && d.syncedAt) continue; // удалён на другом устройстве — не воскрешаем (см. ниже)
          await pushDay(d);
          pushed++;
        }
      }
      // дни, удалённые в облаке с другого устройства, убираем и локально
      const { deleteDay } = await import('./db.js');
      for (const d of local) if (d.cloud && d.syncedAt && !cloudIds.has(d.id)) await deleteDay(d.id);
      setStatus({ state: 'ok', at: Date.now() });
      return { pulled, pushed };
    } catch (e) {
      console.warn('Синхронизация не удалась', e);
      setStatus({ state: 'error', error: e.message || String(e) });
      throw e;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export async function deleteDayCloud(day) {
  const u = currentUser();
  if (!u || !day?.cloud) return;
  const c = await getClient();
  const paths = [...(day.photos || []).map((_, k) => `${folder(u.sub, day.id)}/photo_${k + 1}.jpg`), `${folder(u.sub, day.id)}/thumb.jpg`];
  await c.storage.from(BUCKET).remove(paths);
  const { error } = await c.from('days').delete().eq('id', day.id);
  if (error) throw error;
}

export async function deleteAllCloud() {
  const u = currentUser();
  if (!u) return;
  const c = await getClient();
  const local = await listDays();
  const { data: rows } = await c.from('days').select('id, photo_paths, thumb_path');
  const paths = (rows || []).flatMap((r) => [...(r.photo_paths || []), r.thumb_path].filter(Boolean));
  for (let i = 0; i < paths.length; i += 100) await c.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  const { error } = await c.from('days').delete().neq('id', '');
  if (error) throw error;
  return local.length;
}

export async function markLocalChange(id) {
  const d = await getDay(id);
  if (d) { d.syncedAt = null; await saveDay(d); }
}
