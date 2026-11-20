// Полное удаление аккаунта: фото в хранилище, записи дней, профиль и сам пользователь.
// Вызывается только самим пользователем (проверяется его JWT).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // удаляем все файлы пользователя: diary/<uid>/<dayId>/*
  const removed: string[] = [];
  const { data: folders } = await admin.storage.from('diary').list(user.id, { limit: 1000 });
  for (const f of folders ?? []) {
    const prefix = `${user.id}/${f.name}`;
    const { data: files } = await admin.storage.from('diary').list(prefix, { limit: 1000 });
    const paths = (files ?? []).map((x) => `${prefix}/${x.name}`);
    if (paths.length) {
      await admin.storage.from('diary').remove(paths);
      removed.push(...paths);
    }
  }

  // записи и профиль удалятся каскадом вместе с пользователем
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return json({ error: delErr.message }, 500);
  return json({ ok: true, removedFiles: removed.length });
});
