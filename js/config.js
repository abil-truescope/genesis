// Настройки развёртывания.

// Бэкенд: Supabase (Postgres + Auth + Storage), проект genesis-diary, регион eu-central-1 (Франкфурт).
// Publishable key не секрет: доступ к данным ограничен политиками RLS (каждый видит только своё).
export const SUPABASE_URL = 'https://jnpbvtrhodsypuwlftga.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_MmMyoqOj7v-8jhrb5GEVXg_rz0R7SEA';

// Вход через Google идёт через Supabase. Включите, когда провайдер Google настроен
// в Supabase (docs/GOOGLE_SIGNIN.md), — до этого кнопка Google скрыта.
export const GOOGLE_ENABLED = false;

export const APP_NAME = 'Дневник атмосферы';
// Куда писать по вопросам данных. Можно заменить на почту команды.
export const CONTACT_URL = 'https://github.com/abil-truescope/genesis/issues';
export const POLICY_VERSION = '2026-11-20c';
